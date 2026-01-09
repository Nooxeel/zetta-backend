/**
 * Middleware de Rate Limiting reutilizable
 * Protege endpoints contra abuso y ataques de fuerza bruta
 */
import rateLimit from 'express-rate-limit'

/**
 * Rate limiter para endpoints de autenticación
 * Muy restrictivo para prevenir ataques de fuerza bruta
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por ventana
  message: { 
    error: 'Demasiados intentos de autenticación. Por favor, intenta de nuevo en 15 minutos.',
    retryAfter: 15 * 60 // segundos
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Usar X-Forwarded-For para obtener IP real detrás de proxy
    return req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
  }
})

/**
 * Rate limiter para creación de cuentas
 * Más restrictivo, 1 hora de ventana
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // 3 cuentas por hora por IP
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
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 30, // 30 posts por hora
  message: { 
    error: 'Demasiados posts creados. Por favor, espera un momento.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Rate limiter para comentarios
 * Previene spam de comentarios
 */
export const commentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // 20 comentarios por 15 min
  message: { 
    error: 'Demasiados comentarios. Por favor, espera un momento.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Rate limiter para uploads
 * Muy restrictivo por el costo de almacenamiento
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 50, // 50 uploads por hora
  message: { 
    error: 'Demasiados archivos subidos. Por favor, espera un momento.',
    retryAfter: 60 * 60
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Rate limiter para mensajes
 * Previene spam en chat
 */
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // 30 mensajes por minuto
  message: { 
    error: 'Demasiados mensajes. Por favor, espera un momento.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Rate limiter general para APIs
 * Límite global por IP
 */
export const apiLimiter = rateLimit({
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
  windowMs: 60 * 1000, // 1 minuto
  max: 60, // 60 likes por minuto
  message: { 
    error: 'Demasiados likes. Por favor, espera un momento.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
})
