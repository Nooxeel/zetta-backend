/**
 * Middleware de Rate Limiting reutilizable
 * Protege endpoints contra abuso y ataques de fuerza bruta
 */
import rateLimit from 'express-rate-limit'
import { Request, Response, NextFunction } from 'express'
import type { AuthRequest } from './auth'

// IPs en whitelist que se saltan el rate limiting (desarrollo/admin)
const IP_WHITELIST = new Set([
  // IPs de desarrollo/administrador
  '127.0.0.1',
  '::1',
  'localhost',
  // Agregar IPs adicionales aquí
  ...(process.env.RATE_LIMIT_WHITELIST?.split(',').map(ip => ip.trim()) || []),
])

/**
 * Verifica si una IP está en la whitelist
 */
const isWhitelisted = (req: Request): boolean => {
  const ip = req.ip || req.headers['x-forwarded-for'] as string || ''
  const realIp = ip.split(',')[0].trim() // En caso de múltiples IPs en x-forwarded-for
  return IP_WHITELIST.has(realIp)
}

/**
 * Middleware para saltar rate limiting si la IP está en whitelist
 */
export const skipIfWhitelisted = (limiter: ReturnType<typeof rateLimit>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isWhitelisted(req)) {
      return next()
    }
    return limiter(req, res, next)
  }
}

// Opciones comunes para desactivar validaciones problemáticas
const commonOptions = {
  validate: false as const
}

/**
 * Genera una clave única combinando userId (si autenticado) con IP
 * Esto previene que usuarios autenticados sean afectados por otros usuarios
 * en la misma IP (NAT, proxies corporativos, etc.)
 */
const createKeyGenerator = (prefix: string = '') => {
  return (req: Request): string => {
    const authReq = req as AuthRequest
    const userId = authReq.userId || authReq.user?.userId
    const ip = req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
    
    // Si hay userId, usar combinación de prefix + userId
    // Si no hay userId (endpoints públicos), usar solo IP
    if (userId) {
      return `${prefix}user:${userId}`
    }
    return `${prefix}ip:${ip}`
  }
}

/**
 * Rate limiter para endpoints de autenticación
 * Muy restrictivo para prevenir ataques de fuerza bruta
 * Nota: Aquí solo usamos IP porque el usuario aún no está autenticado
 */
export const authLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por ventana
  message: { 
    error: 'Demasiados intentos de autenticación. Por favor, intenta de nuevo en 15 minutos.',
    retryAfter: 15 * 60 // segundos
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Para auth solo usar IP (usuario no autenticado aún)
    return req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
  }
})

/**
 * Rate limiter para creación de cuentas
 * Moderado para permitir registros mientras previene abuso
 */
export const registerLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // 10 cuentas por hora por IP (más permisivo para testing/demos)
  message: { 
    error: 'Demasiadas cuentas creadas desde esta IP. Por favor, intenta de nuevo en una hora.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Rate limiter para creación de posts
 * Moderado para prevenir spam
 */
export const createPostLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 30, // 30 posts por hora
  message: { 
    error: 'Demasiados posts creados. Por favor, espera un momento.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator('post:')
})

/**
 * Rate limiter para comentarios
 * Previene spam de comentarios
 */
export const commentLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // 20 comentarios por 15 min
  message: { 
    error: 'Demasiados comentarios. Por favor, espera un momento.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator('comment:')
})

/**
 * Rate limiter para uploads
 * Muy restrictivo por el costo de almacenamiento
 */
export const uploadLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 50, // 50 uploads por hora
  message: { 
    error: 'Demasiados archivos subidos. Por favor, espera un momento.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator('upload:')
})

/**
 * Rate limiter para mensajes
 * Previene spam en chat
 */
export const messageLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // 30 mensajes por minuto
  message: { 
    error: 'Demasiados mensajes. Por favor, espera un momento.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator('msg:')
})

/**
 * Rate limiter general para APIs
 * Límite global por IP
 */
export const apiLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300, // 300 requests por 15 min
  message: { 
    error: 'Demasiadas solicitudes. Por favor, espera un momento.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Saltar rate limit para health checks
    return req.path === '/health' || req.path === '/api/health'
  }
})

/**
 * Rate limiter para webhooks externos
 * Generoso pero protegido
 */
export const webhookLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000, // 1 minuto
  max: 100, // 100 webhooks por minuto
  message: { 
    error: 'Too many webhook requests',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Rate limiter para likes
 * Previene spam de likes
 */
export const likeLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000, // 1 minuto
  max: 60, // 60 likes por minuto
  message: { 
    error: 'Demasiados likes. Por favor, espera un momento.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Rate limiter para pagos
 * Muy restrictivo para prevenir abuso financiero
 */
export const paymentLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // 10 intentos de pago por hora
  message: { 
    error: 'Demasiados intentos de pago. Por favor, espera un momento.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator('payment:')
})

/**
 * Rate limiter para consultas de perfiles públicos
 * Previene enumeración y scraping
 */
export const publicProfileLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 consultas por 15 min
  message: { 
    error: 'Demasiadas consultas. Por favor, espera un momento.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Rate limiter para búsquedas
 * Previene abuso de endpoints de búsqueda
 */
export const searchLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // 30 búsquedas por minuto
  message: { 
    error: 'Demasiadas búsquedas. Por favor, espera un momento.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator('search:')
})

/**
 * Rate limiter para vistas de posts
 * Más generoso pero protege contra bots
 */
export const viewLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000, // 1 minuto
  max: 120, // 120 vistas por minuto
  message: { 
    error: 'Demasiadas solicitudes.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Utility: Validate and sanitize pagination parameters
 * Returns safe values with bounds checking
 * Uses Prisma naming convention: take (limit) and skip (offset)
 */
export function sanitizePagination(
  limit: string | undefined,
  offset: string | undefined,
  maxLimit: number = 50,
  defaultLimit: number = 10
): { take: number; skip: number } {
  const parsedLimit = parseInt(limit || '', 10)
  const parsedOffset = parseInt(offset || '', 10)
  
  return {
    take: Math.min(Math.max(1, isNaN(parsedLimit) ? defaultLimit : parsedLimit), maxLimit),
    skip: Math.max(0, isNaN(parsedOffset) ? 0 : parsedOffset)
  }
}
