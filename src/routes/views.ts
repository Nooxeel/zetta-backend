import { Router, Request, Response } from 'express'
import sql from 'mssql'
import ExcelJS from 'exceljs'
import dbManager from '../lib/db'
import { createLogger } from '../lib/logger'

const router = Router()
const logger = createLogger('Views')

// Whitelist of allowed views — only these are exposed via the API
export const ALLOWED_VIEWS: string[] = [
  'Kardex_Producto_Top_Periodo',
  'vw_detalle_recepcion_hh',
  'vw_encabezado_recepcion',
  'vw_max_lineaRecepcion_serie',
  'VW_SHS_KARDEX_ENRIQUECIDO',
  'VW_SHS_MAESTRO_PRODUCTOS_LIEQ',
  'VW_SHS_RPT01_QTY_RECIBIDAS_MES_LINEA',
  'VW_SHS_RPT02_QTY_CONSUMIDAS_MES_LINEA',
  'VW_SHS_RPT03_TOP10_ROTACION_12M_LINEA',
  'VW_SHS_RPT04_QTY_VENCIDAS_MES_LINEA',
  'VW_SHS_RPT05_QTY_PROX_VENCER_LINEA',
  'VW_SHS_SALDOS_ENRIQUECIDO',
  'VW_SHS_STOCK_POR_LOTE_DESDE_KARDEX',
]

// ─── Filter Engine (SQL Server) ─────────────────────────

type FilterCategory = 'text' | 'number' | 'date' | 'boolean' | 'unsupported'

interface ColumnFilter {
  column: string
  operator: string
  value: string
  value2?: string
}

function getSqlServerFilterCategory(sqlType: string): FilterCategory {
  switch (sqlType.toLowerCase()) {
    case 'varchar': case 'nvarchar': case 'char': case 'nchar':
    case 'text': case 'ntext': case 'uniqueidentifier': case 'xml':
      return 'text'
    case 'int': case 'bigint': case 'smallint': case 'tinyint':
    case 'decimal': case 'numeric': case 'float': case 'real':
    case 'money': case 'smallmoney':
      return 'number'
    case 'date': case 'datetime': case 'datetime2':
    case 'smalldatetime': case 'datetimeoffset': case 'time':
      return 'date'
    case 'bit':
      return 'boolean'
    default:
      return 'unsupported'
  }
}

const ALLOWED_OPERATORS: Record<FilterCategory, string[]> = {
  text: ['contains', 'equals', 'starts_with', 'ends_with', 'not_equals'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'],
  date: ['eq', 'before', 'after', 'between'],
  boolean: ['eq'],
  unsupported: [],
}

function buildSqlServerFilterClauses(
  filters: ColumnFilter[],
  columnMeta: Array<{ COLUMN_NAME: string; DATA_TYPE: string }>,
): { clauses: string[]; applyParams: (request: sql.Request) => void } {
  const clauses: string[] = []
  const paramSetters: Array<(request: sql.Request) => void> = []
  let idx = 0

  for (const filter of filters) {
    const col = columnMeta.find(c => c.COLUMN_NAME === filter.column)
    if (!col) continue

    const category = getSqlServerFilterCategory(col.DATA_TYPE)
    const allowed = ALLOWED_OPERATORS[category]
    if (!allowed.includes(filter.operator)) continue

    const colRef = `[${col.COLUMN_NAME}]`
    const paramName = `f${idx++}`

    switch (category) {
      case 'text':
        switch (filter.operator) {
          case 'contains':
            clauses.push(`${colRef} LIKE @${paramName}`)
            paramSetters.push(r => r.input(paramName, `%${filter.value}%`))
            break
          case 'equals':
            clauses.push(`${colRef} = @${paramName}`)
            paramSetters.push(r => r.input(paramName, filter.value))
            break
          case 'starts_with':
            clauses.push(`${colRef} LIKE @${paramName}`)
            paramSetters.push(r => r.input(paramName, `${filter.value}%`))
            break
          case 'ends_with':
            clauses.push(`${colRef} LIKE @${paramName}`)
            paramSetters.push(r => r.input(paramName, `%${filter.value}`))
            break
          case 'not_equals':
            clauses.push(`${colRef} != @${paramName}`)
            paramSetters.push(r => r.input(paramName, filter.value))
            break
        }
        break

      case 'number': {
        const numType = ['int', 'bigint', 'smallint', 'tinyint'].includes(col.DATA_TYPE.toLowerCase())
          ? sql.Float : sql.Decimal(18, 4)
        const ops: Record<string, string> = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' }
        if (filter.operator === 'between') {
          const p2 = `f${idx++}`
          clauses.push(`${colRef} BETWEEN @${paramName} AND @${p2}`)
          paramSetters.push(r => {
            r.input(paramName, numType, parseFloat(filter.value))
            r.input(p2, numType, parseFloat(filter.value2 || '0'))
          })
        } else if (ops[filter.operator]) {
          clauses.push(`${colRef} ${ops[filter.operator]} @${paramName}`)
          paramSetters.push(r => r.input(paramName, numType, parseFloat(filter.value)))
        }
        break
      }

      case 'date': {
        const dateOps: Record<string, string> = { eq: '=', before: '<', after: '>' }
        if (filter.operator === 'between') {
          const p2 = `f${idx++}`
          clauses.push(`CAST(${colRef} AS DATE) BETWEEN @${paramName} AND @${p2}`)
          paramSetters.push(r => {
            r.input(paramName, sql.Date, new Date(filter.value))
            r.input(p2, sql.Date, new Date(filter.value2 || filter.value))
          })
        } else if (filter.operator === 'eq') {
          clauses.push(`CAST(${colRef} AS DATE) = @${paramName}`)
          paramSetters.push(r => r.input(paramName, sql.Date, new Date(filter.value)))
        } else if (dateOps[filter.operator]) {
          clauses.push(`${colRef} ${dateOps[filter.operator]} @${paramName}`)
          paramSetters.push(r => r.input(paramName, sql.Date, new Date(filter.value)))
        }
        break
      }

      case 'boolean':
        clauses.push(`${colRef} = @${paramName}`)
        paramSetters.push(r => r.input(paramName, sql.Bit, filter.value === 'true' ? 1 : 0))
        break
    }
  }

  return {
    clauses,
    applyParams: (request: sql.Request) => {
      for (const setter of paramSetters) setter(request)
    },
  }
}

// --- Helper types & functions for TypeScript interface generation ---

interface ColumnMeta {
  COLUMN_NAME: string
  DATA_TYPE: string
  IS_NULLABLE: string
}

interface MappedColumn {
  column: string
  sqlType: string
  tsType: string
  nullable: boolean
}

interface EntityResult {
  view: string
  interfaceName: string
  columns: MappedColumn[]
  typescript: string
}

function sqlTypeToTs(sqlType: string): string {
  switch (sqlType.toLowerCase()) {
    case 'int':
    case 'bigint':
    case 'smallint':
    case 'tinyint':
    case 'decimal':
    case 'numeric':
    case 'float':
    case 'real':
    case 'money':
    case 'smallmoney':
      return 'number'
    case 'varchar':
    case 'nvarchar':
    case 'char':
    case 'nchar':
    case 'text':
    case 'ntext':
    case 'uniqueidentifier':
    case 'xml':
      return 'string'
    case 'bit':
      return 'boolean'
    case 'date':
    case 'datetime':
    case 'datetime2':
    case 'smalldatetime':
    case 'datetimeoffset':
    case 'time':
      return 'Date'
    case 'varbinary':
    case 'binary':
    case 'image':
      return 'Buffer'
    default:
      return 'unknown'
  }
}

function toPascalCase(name: string): string {
  return name
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

function generateInterface(viewName: string, columns: ColumnMeta[]): EntityResult {
  const interfaceName = toPascalCase(viewName)
  const mapped: MappedColumn[] = columns.map(c => ({
    column: c.COLUMN_NAME,
    sqlType: c.DATA_TYPE,
    tsType: sqlTypeToTs(c.DATA_TYPE),
    nullable: c.IS_NULLABLE === 'YES',
  }))

  const fields = mapped.map(c => {
    const type = c.nullable ? `${c.tsType} | null` : c.tsType
    return `  ${c.column}: ${type};`
  }).join('\n')

  const typescript = `export interface ${interfaceName} {\n${fields}\n}`

  return { view: viewName, interfaceName, columns: mapped, typescript }
}

/**
 * GET /api/views
 *
 * List all views in a database — useful for discovery / building reports.
 *
 * Query params:
 *   - db: database name (registered in dbManager)
 */
router.get('/', async (req: Request, res: Response) => {
  const { db } = req.query

  if (!db || typeof db !== 'string') {
    res.status(400).json({ error: 'Missing required query param: db' })
    return
  }

  try {
    const pool = await dbManager.getPool(db)
    const result = await pool.request().query(`
      SELECT
        TABLE_SCHEMA as [schema],
        TABLE_NAME as [name],
        IS_UPDATABLE as [isUpdatable]
      FROM INFORMATION_SCHEMA.VIEWS
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `)

    // Filter to only allowed views
    const filtered = result.recordset.filter(
      (v: any) => ALLOWED_VIEWS.includes(v.name)
    )

    res.json({
      database: db,
      views: filtered,
      count: filtered.length,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list views', details: error.message })
  }
})

/**
 * GET /api/views/columns
 *
 * List all columns for a specific view — for dynamic filter building.
 *
 * Query params:
 *   - db: database name (registered in dbManager)
 *   - view: view name
 */
router.get('/columns', async (req: Request, res: Response) => {
  const { db, view } = req.query

  if (!db || !view || typeof db !== 'string' || typeof view !== 'string') {
    res.status(400).json({ error: 'Missing required query params: db, view' })
    return
  }

  try {
    const pool = await dbManager.getPool(db)
    const result = await pool.request()
      .input('viewName', view)
      .query(`
        SELECT
          COLUMN_NAME as [column],
          DATA_TYPE as [type],
          CHARACTER_MAXIMUM_LENGTH as [maxLength],
          IS_NULLABLE as [nullable],
          COLUMN_DEFAULT as [default]
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @viewName
        ORDER BY ORDINAL_POSITION
      `)

    res.json({
      database: db,
      view,
      columns: result.recordset.map((c: any) => ({
        ...c,
        filterCategory: getSqlServerFilterCategory(c.type || c.DATA_TYPE || ''),
      })),
      count: result.recordset.length,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list view columns', details: error.message })
  }
})

/**
 * GET /api/views/definition
 *
 * Get the SQL definition of a specific view.
 *
 * Query params:
 *   - db: database name (registered in dbManager)
 *   - view: view name
 */
router.get('/definition', async (req: Request, res: Response) => {
  const { db, view } = req.query

  if (!db || !view || typeof db !== 'string' || typeof view !== 'string') {
    res.status(400).json({ error: 'Missing required query params: db, view' })
    return
  }

  try {
    const pool = await dbManager.getPool(db)
    const result = await pool.request()
      .input('viewName', view)
      .query(`
        SELECT
          TABLE_SCHEMA as [schema],
          TABLE_NAME as [name],
          VIEW_DEFINITION as [definition],
          CHECK_OPTION as [checkOption],
          IS_UPDATABLE as [isUpdatable]
        FROM INFORMATION_SCHEMA.VIEWS
        WHERE TABLE_NAME = @viewName
      `)

    if (result.recordset.length === 0) {
      res.status(404).json({ error: `View "${view}" not found in database "${db}"` })
      return
    }

    res.json({
      database: db,
      view: result.recordset[0],
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get view definition', details: error.message })
  }
})

/**
 * GET /api/views/data
 *
 * Query row data from a validated view with server-side pagination, sorting, and search.
 *
 * Query params:
 *   - db: database name (registered in dbManager)
 *   - view: view name (validated against INFORMATION_SCHEMA)
 *   - schema: schema name (default: 'dbo')
 *   - page: page number, 1-based (default: 1)
 *   - pageSize: rows per page (default: 50, max: 500)
 *   - search: global search term (LIKE across text columns)
 *   - sortBy: column name to sort by (validated against view columns)
 *   - sortOrder: 'asc' or 'desc' (default: 'asc')
 */
router.get('/data', async (req: Request, res: Response) => {
  const {
    db, view,
    schema: schemaParam,
    page: pageParam,
    pageSize: pageSizeParam,
    search,
    sortBy,
    sortOrder: sortOrderParam,
    filters: filtersParam,
  } = req.query

  if (!db || !view || typeof db !== 'string' || typeof view !== 'string') {
    res.status(400).json({ error: 'Missing required query params: db, view' })
    return
  }

  const schema = (typeof schemaParam === 'string' && schemaParam) ? schemaParam : 'dbo'
  const page = Math.max(1, parseInt(pageParam as string, 10) || 1)
  const pageSize = Math.min(500, Math.max(1, parseInt(pageSizeParam as string, 10) || 50))
  const offset = (page - 1) * pageSize
  const sortOrder = (typeof sortOrderParam === 'string' && sortOrderParam.toLowerCase() === 'desc') ? 'DESC' : 'ASC'

  try {
    const pool = await dbManager.getPool(db)

    // 0. Check against allowed views whitelist
    if (!ALLOWED_VIEWS.includes(view)) {
      res.status(404).json({ error: `View "${schema}.${view}" not found` })
      return
    }

    // 1. Validate view exists in INFORMATION_SCHEMA (whitelist approach)
    const viewCheck = await pool.request()
      .input('viewName', view)
      .input('schemaName', schema)
      .query(`
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.VIEWS
        WHERE TABLE_NAME = @viewName AND TABLE_SCHEMA = @schemaName
      `)

    if (viewCheck.recordset.length === 0) {
      res.status(404).json({ error: `View "${schema}.${view}" not found` })
      return
    }

    // Use validated names from the database, not raw user input
    const validatedSchema = viewCheck.recordset[0].TABLE_SCHEMA
    const validatedView = viewCheck.recordset[0].TABLE_NAME

    // 2. Get columns for search and sort validation
    const colResult = await pool.request()
      .input('viewName', validatedView)
      .input('schemaName', validatedSchema)
      .query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @viewName AND TABLE_SCHEMA = @schemaName
        ORDER BY ORDINAL_POSITION
      `)

    const columns = colResult.recordset
    const columnNames = columns.map((c: any) => c.COLUMN_NAME as string)

    // 3. Validate sortBy if provided
    let validatedSortBy: string | null = null
    if (sortBy && typeof sortBy === 'string') {
      if (!columnNames.includes(sortBy)) {
        res.status(400).json({ error: `Invalid sortBy column: "${sortBy}". Available: [${columnNames.join(', ')}]` })
        return
      }
      validatedSortBy = sortBy
    }

    // 4. Build WHERE conditions
    const allConditions: string[] = []

    // 4a. Global search (LIKE across text columns)
    const textTypes = ['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext']
    const textColumns = columns.filter((c: any) => textTypes.includes((c.DATA_TYPE as string).toLowerCase()))
    const searchTerm = (typeof search === 'string' && search.trim()) ? search.trim() : null

    if (searchTerm && textColumns.length > 0) {
      const conditions = textColumns.map((c: any) => `[${c.COLUMN_NAME}] LIKE @search`).join(' OR ')
      allConditions.push(`(${conditions})`)
    }

    // 4b. Column-specific filters
    let parsedFilters: ColumnFilter[] = []
    if (filtersParam && typeof filtersParam === 'string') {
      try { parsedFilters = JSON.parse(filtersParam) } catch { /* ignore */ }
    }

    const filterResult = buildSqlServerFilterClauses(parsedFilters, columns)
    allConditions.push(...filterResult.clauses)

    const whereClause = allConditions.length > 0
      ? `WHERE ${allConditions.join(' AND ')}`
      : ''

    // 5. Build ORDER BY clause
    const orderClause = validatedSortBy
      ? `ORDER BY [${validatedSortBy}] ${sortOrder}`
      : 'ORDER BY (SELECT NULL)'

    // 6. Execute data query with pagination
    const dataRequest = pool.request()
      .input('offset', sql.Int, offset)
      .input('pageSize', sql.Int, pageSize)

    if (searchTerm && textColumns.length > 0) {
      dataRequest.input('search', `%${searchTerm}%`)
    }
    filterResult.applyParams(dataRequest)

    const dataResult = await dataRequest.query(`
      SELECT *
      FROM [${validatedSchema}].[${validatedView}]
      ${whereClause}
      ${orderClause}
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `)

    // 7. Get total count (for pagination metadata)
    const countRequest = pool.request()
    if (searchTerm && textColumns.length > 0) {
      countRequest.input('search', `%${searchTerm}%`)
    }
    filterResult.applyParams(countRequest)

    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM [${validatedSchema}].[${validatedView}]
      ${whereClause}
    `)
    const totalRows = countResult.recordset[0].total

    // 8. Return response
    res.json({
      database: db,
      view: validatedView,
      schema: validatedSchema,
      columns: columns.map((c: any) => ({
        column: c.COLUMN_NAME,
        type: c.DATA_TYPE,
        filterCategory: getSqlServerFilterCategory(c.DATA_TYPE),
      })),
      data: dataResult.recordset,
      pagination: {
        page,
        pageSize,
        totalRows,
        totalPages: Math.ceil(totalRows / pageSize),
      },
    })
  } catch (error: any) {
    logger.error('Failed to query view data:', error)
    res.status(500).json({ error: 'Failed to query view data', details: error.message })
  }
})

/**
 * GET /api/views/entity
 *
 * Generate a TypeScript interface from a single view's column metadata.
 *
 * Query params:
 *   - db: database name (registered in dbManager)
 *   - view: view name
 *   - schema: schema name (default: 'dbo')
 */
router.get('/entity', async (req: Request, res: Response) => {
  const { db, view, schema: schemaParam } = req.query

  if (!db || !view || typeof db !== 'string' || typeof view !== 'string') {
    res.status(400).json({ error: 'Missing required query params: db, view' })
    return
  }

  const schema = (typeof schemaParam === 'string' && schemaParam) ? schemaParam : 'dbo'

  try {
    const pool = await dbManager.getPool(db)
    const result = await pool.request()
      .input('viewName', view)
      .input('schemaName', schema)
      .query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @viewName AND TABLE_SCHEMA = @schemaName
        ORDER BY ORDINAL_POSITION
      `)

    if (result.recordset.length === 0) {
      res.status(404).json({ error: `View "${schema}.${view}" not found or has no columns` })
      return
    }

    const entity = generateInterface(view, result.recordset)

    res.json({
      database: db,
      view: entity.view,
      schema,
      interfaceName: entity.interfaceName,
      columns: entity.columns,
      typescript: entity.typescript,
    })
  } catch (error: any) {
    logger.error('Failed to generate entity:', error)
    res.status(500).json({ error: 'Failed to generate entity', details: error.message })
  }
})

/**
 * GET /api/views/entities
 *
 * Generate TypeScript interfaces for multiple views (or all views in a schema).
 *
 * Query params:
 *   - db: database name (registered in dbManager)
 *   - views: comma-separated view names (optional — if omitted, generates for ALL views)
 *   - schema: schema name (default: 'dbo')
 */
router.get('/entities', async (req: Request, res: Response) => {
  const { db, views: viewsParam, schema: schemaParam } = req.query

  if (!db || typeof db !== 'string') {
    res.status(400).json({ error: 'Missing required query param: db' })
    return
  }

  const schema = (typeof schemaParam === 'string' && schemaParam) ? schemaParam : 'dbo'

  try {
    const pool = await dbManager.getPool(db)

    // Determine which views to process
    let viewNames: string[]

    if (viewsParam && typeof viewsParam === 'string') {
      viewNames = viewsParam.split(',').map(v => v.trim()).filter(Boolean)
    } else {
      // Fetch all views in the schema
      const allViews = await pool.request()
        .input('schemaName', schema)
        .query(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.VIEWS
          WHERE TABLE_SCHEMA = @schemaName
          ORDER BY TABLE_NAME
        `)
      viewNames = allViews.recordset.map((r: any) => r.TABLE_NAME as string)
    }

    if (viewNames.length === 0) {
      res.status(404).json({ error: `No views found in schema "${schema}"` })
      return
    }

    // Generate interfaces for each view
    const entities: EntityResult[] = []

    for (const viewName of viewNames) {
      const colResult = await pool.request()
        .input('viewName', viewName)
        .input('schemaName', schema)
        .query(`
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @viewName AND TABLE_SCHEMA = @schemaName
          ORDER BY ORDINAL_POSITION
        `)

      if (colResult.recordset.length > 0) {
        entities.push(generateInterface(viewName, colResult.recordset))
      }
    }

    // Build full file content
    const header = [
      `// Auto-generated TypeScript interfaces from database: ${db}`,
      `// Schema: ${schema}`,
      `// Generated at: ${new Date().toISOString()}`,
      `// Total interfaces: ${entities.length}`,
    ].join('\n')

    const fullFile = header + '\n\n' + entities.map(e => e.typescript).join('\n\n') + '\n'

    res.json({
      database: db,
      schema,
      count: entities.length,
      entities,
      fullFile,
    })
  } catch (error: any) {
    logger.error('Failed to generate entities:', error)
    res.status(500).json({ error: 'Failed to generate entities', details: error.message })
  }
})

/**
 * GET /api/views/export
 *
 * Export all filtered data from a SQL Server view as CSV or XLSX.
 * Same search/sort as /data but no pagination.
 * Query params: db, view, schema, format=csv|xlsx, search, sortBy, sortOrder
 */
router.get('/export', async (req: Request, res: Response) => {
  const {
    db, view,
    schema: schemaParam,
    format: formatParam,
    search,
    sortBy,
    sortOrder: sortOrderParam,
    filters: filtersParam,
  } = req.query

  if (!db || !view || typeof db !== 'string' || typeof view !== 'string') {
    res.status(400).json({ error: 'Missing required query params: db, view' })
    return
  }

  const schema = (typeof schemaParam === 'string' && schemaParam) ? schemaParam : 'dbo'
  const format = (typeof formatParam === 'string' && formatParam === 'xlsx') ? 'xlsx' : 'csv'
  const sortOrder = (typeof sortOrderParam === 'string' && sortOrderParam.toLowerCase() === 'desc') ? 'DESC' : 'ASC'

  try {
    const pool = await dbManager.getPool(db)

    if (!ALLOWED_VIEWS.includes(view)) {
      res.status(404).json({ error: `View "${schema}.${view}" not found` })
      return
    }

    const viewCheck = await pool.request()
      .input('viewName', view)
      .input('schemaName', schema)
      .query(`
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.VIEWS
        WHERE TABLE_NAME = @viewName AND TABLE_SCHEMA = @schemaName
      `)

    if (viewCheck.recordset.length === 0) {
      res.status(404).json({ error: `View "${schema}.${view}" not found` })
      return
    }

    const validatedSchema = viewCheck.recordset[0].TABLE_SCHEMA
    const validatedView = viewCheck.recordset[0].TABLE_NAME

    const colResult = await pool.request()
      .input('viewName', validatedView)
      .input('schemaName', validatedSchema)
      .query(`
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @viewName AND TABLE_SCHEMA = @schemaName
        ORDER BY ORDINAL_POSITION
      `)

    const columns = colResult.recordset
    const columnNames = columns.map((c: any) => c.COLUMN_NAME as string)

    // Validate sortBy
    let validatedSortBy: string | null = null
    if (sortBy && typeof sortBy === 'string') {
      if (columnNames.includes(sortBy)) validatedSortBy = sortBy
    }

    // Build WHERE conditions
    const exportConditions: string[] = []
    const textTypes = ['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext']
    const textColumns = columns.filter((c: any) => textTypes.includes((c.DATA_TYPE as string).toLowerCase()))
    const searchTerm = (typeof search === 'string' && search.trim()) ? search.trim() : null

    if (searchTerm && textColumns.length > 0) {
      const conditions = textColumns.map((c: any) => `[${c.COLUMN_NAME}] LIKE @search`).join(' OR ')
      exportConditions.push(`(${conditions})`)
    }

    // Column-specific filters
    let exportFilters: ColumnFilter[] = []
    if (filtersParam && typeof filtersParam === 'string') {
      try { exportFilters = JSON.parse(filtersParam) } catch { /* ignore */ }
    }
    const exportFilterResult = buildSqlServerFilterClauses(exportFilters, columns)
    exportConditions.push(...exportFilterResult.clauses)

    const whereClause = exportConditions.length > 0
      ? `WHERE ${exportConditions.join(' AND ')}`
      : ''

    const orderClause = validatedSortBy
      ? `ORDER BY [${validatedSortBy}] ${sortOrder}`
      : 'ORDER BY (SELECT NULL)'

    const dataRequest = pool.request()
    if (searchTerm && textColumns.length > 0) {
      dataRequest.input('search', `%${searchTerm}%`)
    }
    exportFilterResult.applyParams(dataRequest)

    // Fetch all data (max 50,000)
    const dataResult = await dataRequest.query(`
      SELECT TOP 50000 *
      FROM [${validatedSchema}].[${validatedView}]
      ${whereClause}
      ${orderClause}
    `)

    const data = dataResult.recordset
    const fileName = `${validatedView}_${new Date().toISOString().slice(0, 10)}`

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet(validatedView.slice(0, 31))

      sheet.columns = columnNames.map(col => ({ header: col, key: col, width: 20 }))
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }

      for (const row of data) {
        sheet.addRow(row)
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`)
      await workbook.xlsx.write(res)
      res.end()
    } else {
      const csvHeader = columnNames.join(',')
      const csvRows = data.map((row: any) =>
        columnNames.map(col => {
          const val = row[col]
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
      res.send('\uFEFF' + csv)
    }

    logger.info(`Exported ${data.length} rows from ${validatedView} as ${format}`)
  } catch (error: any) {
    logger.error('Failed to export view data:', error)
    res.status(500).json({ error: 'Failed to export data', details: error.message })
  }
})

export default router
