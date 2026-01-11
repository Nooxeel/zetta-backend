import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'

// Load environment variables
dotenv.config()

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

// Import scheduler
import { startScheduler, getSchedulerStatus } from './jobs/scheduler'

const app = express()
const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// Trust Railway proxy
app.set('trust proxy', 1)

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://appapacho.vercel.app',
      FRONTEND_URL
    ]
    // Allow all Vercel preview deployments
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))

// Security headers with helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow static files from other origins
  contentSecurityPolicy: false // Let frontend handle CSP
}))

app.use(express.json({ limit: '10mb' })) // Limit request body size
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

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
        console.warn(`⚠️  CORS blocked WebSocket connection from: ${origin}`)
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true
  }
})

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`)

  // Join user-specific room
  socket.on('join:user', (userId: string) => {
    socket.join(`user:${userId}`)
    console.log(`👤 User ${userId} joined their room (socket: ${socket.id})`)
    console.log(`   Rooms for this socket:`, Array.from(socket.rooms))
  })

  // Join conversation room
  socket.on('join:conversation', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`)
    console.log(`💬 Socket ${socket.id} joined conversation ${conversationId}`)
    console.log(`   Rooms for this socket:`, Array.from(socket.rooms))
  })

  // Leave conversation room
  socket.on('leave:conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`)
    console.log(`👋 Socket ${socket.id} left conversation ${conversationId}`)
  })

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`)
  })
})

// Make io available to routes
export { io }

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`🔌 WebSocket server ready`)

  // Iniciar scheduler de jobs
  startScheduler()
})

export default app
