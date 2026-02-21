import { Router, Request, Response } from 'express'
import dbManager from '../lib/db'

const router = Router()

/**
 * GET /api/databases
 * 
 * List all registered database connections and their status.
 */
router.get('/', async (_req: Request, res: Response) => {
  const names = dbManager.getRegisteredNames()
  res.json({
    databases: names,
    count: names.length,
  })
})

/**
 * GET /api/databases/:name/test
 * 
 * Test connectivity to a specific database.
 */
router.get('/:name/test', async (req: Request, res: Response) => {
  const name = req.params.name as string
  try {
    const result = await dbManager.testConnection(name)
    res.status(result.ok ? 200 : 503).json(result)
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message })
  }
})

export default router
