import express from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'

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

// Import scheduler
import { startScheduler, getSchedulerStatus } from './jobs/scheduler'

const app = express()
const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// Trust Railway proxy
app.set('trust proxy', 1)

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? [FRONTEND_URL, 'https://apapacho-backend-production.up.railway.app'] : FRONTEND_URL,
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  
  // Iniciar scheduler de jobs
  startScheduler()
})

export default app
