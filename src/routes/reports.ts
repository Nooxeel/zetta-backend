import { Router, Request, Response } from 'express'
import dbManager from '../lib/db'

const router = Router()

/**
 * GET /api/reports/query
 * 
 * Execute a read-only query against a specific database.
 * This is a placeholder — in production you'll want to map
 * report IDs to predefined SQL queries, NOT accept raw SQL.
 * 
 * Query params:
 *   - db: database name (registered in dbManager)
 *   - Filters will be defined per report type
 */
router.get('/query', async (req: Request, res: Response) => {
  const { db } = req.query

  if (!db || typeof db !== 'string') {
    res.status(400).json({ error: 'Missing required query param: db' })
    return
  }

  try {
    const pool = await dbManager.getPool(db)

    // TODO: Replace with actual report logic
    // This is just a connectivity test placeholder
    const result = await pool.request().query('SELECT 1 AS connected')

    res.json({
      database: db,
      message: 'Connection successful. Report queries will be implemented here.',
      result: result.recordset,
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Database query failed',
      details: error.message,
    })
  }
})

/**
 * GET /api/reports/tables
 * 
 * List all user tables in a database — useful for discovery / building reports.
 */
router.get('/tables', async (req: Request, res: Response) => {
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
        TABLE_NAME as [table],
        TABLE_TYPE as [type]
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `)

    res.json({
      database: db,
      tables: result.recordset,
      count: result.recordset.length,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list tables', details: error.message })
  }
})

/**
 * GET /api/reports/columns
 * 
 * List all columns for a specific table — for dynamic filter building.
 */
router.get('/columns', async (req: Request, res: Response) => {
  const { db, table } = req.query

  if (!db || !table || typeof db !== 'string' || typeof table !== 'string') {
    res.status(400).json({ error: 'Missing required query params: db, table' })
    return
  }

  try {
    const pool = await dbManager.getPool(db)
    const result = await pool.request()
      .input('tableName', table)
      .query(`
        SELECT 
          COLUMN_NAME as [column],
          DATA_TYPE as [type],
          CHARACTER_MAXIMUM_LENGTH as [maxLength],
          IS_NULLABLE as [nullable],
          COLUMN_DEFAULT as [default]
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = @tableName
        ORDER BY ORDINAL_POSITION
      `)

    res.json({
      database: db,
      table,
      columns: result.recordset,
      count: result.recordset.length,
    })
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to list columns', details: error.message })
  }
})

export default router
