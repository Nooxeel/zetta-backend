import { Router, Request, Response } from 'express'
import ExcelJS from 'exceljs'
import prisma from '../lib/prisma'
import { sanitizeIdentifier } from '../services/dynamicTable.service'
import { createLogger } from '../lib/logger'

const router = Router()
const logger = createLogger('Warehouse')

// ─── Filter Engine ──────────────────────────────────────

type FilterCategory = 'text' | 'number' | 'date' | 'boolean' | 'unsupported'

interface ColumnFilter {
  column: string
  operator: string
  value: string
  value2?: string
}

function getFilterCategory(pgType: string): FilterCategory {
  const upper = pgType.toUpperCase()
  if (['SMALLINT', 'INTEGER', 'BIGINT', 'REAL', 'DOUBLE PRECISION'].includes(upper) || upper.startsWith('NUMERIC')) {
    return 'number'
  }
  if (['DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ'].includes(upper)) {
    return 'date'
  }
  if (upper === 'BOOLEAN') {
    return 'boolean'
  }
  if (['VARCHAR', 'CHAR', 'TEXT', 'XML', 'UUID'].some(t => upper.startsWith(t))) {
    return 'text'
  }
  return 'unsupported'
}

const ALLOWED_OPERATORS: Record<FilterCategory, string[]> = {
  text: ['contains', 'equals', 'starts_with', 'ends_with', 'not_equals'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'],
  date: ['eq', 'before', 'after', 'between'],
  boolean: ['eq'],
  unsupported: [],
}

function buildFilterClauses(
  filters: ColumnFilter[],
  columnMeta: Array<{ columnName: string; pgType: string }>,
  startParamIndex: number
): { clauses: string[]; params: any[]; nextIndex: number } {
  const clauses: string[] = []
  const params: any[] = []
  let idx = startParamIndex

  for (const filter of filters) {
    const col = columnMeta.find(c => sanitizeIdentifier(c.columnName) === sanitizeIdentifier(filter.column))
    if (!col) continue

    const category = getFilterCategory(col.pgType)
    const colRef = `"${sanitizeIdentifier(col.columnName)}"`
    const castType = col.pgType

    switch (category) {
      case 'text':
        switch (filter.operator) {
          case 'contains':
            params.push(`%${filter.value}%`)
            clauses.push(`${colRef}::TEXT ILIKE $${idx++}`)
            break
          case 'equals':
            params.push(filter.value)
            clauses.push(`${colRef}::TEXT = $${idx++}`)
            break
          case 'starts_with':
            params.push(`${filter.value}%`)
            clauses.push(`${colRef}::TEXT ILIKE $${idx++}`)
            break
          case 'ends_with':
            params.push(`%${filter.value}`)
            clauses.push(`${colRef}::TEXT ILIKE $${idx++}`)
            break
          case 'not_equals':
            params.push(filter.value)
            clauses.push(`${colRef}::TEXT != $${idx++}`)
            break
        }
        break

      case 'number':
        switch (filter.operator) {
          case 'eq':
            params.push(filter.value)
            clauses.push(`${colRef} = $${idx++}::${castType}`)
            break
          case 'neq':
            params.push(filter.value)
            clauses.push(`${colRef} != $${idx++}::${castType}`)
            break
          case 'gt':
            params.push(filter.value)
            clauses.push(`${colRef} > $${idx++}::${castType}`)
            break
          case 'gte':
            params.push(filter.value)
            clauses.push(`${colRef} >= $${idx++}::${castType}`)
            break
          case 'lt':
            params.push(filter.value)
            clauses.push(`${colRef} < $${idx++}::${castType}`)
            break
          case 'lte':
            params.push(filter.value)
            clauses.push(`${colRef} <= $${idx++}::${castType}`)
            break
          case 'between':
            params.push(filter.value, filter.value2)
            clauses.push(`${colRef} BETWEEN $${idx++}::${castType} AND $${idx++}::${castType}`)
            break
        }
        break

      case 'date':
        switch (filter.operator) {
          case 'eq':
            params.push(filter.value)
            clauses.push(`${colRef}::DATE = $${idx++}::DATE`)
            break
          case 'before':
            params.push(filter.value)
            clauses.push(`${colRef} < $${idx++}::${castType}`)
            break
          case 'after':
            params.push(filter.value)
            clauses.push(`${colRef} > $${idx++}::${castType}`)
            break
          case 'between':
            params.push(filter.value, filter.value2)
            clauses.push(`${colRef} BETWEEN $${idx++}::${castType} AND $${idx++}::${castType}`)
            break
        }
        break

      case 'boolean':
        params.push(filter.value === 'true')
        clauses.push(`${colRef} = $${idx++}::BOOLEAN`)
        break
    }
  }

  return { clauses, params, nextIndex: idx }
}

// ─── Routes ─────────────────────────────────────────────

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
 * Get columns for a synced table (includes filterCategory for frontend).
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
        filterCategory: getFilterCategory(c.pgType),
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
 * Query synced PostgreSQL data with pagination, search, sorting, and column filters.
 *
 * Query params:
 *   - syncedViewId: ID of the synced view
 *   - page, pageSize, search, sortBy, sortOrder (existing)
 *   - filters: JSON array of { column, operator, value, value2? }
 */
router.get('/data', async (req: Request, res: Response) => {
  const {
    syncedViewId,
    page: pageParam,
    pageSize: pageSizeParam,
    search,
    sortBy,
    sortOrder: sortOrderParam,
    filters: filtersRaw,
  } = req.query

  if (!syncedViewId || typeof syncedViewId !== 'string') {
    res.status(400).json({ error: 'Missing required query param: syncedViewId' })
    return
  }

  // Parse filters
  let parsedFilters: ColumnFilter[] = []
  if (filtersRaw && typeof filtersRaw === 'string') {
    try {
      const arr = JSON.parse(filtersRaw)
      if (Array.isArray(arr)) parsedFilters = arr
    } catch {
      res.status(400).json({ error: 'Invalid filters JSON' })
      return
    }
  }

  const page = Math.max(1, parseInt(pageParam as string, 10) || 1)
  const pageSize = Math.min(500, Math.max(1, parseInt(pageSizeParam as string, 10) || 50))
  const offset = (page - 1) * pageSize
  const sortOrder = (typeof sortOrderParam === 'string' && sortOrderParam.toLowerCase() === 'desc') ? 'DESC' : 'ASC'

  try {
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

    // Validate filter columns and operators
    const columnMeta = columns.map(c => ({ columnName: c.columnName, pgType: c.pgType }))
    for (const f of parsedFilters) {
      const col = columnMeta.find(c => sanitizeIdentifier(c.columnName) === sanitizeIdentifier(f.column))
      if (!col) {
        res.status(400).json({ error: `Invalid filter column: "${f.column}"` })
        return
      }
      const category = getFilterCategory(col.pgType)
      if (!ALLOWED_OPERATORS[category].includes(f.operator)) {
        res.status(400).json({ error: `Invalid operator "${f.operator}" for column "${f.column}" (${category})` })
        return
      }
    }

    // Build WHERE conditions
    const allConditions: string[] = []
    const queryParams: any[] = []
    let paramIdx = 1

    // Global search
    const textPgTypes = ['VARCHAR', 'TEXT', 'CHAR', 'XML', 'UUID']
    const textColumns = columns.filter(c => textPgTypes.some(t => c.pgType.toUpperCase().startsWith(t)))
    const searchTerm = (typeof search === 'string' && search.trim()) ? search.trim() : null

    if (searchTerm && textColumns.length > 0) {
      const searchConditions = textColumns.map(c => {
        queryParams.push(`%${searchTerm}%`)
        return `"${sanitizeIdentifier(c.columnName)}"::TEXT ILIKE $${paramIdx++}`
      }).join(' OR ')
      allConditions.push(`(${searchConditions})`)
    }

    // Column-specific filters
    if (parsedFilters.length > 0) {
      const filterResult = buildFilterClauses(parsedFilters, columnMeta, paramIdx)
      queryParams.push(...filterResult.params)
      allConditions.push(...filterResult.clauses)
      paramIdx = filterResult.nextIndex
    }

    const whereClause = allConditions.length > 0 ? `WHERE ${allConditions.join(' AND ')}` : ''

    // ORDER BY
    const orderClause = validatedSortBy
      ? `ORDER BY "${validatedSortBy}" ${sortOrder}`
      : 'ORDER BY _etl_id'

    // Data query with pagination
    queryParams.push(pageSize, offset)
    const dataResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM etl."${pgTableName}" ${whereClause} ${orderClause} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...queryParams
    )

    // Count query (without pagination params)
    const countParams = queryParams.slice(0, queryParams.length - 2)
    const countResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::INTEGER AS total FROM etl."${pgTableName}" ${whereClause}`,
      ...countParams
    )
    const totalRows = countResult[0]?.total || 0

    // Strip internal ETL columns
    const cleanData = dataResult.map(row => {
      const { _etl_id, _etl_synced_at, ...rest } = row
      return rest
    })

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

/**
 * GET /api/warehouse/export
 *
 * Export all filtered data as CSV or XLSX (no pagination limit).
 * Same query params as /data except page/pageSize are ignored.
 * Additional: format=csv|xlsx (default csv)
 */
router.get('/export', async (req: Request, res: Response) => {
  const {
    syncedViewId,
    format: formatParam,
    search,
    sortBy,
    sortOrder: sortOrderParam,
    filters: filtersRaw,
  } = req.query

  if (!syncedViewId || typeof syncedViewId !== 'string') {
    res.status(400).json({ error: 'Missing required query param: syncedViewId' })
    return
  }

  const format = (typeof formatParam === 'string' && formatParam === 'xlsx') ? 'xlsx' : 'csv'
  const sortOrder = (typeof sortOrderParam === 'string' && sortOrderParam.toLowerCase() === 'desc') ? 'DESC' : 'ASC'

  let parsedFilters: ColumnFilter[] = []
  if (filtersRaw && typeof filtersRaw === 'string') {
    try {
      const arr = JSON.parse(filtersRaw)
      if (Array.isArray(arr)) parsedFilters = arr
    } catch {
      res.status(400).json({ error: 'Invalid filters JSON' })
      return
    }
  }

  try {
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
      if (columnNames.includes(sanitizedSort)) validatedSortBy = sanitizedSort
    }

    // Build WHERE
    const columnMeta = columns.map(c => ({ columnName: c.columnName, pgType: c.pgType }))
    const allConditions: string[] = []
    const queryParams: any[] = []
    let paramIdx = 1

    const textPgTypes = ['VARCHAR', 'TEXT', 'CHAR', 'XML', 'UUID']
    const textColumns = columns.filter(c => textPgTypes.some(t => c.pgType.toUpperCase().startsWith(t)))
    const searchTerm = (typeof search === 'string' && search.trim()) ? search.trim() : null

    if (searchTerm && textColumns.length > 0) {
      const searchConditions = textColumns.map(c => {
        queryParams.push(`%${searchTerm}%`)
        return `"${sanitizeIdentifier(c.columnName)}"::TEXT ILIKE $${paramIdx++}`
      }).join(' OR ')
      allConditions.push(`(${searchConditions})`)
    }

    if (parsedFilters.length > 0) {
      const filterResult = buildFilterClauses(parsedFilters, columnMeta, paramIdx)
      queryParams.push(...filterResult.params)
      allConditions.push(...filterResult.clauses)
      paramIdx = filterResult.nextIndex
    }

    const whereClause = allConditions.length > 0 ? `WHERE ${allConditions.join(' AND ')}` : ''
    const orderClause = validatedSortBy ? `ORDER BY "${validatedSortBy}" ${sortOrder}` : 'ORDER BY _etl_id'

    // Query ALL data (max 50,000 rows)
    queryParams.push(50000)
    const dataResult: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM etl."${pgTableName}" ${whereClause} ${orderClause} LIMIT $${paramIdx}`,
      ...queryParams
    )

    // Strip internal columns
    const cleanData = dataResult.map(row => {
      const { _etl_id, _etl_synced_at, ...rest } = row
      return rest
    })

    const exportColumns = columns.map(c => sanitizeIdentifier(c.columnName))
    const fileName = `${syncedView.sourceView}_${new Date().toISOString().slice(0, 10)}`

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet(syncedView.sourceView.slice(0, 31))

      // Header row
      sheet.columns = exportColumns.map(col => ({ header: col, key: col, width: 20 }))

      // Style header
      sheet.getRow(1).font = { bold: true }
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }

      // Data rows
      for (const row of cleanData) {
        sheet.addRow(row)
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`)
      await workbook.xlsx.write(res)
      res.end()
    } else {
      // CSV
      const csvHeader = exportColumns.join(',')
      const csvRows = cleanData.map(row =>
        exportColumns.map(col => {
          const val = (row as any)[col]
          if (val === null || val === undefined) return ''
          const str = String(val)
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        }).join(',')
      )

      const csv = [csvHeader, ...csvRows].join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`)
      res.send('\uFEFF' + csv) // BOM for Excel UTF-8
    }

    logger.info(`Exported ${cleanData.length} rows from ${syncedView.sourceView} as ${format}`)
  } catch (error: any) {
    logger.error('Failed to export warehouse data:', error)
    res.status(500).json({ error: 'Failed to export data', details: error.message })
  }
})

export default router
