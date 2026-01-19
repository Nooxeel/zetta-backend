import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import path from 'path'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { createLogger } from './lib/logger'
import prisma from './lib/prisma'

// Load environment variables
dotenv.config()

// Logger para este módulo
const logger = createLogger('Server')

// Import routes
import authRoutes from './routes/auth'
import creatorRoutes from './routes/creator'
import uploadRoutes from './routes/upload'
import commentsRoutes from './routes/comments'
import favoritesRoutes from './routes/favorites'
import usersRoutes from './routes/users'
import postsRoutes from './routes/posts'
import balanceRoutes from './routes/balance'
import payoutsRoutes from './routes/payouts'
import webhooksRoutes from './routes/webhooks'
import adminRoutes from './routes/admin'
import messagesRoutes from './routes/messages'
import interestsRoutes from './routes/interests'
import discoverRoutes from './routes/discover'
import socialLinksRoutes from './routes/socialLinks'
import subscriptionsRoutes from './routes/subscriptions'
import rouletteRoutes from './routes/roulette'
import leaderboardRoutes from './routes/leaderboard'
import gamificationRoutes from './routes/gamification'
import blockedRoutes from './routes/blocked'
import promocodesRoutes from './routes/promocodes'
import broadcastsRoutes from './routes/broadcasts'
import watermarkRoutes from './routes/watermark'
import ageVerificationRoutes from './routes/age-verification'
import referralsRoutes from './routes/referrals'
import importRoutes from './routes/import'
import paymentsRoutes from './routes/payments'
import filesRoutes from './routes/files'
import cardsRoutes from './routes/cards'
import missionsRoutes from './routes/missions'

// Import scheduler
import { startScheduler, getSchedulerStatus } from './jobs/scheduler'

const app = express()
const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// SECURITY: Validate JWT_SECRET strength at startup
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  logger.error('CRITICAL: JWT_SECRET is not configured!')
  process.exit(1)
}

// In production, enforce strong secret
if (process.env.NODE_ENV === 'production') {
  if (JWT_SECRET.length < 32) {
    logger.error('CRITICAL: JWT_SECRET must be at least 32 characters in production!')
    process.exit(1)
  }
  if (JWT_SECRET.includes('change-this') || JWT_SECRET.includes('example') || JWT_SECRET.includes('secret-2024')) {
    logger.error('CRITICAL: JWT_SECRET appears to be a placeholder value!')
    process.exit(1)
  }
}

// Trust Railway proxy
app.set('trust proxy', 1)

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Lista de orígenes permitidos específicos
    const allowedOrigins = [
      'http://localhost:3000',
      'https://appapacho.vercel.app',
      FRONTEND_URL
    ].filter(Boolean)

    // Permitir requests sin origin (mobile apps, Postman, curl)
    if (!origin) {
      callback(null, true)
      return
    }

    // Verificar si el origen está en la lista permitida
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else if (process.env.NODE_ENV === 'development' && origin.endsWith('.vercel.app')) {
      // Solo en desarrollo: permitir preview deployments de Vercel
      logger.debug(`CORS: Permitiendo preview deployment: ${origin}`)
      callback(null, true)
    } else {
      logger.warn(`CORS blocked request from: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))

// Compresión gzip para respuestas
app.use(compression({
  filter: (req, res) => {
    // No comprimir si el cliente no lo soporta
    if (req.headers['x-no-compression']) {
      return false
    }
    // Usar la detección por defecto
    return compression.filter(req, res)
  },
  level: 6, // Balance entre velocidad y compresión (1-9)
  threshold: 1024 // Solo comprimir respuestas > 1KB
}))

// Security headers with helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow static files from other origins
  contentSecurityPolicy: false, // Let frontend handle CSP
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
  noSniff: true,
  frameguard: { action: 'deny' }
}))

app.use(express.json({ limit: '10mb' })) // Limit request body size
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser()) // Parse cookies for httpOnly JWT

// Protected file serving with access control
// Use /api/files/:creatorId/* for authenticated file access
app.use('/api/files', filesRoutes)

// Legacy static files route - only serves truly public files (avatars, covers)
// For backward compatibility during migration
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res, filePath) => {
    // Add cache headers for static files
    res.setHeader('Cache-Control', 'public, max-age=3600')
  }
}))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/creators', creatorRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/comments', commentsRoutes)
app.use('/api/favorites', favoritesRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/posts', postsRoutes)
app.use('/api/creator', balanceRoutes)
app.use('/api/payouts', payoutsRoutes)
app.use('/api/webhooks', webhooksRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/interests', interestsRoutes)
app.use('/api/discover', discoverRoutes)
app.use('/api/sociallinks', socialLinksRoutes)
app.use('/api/subscriptions', subscriptionsRoutes)
app.use('/api/roulette', rouletteRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/gamification', gamificationRoutes)
app.use('/api/creator/block', blockedRoutes)
app.use('/api/block', blockedRoutes)
app.use('/api/promocodes', promocodesRoutes)
app.use('/api/broadcasts', broadcastsRoutes)
app.use('/api/watermark', watermarkRoutes)
app.use('/api/age-verification', ageVerificationRoutes)
app.use('/api/referrals', referralsRoutes)
app.use('/api/import', importRoutes)
app.use('/api/payments/webpay', paymentsRoutes)
app.use('/api/cards', cardsRoutes)
app.use('/api/missions', missionsRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Scheduler status endpoint
app.get('/api/jobs/status', (req, res) => {
  res.json(getSchedulerStatus())
})

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

// Create HTTP server and attach Socket.IO
const httpServer = createServer(app)
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // SECURITY: Only allow specific domains, not all .vercel.app domains
      const allowedOrigins = [
        'http://localhost:3000',
        'https://appapacho.vercel.app',
        FRONTEND_URL
      ].filter(Boolean) // Remove undefined/null values

      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        callback(null, true)
        return
      }

      // Check if origin is in allowlist
      if (allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        logger.warn(`CORS blocked WebSocket connection from: ${origin}`)
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true
  }
})

// WebSocket logger
const wsLogger = createLogger('WebSocket')

// SECURITY: WebSocket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1]
  
  if (!token) {
    wsLogger.warn(`Unauthenticated WebSocket connection attempt: ${socket.id}`)
    return next(new Error('Authentication required'))
  }
  
  try {
    const JWT_SECRET = process.env.JWT_SECRET
    if (!JWT_SECRET) {
      return next(new Error('Server configuration error'))
    }
    
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    socket.data.userId = decoded.userId
    socket.data.authenticated = true
    next()
  } catch (err) {
    wsLogger.warn(`Invalid JWT on WebSocket connection: ${socket.id}`)
    return next(new Error('Invalid or expired token'))
  }
})

// WebSocket connection handling
io.on('connection', (socket) => {
  const authenticatedUserId = socket.data.userId
  wsLogger.debug(`Authenticated client connected: ${socket.id} (user: ${authenticatedUserId})`)

  // Auto-join user to their own room on connection
  socket.join(`user:${authenticatedUserId}`)
  wsLogger.debug(`User ${authenticatedUserId} auto-joined their room`)

  // SECURITY: Validate user can only join their own room
  socket.on('join:user', (userId: string) => {
    if (userId !== authenticatedUserId) {
      wsLogger.warn(`User ${authenticatedUserId} attempted to join room for user ${userId}`)
      socket.emit('error', { message: 'Cannot join another user\'s room' })
      return
    }
    socket.join(`user:${userId}`)
    wsLogger.debug(`User ${userId} joined their room (socket: ${socket.id})`)
  })

  // SECURITY: Validate user is participant in conversation before joining
  socket.on('join:conversation', async (conversationId: string) => {
    try {
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          OR: [
            { participant1Id: authenticatedUserId },
            { participant2Id: authenticatedUserId }
          ]
        }
      })
      
      if (!conversation) {
        wsLogger.warn(`User ${authenticatedUserId} attempted to join unauthorized conversation ${conversationId}`)
        socket.emit('error', { message: 'Not authorized to join this conversation' })
        return
      }
      
      socket.join(`conversation:${conversationId}`)
      wsLogger.debug(`Socket ${socket.id} joined conversation ${conversationId}`)
    } catch (error) {
      wsLogger.error('Error validating conversation access:', error)
      socket.emit('error', { message: 'Failed to join conversation' })
    }
  })

  // Leave conversation room
  socket.on('leave:conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`)
    wsLogger.debug(`Socket ${socket.id} left conversation ${conversationId}`)
  })

  socket.on('disconnect', () => {
    wsLogger.debug(`Client disconnected: ${socket.id}`)
  })
})

// Make io available to routes
export { io }

httpServer.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`)
  logger.info(`WebSocket server ready`)

  // Iniciar scheduler de jobs
  startScheduler()
})

export default app
