/**
 * Sistema de caché en memoria simple
 * Para queries frecuentes como perfiles de creador, tiers, etc.
 * 
 * Nota: En producción con múltiples instancias, considerar Redis
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CacheOptions {
  ttlMs?: number; // Time to live en milisegundos
  maxSize?: number; // Máximo número de entradas
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutos por defecto
const DEFAULT_MAX_SIZE = 1000;

class MemoryCache<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttlMs: number;
  private maxSize: number;

  constructor(options: CacheOptions = {}) {
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this.maxSize = options.maxSize || DEFAULT_MAX_SIZE;
  }

  /**
   * Obtiene un valor del caché
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Verificar si expiró
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Guarda un valor en el caché
   */
  set(key: string, data: T, ttlMs?: number): void {
    // Si llegamos al límite, eliminar las entradas más antiguas
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs || this.ttlMs),
    });
  }

  /**
   * Elimina un valor del caché
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalida entradas que coinciden con un patrón
   */
  invalidatePattern(pattern: string): number {
    let count = 0;
    const regex = new RegExp(pattern);
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }

  /**
   * Limpia todo el caché
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Obtiene o ejecuta una función si no está en caché
   */
  async getOrSet<R extends T>(
    key: string,
    fetcher: () => Promise<R>,
    ttlMs?: number
  ): Promise<R> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached as R;
    }

    const data = await fetcher();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Estadísticas del caché
   */
  stats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }

  /**
   * Elimina la entrada más antigua
   */
  private evictOldest(): void {
    // Map mantiene orden de inserción, así que la primera es la más antigua
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }

  /**
   * Limpia entradas expiradas (llamar periódicamente)
   */
  cleanup(): number {
    let count = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        count++;
      }
    }
    
    return count;
  }
}

// Cachés específicos por tipo de dato
export const creatorCache = new MemoryCache({
  ttlMs: 5 * 60 * 1000, // 5 minutos
  maxSize: 500,
});

export const tiersCache = new MemoryCache({
  ttlMs: 10 * 60 * 1000, // 10 minutos (cambian menos frecuentemente)
  maxSize: 200,
});

export const userCache = new MemoryCache({
  ttlMs: 2 * 60 * 1000, // 2 minutos
  maxSize: 500,
});

// Limpieza periódica cada 5 minutos
setInterval(() => {
  creatorCache.cleanup();
  tiersCache.cleanup();
  userCache.cleanup();
}, 5 * 60 * 1000);

// Export factory para crear cachés personalizados
export function createCache<T>(options?: CacheOptions): MemoryCache<T> {
  return new MemoryCache<T>(options);
}

export default MemoryCache;
