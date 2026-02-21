import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { sanitizeIdentifier } from '../services/dynamicTable.service'
import { createLogger } from '../lib/logger'

const router = Router()
const logger = createLogger('Warehouse')

/**
 * GET /api/warehouse/tables
 *
 * List all synced tables available in the PostgreSQL warehouse.
 */
router.get('/tables', async (_req: Request, res: Response) => {
  try {
    const views = await prisma.syncedView.findMany({
      where: { status: 'SYNCED' },
      include: { source: true },
      orderBy: { sourceView: 'asc' },
    })

    res.json({
      tables: views.map(v => ({
        id: v.id,
        dbName: v.source.dbName,
        sourceSchema: v.sourceSchema,
        sourceView: v.sourceView,
        pgTableName: v.pgTableName,
        lastSyncAt: v.lastSyncAt?.toISOString() || null,
        lastSyncRows: v.lastSyncRows,
      })),
      count: views.length,
    })
  } catch (error: any) {
    logger.error('Failed to list warehouse tables:', error)
    res.status(500).json({ error: 'Failed to list warehouse tables', details: error.message })
  }
})

/**
 * GET /api/warehouse/columns
 *
 * Get columns for a synced table.
 * Query params: syncedViewId
 */
router.get('/columns', async (req: Request, res: Response) => {
  const { syncedViewId } = req.query

  if (!syncedViewId || typeof syncedViewId !== 'string') {
    res.status(400).json({ error: 'Missing required query param: syncedViewId' })
    return
  }

  try {
    const columns = await prisma.syncedColumn.findMany({
      where: { syncedViewId, removedInVersion: null },
      orderBy: { ordinalPosition: 'asc' },
    })

    res.json({
      columns: columns.map(c => ({
        column: c.columnName,
        sqlType: c.sqlServerType,
        pgType: c.pgType,
        nullable: c.isNullable,
      })),
      count: columns.length,
    })
  } catch (error: any) {
    logger.error('Failed to get warehouse columns:', error)
    res.status(500).json({ error: 'Failed to get warehouse columns', details: error.message })
  }
})

/**
 * GET /api/warehouse/data
 *
 * Query synced PostgreSQL data with pagination, search, and sorting.
 * Returns the same response shape as /api/views/data for frontend reuse.
 *
 * Query params:
 *   - syncedViewId: ID of the synced view
 *   - page: page number (default: 1)
 *   - pageSize: rows per page (default: 50, max: 500)
 *   - search: global search term (LIKE across text columns)
 *   - sortBy: column name to sort by
 *   - sortOrder: 'asc' or 'desc' (default: 'asc')
 */
router.get('/data', async (req: Request, res: Response) => {
  const {
    syncedViewId,
    page: pageParam,
    pageSize: pageSizeParam,
    search,
    sortBy,
    sortOrder: sortOrderParam,
  } = req.query

  if (!syncedViewId || typeof syncedViewId !== 'string') {
    res.status(400).json({ error: 'Missing required query param: syncedViewId' })
    return
  }

  const page = Math.max(1, parseInt(pageParam as string, 10) || 1)
  const pageSize = Math.min(500, Math.max(1, parseInt(pageSizeParam as string, 10) || 50))
  const offset = (page - 1) * pageSize
  const sortOrder = (typeof sortOrderParam === 'string' && sortOrderParam.toLowerCase() === 'desc') ? 'DESC' : 'ASC'

  try {
    // Fetch synced view metadata
    const syncedView = await prisma.syncedView.findUnique({
      where: { id: syncedViewId },
      include: {
        source: true,
        columns: { where: { removedInVersion: null }, orderBy: { ordinalPosition: 'asc' } },
      },
    })

    if (!syncedView || syncedView.status !== 'SYNCED') {
      res.status(404).json({ error: 'Synced view not found or not yet synced' })
      return
    }

    const { pgTableName, columns } = syncedView
    const columnNames = columns.map(c => sanitizeIdentifier(c.columnName))

    // Validate sortBy
    let validatedSortBy: string | null = null
    if (sortBy && typeof sortBy === 'string') {
      const sanitizedSort = sanitizeIdentifier(sortBy)
      if (!columnNames.includes(sanitizedSort)) {
        res.status(400).json({ error: `Invalid sortBy column: "${sortBy}"` })
        return
      }
      validatedSortBy = sanitizedSort
    }

    // Build search WHERE clause
    const textPgTypes = ['VARCHAR', 'TEXT', 'CHAR', 'XML', 'UUID']
    const textColumns = columns.filter(c => textPgTypes.some(t => c.pgType.toUpperCase().startsWith(t)))
    const searchTerm = (typeof search === 'string' && search.trim()) ? search.trim() : null

    let whereClause = ''
    const queryParams: any[] = []

    if (searchTerm && textColumns.length > 0) {
      const conditions = textColumns.map(c => {
        queryParams.push(`%${searchTerm}%`)
        return `"${sanitizeIdentifier(c.columnName)}"::TEXT ILIKE $${queryParams.length}`
      }).join(' OR ')
      whereClause = `WHERE (${conditions})`
    }

    // Build ORDER BY
    const orderClause = validatedSortBy
      ? `ORDER BY "${validatedSortBy}" ${sortOrder}`
      : 'ORDER BY _etl_id'

    // Data query
    const dataParamOffset = queryParams.length + 1
    queryParams.push(pageSize, offset)

    const dataResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM etl."${pgTableName}" ${whereClause} ${orderClause} LIMIT $${dataParamOffset} OFFSET $${dataParamOffset + 1}`,
      ...queryParams
    )

    // Count query
    const countParams = searchTerm && textColumns.length > 0
      ? queryParams.slice(0, queryParams.length - 2)
      : []

    const countResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::INTEGER AS total FROM etl."${pgTableName}" ${whereClause}`,
      ...countParams
    )
    const totalRows = countResult[0]?.total || 0

    // Strip internal ETL columns from response
    const cleanData = dataResult.map(row => {
      const { _etl_id, _etl_synced_at, ...rest } = row
      return rest
    })

    // Response matches /api/views/data shape for frontend reuse
    res.json({
      database: `${syncedView.source.dbName} (PostgreSQL)`,
      view: syncedView.sourceView,
      schema: 'etl',
      columns: columns.map(c => ({ column: sanitizeIdentifier(c.columnName), type: c.pgType })),
      data: cleanData,
      pagination: {
        page,
        pageSize,
        totalRows,
        totalPages: Math.ceil(totalRows / pageSize),
      },
    })
  } catch (error: any) {
    logger.error('Failed to query warehouse data:', error)
    res.status(500).json({ error: 'Failed to query warehouse data', details: error.message })
  }
})

export default router
