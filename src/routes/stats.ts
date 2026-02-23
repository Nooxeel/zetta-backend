import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { createLogger } from '../lib/logger'

const router = Router()
const logger = createLogger('Stats')

/**
 * GET /api/stats/summary
 *
 * Returns KPI summary data for the dashboard.
 */
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const [syncedViewsCount, totalUsers, lastSync, totalRowsResult] = await Promise.all([
      prisma.syncedView.count({ where: { status: 'SYNCED' } }),
      prisma.user.count(),
      prisma.syncedView.findFirst({
        where: { status: 'SYNCED', lastSyncAt: { not: null } },
        orderBy: { lastSyncAt: 'desc' },
        select: { lastSyncAt: true },
      }),
      prisma.syncedView.aggregate({
        where: { status: 'SYNCED' },
        _sum: { lastSyncRows: true },
      }),
    ])

    res.json({
      syncedViews: syncedViewsCount,
      totalUsers,
      lastSyncAt: lastSync?.lastSyncAt?.toISOString() || null,
      totalWarehouseRows: totalRowsResult._sum.lastSyncRows || 0,
    })
  } catch (error: any) {
    logger.error('Failed to get stats summary:', error)
    res.status(500).json({ error: 'Failed to get stats summary', details: error.message })
  }
})

/**
 * GET /api/stats/warehouse-overview
 *
 * Returns data for dashboard charts:
 * - Rows per synced view (bar chart)
 * - Sync history last 30 days (line chart)
 */
router.get('/warehouse-overview', async (_req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [viewsData, syncLogs] = await Promise.all([
      // Rows per synced view
      prisma.syncedView.findMany({
        where: { status: 'SYNCED' },
        select: {
          sourceView: true,
          lastSyncRows: true,
          lastSyncAt: true,
          lastSyncDurationMs: true,
        },
        orderBy: { lastSyncRows: 'desc' },
      }),

      // Sync logs last 30 days
      prisma.syncLog.findMany({
        where: {
          startedAt: { gte: thirtyDaysAgo },
          status: { in: ['COMPLETED', 'FAILED'] },
        },
        select: {
          status: true,
          rowsSynced: true,
          durationMs: true,
          startedAt: true,
        },
        orderBy: { startedAt: 'asc' },
      }),
    ])

    // Group sync logs by date
    const syncByDate: Record<string, { date: string; success: number; failed: number; totalRows: number }> = {}
    for (const log of syncLogs) {
      const date = log.startedAt.toISOString().slice(0, 10)
      if (!syncByDate[date]) {
        syncByDate[date] = { date, success: 0, failed: 0, totalRows: 0 }
      }
      if (log.status === 'COMPLETED') {
        syncByDate[date].success++
        syncByDate[date].totalRows += log.rowsSynced || 0
      } else {
        syncByDate[date].failed++
      }
    }

    res.json({
      viewsData: viewsData.map(v => ({
        name: v.sourceView.replace(/^VW_SHS_/, '').replace(/_/g, ' '),
        fullName: v.sourceView,
        rows: v.lastSyncRows || 0,
        lastSyncAt: v.lastSyncAt?.toISOString() || null,
        durationMs: v.lastSyncDurationMs || 0,
      })),
      syncHistory: Object.values(syncByDate),
    })
  } catch (error: any) {
    logger.error('Failed to get warehouse overview:', error)
    res.status(500).json({ error: 'Failed to get warehouse overview', details: error.message })
  }
})

export default router
