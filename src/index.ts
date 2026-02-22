import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import { createLogger } from './lib/logger'
import dbManager from './lib/db'
import prisma, { ensureEtlSchema } from './lib/prisma'

// Load environment variables
dotenv.config()

const logger = createLogger('Server')

// Register SQL Server databases from env vars
dbManager.registerFromEnv(['ESAABBIONET'])

// Import routes
import healthRoutes from './routes/health'
import reportsRoutes from './routes/reports'
import databasesRoutes from './routes/databases'
import viewsRoutes from './routes/views'
import etlRoutes from './routes/etl'
import warehouseRoutes from './routes/warehouse'

const app = express()
const PORT = process.env.PORT || 3001
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// Trust proxy (for cloud deployments)
app.set('trust proxy', 1)

// CORS
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      FRONTEND_URL,
    ].filter(Boolean)

    // Allow requests without origin (Postman, curl, mobile)
    if (!origin) {
      callback(null, true)
      return
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else if (origin && origin.endsWith('.vercel.app')) {
      callback(null, true) // Allow Vercel preview deployments
    } else if (process.env.NODE_ENV === 'development') {
      callback(null, true) // Allow all in dev
    } else {
      logger.warn(`CORS blocked request from: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
}))

// Compression
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false
    return compression.filter(req, res)
  },
  level: 6,
  threshold: 1024,
}))

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser())

// ─── Routes ────────────────────────────────────────────
app.use('/api', healthRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/databases', databasesRoutes)
app.use('/api/views', viewsRoutes)
app.use('/api/etl', etlRoutes)
app.use('/api/warehouse', warehouseRoutes)

// ─── Error handling ────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// ─── Start ─────────────────────────────────────────────
async function start() {
  await ensureEtlSchema()
  app.listen(PORT, () => {
    logger.info(`🚀 Zetta Reports API running on port ${PORT}`)
    logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`)
  })
}

start().catch((err) => {
  logger.error('Failed to start server:', err)
  process.exit(1)
})

// ─── Graceful shutdown ─────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...')
  await dbManager.closeAll()
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...')
  await dbManager.closeAll()
  await prisma.$disconnect()
  process.exit(0)
})

export default app
