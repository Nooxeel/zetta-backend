import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { syncView, SyncConflictError } from '../services/etl.service'
import { dropEtlTable } from '../services/dynamicTable.service'
import { ALLOWED_VIEWS } from './views'
import { createLogger } from '../lib/logger'

const router = Router()
const logger = createLogger('ETL Routes')

/**
 * POST /api/etl/sync
 *
 * Trigger a full sync for a SQL Server view → PostgreSQL.
 * Body: { db: string, schema?: string, view: string }
 */
router.post('/sync', async (req: Request, res: Response) => {
  const { db, schema, view } = req.body

  if (!db || !view || typeof db !== 'string' || typeof view !== 'string') {
    res.status(400).json({ error: 'Missing required body params: db, view' })
    return
  }

  const sourceSchema = (typeof schema === 'string' && schema) ? schema : 'dbo'

  try {
    const result = await syncView(db, sourceSchema, view)

    const syncedView = await prisma.syncedView.findFirst({
      where: {
        source: { dbName: db },
        sourceSchema,
        sourceView: view,
      },
      include: { source: true },
    })

    res.json({
      syncedView: syncedView ? formatSyncedView(syncedView) : null,
      result,
      message: `Sync completed: ${result.rowsSynced} rows in ${result.durationMs}ms`,
    })
  } catch (error: any) {
    if (error instanceof SyncConflictError) {
      res.status(409).json({ error: error.message })
      return
    }
    logger.error('Sync failed:', error)
    res.status(500).json({ error: 'Sync failed', details: error.message })
  }
})

/**
 * GET /api/etl/sync-all
 *
 * Sync ALL allowed views via Server-Sent Events (SSE).
 * Streams progress in real-time as each view completes.
 *
 * Query params:
 *   - db: database name (registered in dbManager)
 */
router.get('/sync-all', async (req: Request, res: Response) => {
  const { db } = req.query

  if (!db || typeof db !== 'string') {
    res.status(400).json({ error: 'Missing required query param: db' })
    return
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const views = ALLOWED_VIEWS.map(name => ({ schema: 'dbo', name }))
  const total = views.length

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  sendEvent({ type: 'start', total, views: views.map(v => v.name) })

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < views.length; i++) {
    const view = views[i]
    sendEvent({ type: 'progress', current: i + 1, total, view: view.name, status: 'syncing' })

    try {
      const result = await syncView(db, view.schema, view.name)
      successCount++
      sendEvent({
        type: 'progress',
        current: i + 1,
        total,
        view: view.name,
        status: 'success',
        rowsSynced: result.rowsSynced,
        durationMs: result.durationMs,
      })
    } catch (error: any) {
      failCount++
      sendEvent({
        type: 'progress',
        current: i + 1,
        total,
        view: view.name,
        status: 'failed',
        error: error.message,
      })
    }
  }

  sendEvent({ type: 'complete', total, successCount, failCount })
  res.end()
})

/**
 * GET /api/etl/status
 *
 * List all synced views with their current status.
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const views = await prisma.syncedView.findMany({
      include: { source: true },
      orderBy: { updatedAt: 'desc' },
    })

    res.json({
      views: views.map(formatSyncedView),
      count: views.length,
    })
  } catch (error: any) {
    logger.error('Failed to get ETL status:', error)
    res.status(500).json({ error: 'Failed to get ETL status', details: error.message })
  }
})

/**
 * GET /api/etl/status/:id
 *
 * Get detailed status for one synced view.
 */
router.get('/status/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string

  try {
    const view = await prisma.syncedView.findUnique({
      where: { id },
      include: {
        source: true,
        columns: { where: { removedInVersion: null }, orderBy: { ordinalPosition: 'asc' } },
      },
    })

    if (!view) {
      res.status(404).json({ error: 'Synced view not found' })
      return
    }

    res.json({
      view: {
        ...formatSyncedView(view),
        columns: view.columns.map((c: any) => ({
          columnName: c.columnName,
          sqlServerType: c.sqlServerType,
          pgType: c.pgType,
          isNullable: c.isNullable,
          ordinalPosition: c.ordinalPosition,
        })),
      },
    })
  } catch (error: any) {
    logger.error('Failed to get view status:', error)
    res.status(500).json({ error: 'Failed to get view status', details: error.message })
  }
})

/**
 * GET /api/etl/status/:id/logs
 *
 * Get sync log history for a synced view.
 */
router.get('/status/:id/logs', async (req: Request, res: Response) => {
  const id = req.params.id as string

  try {
    const logs = await prisma.syncLog.findMany({
      where: { syncedViewId: id },
      orderBy: { startedAt: 'desc' },
      take: 50,
    })

    res.json({
      logs: logs.map(l => ({
        id: l.id,
        status: l.status,
        rowsSynced: l.rowsSynced,
        durationMs: l.durationMs,
        error: l.error,
        schemaChanges: l.schemaChanges,
        startedAt: l.startedAt.toISOString(),
        completedAt: l.completedAt?.toISOString() || null,
      })),
    })
  } catch (error: any) {
    logger.error('Failed to get sync logs:', error)
    res.status(500).json({ error: 'Failed to get sync logs', details: error.message })
  }
})

/**
 * DELETE /api/etl/sync/:id
 *
 * Remove a synced view: drops the PG table and deletes all metadata.
 */
router.delete('/sync/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string

  try {
    const view = await prisma.syncedView.findUnique({ where: { id } })

    if (!view) {
      res.status(404).json({ error: 'Synced view not found' })
      return
    }

    // Drop the dynamic ETL table
    await dropEtlTable(view.pgTableName)

    // Delete metadata (cascades to columns and logs)
    await prisma.syncedView.delete({ where: { id } })

    logger.info(`Deleted synced view: ${view.pgTableName}`)
    res.json({ message: `Synced view "${view.sourceView}" deleted successfully` })
  } catch (error: any) {
    logger.error('Failed to delete synced view:', error)
    res.status(500).json({ error: 'Failed to delete synced view', details: error.message })
  }
})

// Helper to format SyncedView for API responses
function formatSyncedView(view: any) {
  return {
    id: view.id,
    dbName: view.source?.dbName || null,
    sourceSchema: view.sourceSchema,
    sourceView: view.sourceView,
    pgTableName: view.pgTableName,
    status: view.status,
    lastSyncAt: view.lastSyncAt?.toISOString() || null,
    lastSyncRows: view.lastSyncRows,
    lastSyncDurationMs: view.lastSyncDurationMs,
    lastError: view.lastError,
    schemaVersion: view.schemaVersion,
  }
}

export default router
