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

/**
 * Helper: resolve a source_view name to its pg_table_name.
 * Returns null if the view isn't synced yet.
 */
async function getPgTable(sourceView: string): Promise<string | null> {
  const sv = await prisma.syncedView.findFirst({
    where: { sourceView, status: 'SYNCED' },
    select: { pgTableName: true },
  })
  return sv ? `etl."${sv.pgTableName}"` : null
}

/**
 * GET /api/stats/business-kpis
 *
 * Returns business KPIs and chart data derived from
 * the synced warehouse views (pharma/healthcare domain).
 */
router.get('/business-kpis', async (_req: Request, res: Response) => {
  try {
    // Resolve table names dynamically
    const [tSaldos, tRpt01, tRpt02, tRpt03, tRpt04, tRpt05] = await Promise.all([
      getPgTable('VW_SHS_SALDOS_ENRIQUECIDO'),
      getPgTable('VW_SHS_RPT01_QTY_RECIBIDAS_MES_LINEA'),
      getPgTable('VW_SHS_RPT02_QTY_CONSUMIDAS_MES_LINEA'),
      getPgTable('VW_SHS_RPT03_TOP10_ROTACION_12M_LINEA'),
      getPgTable('VW_SHS_RPT04_QTY_VENCIDAS_MES_LINEA'),
      getPgTable('VW_SHS_RPT05_QTY_PROX_VENCER_LINEA'),
    ])

    // ── KPI Cards ───────────────────────────────────────
    // NOTE: PG columns are lowercase (no quotes needed)
    const kpiSaldos = tSaldos
      ? prisma.$queryRawUnsafe<any[]>(`
          SELECT
            COALESCE(SUM(existenciafisica), 0)             AS "totalStockFisico",
            COALESCE(SUM(disponible), 0)                   AS "totalStockDisponible",
            COUNT(DISTINCT codigoproducto)                  AS "productosUnicos",
            COUNT(DISTINCT lieq_cod) FILTER (WHERE lieq_cod IS NOT NULL) AS "lineasProducto"
          FROM ${tSaldos}
        `)
      : Promise.resolve([{ totalStockFisico: 0, totalStockDisponible: 0, productosUnicos: 0, lineasProducto: 0 }])

    const kpiProxVencer = tRpt05
      ? prisma.$queryRawUnsafe<any[]>(`
          SELECT COALESCE(SUM(fis_venceen_90), 0) AS "proxVencer90d"
          FROM ${tRpt05}
        `)
      : Promise.resolve([{ proxVencer90d: 0 }])

    const kpiVencidas = tRpt04
      ? prisma.$queryRawUnsafe<any[]>(`
          SELECT COALESCE(SUM(qtyvencidas_existenciafisica), 0) AS "vencidasUltimoMes"
          FROM ${tRpt04}
          WHERE mesvencimiento = (SELECT MAX(mesvencimiento) FROM ${tRpt04})
        `)
      : Promise.resolve([{ vencidasUltimoMes: 0 }])

    // ── Chart: Recibido vs Consumido por Mes ────────────
    const chartRecibidoConsumido = (tRpt01 && tRpt02)
      ? prisma.$queryRawUnsafe<any[]>(`
          SELECT
            COALESCE(r.mes, c.mes)                          AS "mes",
            COALESCE(r.recibido, 0)                         AS "recibido",
            COALESCE(c.consumido, 0)                        AS "consumido"
          FROM (
            SELECT mesmovimiento AS mes, SUM(qtyrecibidas) AS recibido
            FROM ${tRpt01}
            GROUP BY mesmovimiento
          ) r
          FULL OUTER JOIN (
            SELECT mesmovimiento AS mes, SUM(qtyconsumidas) AS consumido
            FROM ${tRpt02}
            GROUP BY mesmovimiento
          ) c ON r.mes = c.mes
          ORDER BY COALESCE(r.mes, c.mes)
        `)
      : Promise.resolve([])

    // ── Chart: Alertas de Vencimiento por Línea ─────────
    const chartAlertas = tRpt05
      ? prisma.$queryRawUnsafe<any[]>(`
          SELECT
            lieq_cod            AS "lineaCod",
            lieq_desc           AS "lineaDesc",
            COALESCE(fis_bucket_0_30, 0)   AS "bucket_0_30",
            COALESCE(fis_bucket_31_60, 0)  AS "bucket_31_60",
            COALESCE(fis_bucket_61_90, 0)  AS "bucket_61_90",
            COALESCE(fis_bucket_91_120, 0) AS "bucket_91_120",
            COALESCE(fis_bucket_121_150, 0) AS "bucket_121_150",
            COALESCE(fis_bucket_151_180, 0) AS "bucket_151_180"
          FROM ${tRpt05}
          WHERE lieq_cod IS NOT NULL
          ORDER BY COALESCE(fis_venceen_90, 0) DESC
        `)
      : Promise.resolve([])

    // ── Chart: Top 10 Rotación ──────────────────────────
    const chartRotacion = tRpt03
      ? prisma.$queryRawUnsafe<any[]>(`
          SELECT
            codigoproducto   AS "codigo",
            descripcion      AS "descripcion",
            lieq_desc        AS "lineaDesc",
            COALESCE(qtyconsumida_12m, 0) AS "qtyConsumida12M",
            rankingenlinea   AS "ranking"
          FROM ${tRpt03}
          ORDER BY qtyconsumida_12m DESC NULLS LAST
          LIMIT 10
        `)
      : Promise.resolve([])

    // ── Chart: Stock por Línea ──────────────────────────
    const chartStockLinea = tSaldos
      ? prisma.$queryRawUnsafe<any[]>(`
          SELECT
            lieq_cod  AS "lineaCod",
            lieq_desc AS "lineaDesc",
            COALESCE(SUM(existenciafisica), 0) AS "stockFisico",
            COALESCE(SUM(disponible), 0)       AS "stockDisponible"
          FROM ${tSaldos}
          WHERE lieq_cod IS NOT NULL
          GROUP BY lieq_cod, lieq_desc
          ORDER BY SUM(existenciafisica) DESC NULLS LAST
        `)
      : Promise.resolve([])

    // ── Chart: Historial de Vencidos ────────────────────
    const chartHistVencidos = tRpt04
      ? prisma.$queryRawUnsafe<any[]>(`
          SELECT
            mesvencimiento                                  AS "mes",
            COALESCE(SUM(qtyvencidas_existenciafisica), 0)  AS "vencidasFisica",
            COALESCE(SUM(qtyvencidas_disponible), 0)        AS "vencidasDisponible"
          FROM ${tRpt04}
          GROUP BY mesvencimiento
          ORDER BY mesvencimiento
        `)
      : Promise.resolve([])

    // Execute all in parallel
    const [
      saldosKpi, proxKpi, vencidasKpi,
      recConsData, alertasData, rotacionData, stockLineaData, histVencData,
    ] = await Promise.all([
      kpiSaldos, kpiProxVencer, kpiVencidas,
      chartRecibidoConsumido, chartAlertas, chartRotacion, chartStockLinea, chartHistVencidos,
    ])

    const s = saldosKpi[0] || {}

    // Format month labels
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    function formatMes(d: any): { mes: string; mesLabel: string } {
      if (!d) return { mes: '', mesLabel: '' }
      const date = new Date(d)
      const y = date.getFullYear()
      const m = date.getMonth()
      return {
        mes: `${y}-${String(m + 1).padStart(2, '0')}`,
        mesLabel: `${meses[m]} ${y}`,
      }
    }

    res.json({
      kpis: {
        totalStockFisico: Number(s.totalStockFisico) || 0,
        totalStockDisponible: Number(s.totalStockDisponible) || 0,
        productosUnicosEnStock: Number(s.productosUnicos) || 0,
        lineasProductoActivas: Number(s.lineasProducto) || 0,
        unidadesProxVencer90d: Number(proxKpi[0]?.proxVencer90d) || 0,
        unidadesVencidasUltimoMes: Number(vencidasKpi[0]?.vencidasUltimoMes) || 0,
      },
      charts: {
        recibidoVsConsumido: recConsData.map((r: any) => ({
          ...formatMes(r.mes),
          recibido: Number(r.recibido) || 0,
          consumido: Number(r.consumido) || 0,
        })),
        alertasVencimiento: alertasData.map((r: any) => ({
          lineaCod: r.lineaCod,
          lineaDesc: r.lineaDesc || r.lineaCod,
          bucket_0_30: Number(r.bucket_0_30) || 0,
          bucket_31_60: Number(r.bucket_31_60) || 0,
          bucket_61_90: Number(r.bucket_61_90) || 0,
          bucket_91_120: Number(r.bucket_91_120) || 0,
          bucket_121_150: Number(r.bucket_121_150) || 0,
          bucket_151_180: Number(r.bucket_151_180) || 0,
        })),
        top10Rotacion: rotacionData.map((r: any) => ({
          codigo: r.codigo,
          descripcion: r.descripcion || r.codigo,
          lineaDesc: r.lineaDesc || '',
          qtyConsumida12M: Number(r.qtyConsumida12M) || 0,
          ranking: Number(r.ranking) || 0,
        })),
        stockPorLinea: stockLineaData.map((r: any) => ({
          lineaCod: r.lineaCod,
          lineaDesc: r.lineaDesc || r.lineaCod,
          stockFisico: Number(r.stockFisico) || 0,
          stockDisponible: Number(r.stockDisponible) || 0,
        })),
        historialVencidos: histVencData.map((r: any) => ({
          ...formatMes(r.mes),
          vencidasFisica: Number(r.vencidasFisica) || 0,
          vencidasDisponible: Number(r.vencidasDisponible) || 0,
        })),
      },
    })
  } catch (error: any) {
    logger.error('Failed to get business KPIs:', error)
    res.status(500).json({ error: 'Failed to get business KPIs', details: error.message })
  }
})

export default router
