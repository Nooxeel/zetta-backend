import { Router, Request, Response } from 'express'
import dbManager from '../lib/db'

const router = Router()

/** GET /api/health — basic health check */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'zetta-reports-api',
    timestamp: new Date().toISOString(),
    databases: dbManager.getRegisteredNames(),
  })
})

/** GET /api/health/db — test all database connections */
router.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const results = await dbManager.testAllConnections()
    const allOk = Object.values(results).every(r => r.ok)
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      databases: results,
    })
  } catch (error: any) {
    res.status(500).json({ status: 'error', error: error.message })
  }
})

export default router
