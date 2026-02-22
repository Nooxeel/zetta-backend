/**
 * ETL Service — Core orchestration for SQL Server → PostgreSQL sync.
 *
 * Strategy: Full sync (TRUNCATE + re-insert in batches).
 * Each sync reads all rows from a SQL Server view and writes them to a
 * dynamically-created PostgreSQL table in the "etl" schema.
 */

import sql from 'mssql'
import prisma from '../lib/prisma'
import dbManager from '../lib/db'
import { createLogger } from '../lib/logger'
import { buildPgColumnType } from './typeMapper'
import {
  generatePgTableName,
  createEtlTable,
  truncateEtlTable,
  evolveTableSchema,
  sanitizeIdentifier,
  type ColumnDefinition,
} from './dynamicTable.service'

const logger = createLogger('ETL')

const BATCH_SIZE = 5000

// In-memory lock to prevent concurrent syncs of the same view
const activeSyncs = new Set<string>()

/**
 * Main entry point: sync a SQL Server view to PostgreSQL.
 */
export async function syncView(
  dbName: string,
  sourceSchema: string,
  sourceView: string
): Promise<{ rowsSynced: number; durationMs: number }> {
  const lockKey = `${dbName}::${sourceSchema}::${sourceView}`

  if (activeSyncs.has(lockKey)) {
    throw new SyncConflictError(`View "${sourceSchema}.${sourceView}" is already being synced`)
  }

  activeSyncs.add(lockKey)
  const startTime = Date.now()
  const pgTableName = generatePgTableName(dbName, sourceSchema, sourceView)

  let syncedViewId: string | undefined
  let syncLogId: string | undefined

  try {
    // 1. Ensure the EtlSource record exists
    const source = await prisma.etlSource.upsert({
      where: { dbName },
      create: { dbName },
      update: {},
    })

    // 2. Get or create the SyncedView record
    const syncedView = await prisma.syncedView.upsert({
      where: {
        sourceId_sourceSchema_sourceView: {
          sourceId: source.id,
          sourceSchema,
          sourceView,
        },
      },
      create: {
        sourceId: source.id,
        sourceSchema,
        sourceView,
        pgTableName,
        status: 'SYNCING',
      },
      update: {
        status: 'SYNCING',
        lastError: null,
      },
      include: { columns: { where: { removedInVersion: null } } },
    })
    syncedViewId = syncedView.id

    // 3. Create a sync log entry
    const syncLog = await prisma.syncLog.create({
      data: {
        syncedViewId: syncedView.id,
        status: 'STARTED',
      },
    })
    syncLogId = syncLog.id

    // 4. Get SQL Server pool and fetch column metadata
    const pool = await dbManager.getPool(dbName)

    const colResult = await pool.request()
      .input('viewName', sourceView)
      .input('schemaName', sourceSchema)
      .query(`
        SELECT
          COLUMN_NAME as columnName,
          DATA_TYPE as sqlType,
          CHARACTER_MAXIMUM_LENGTH as maxLength,
          IS_NULLABLE as isNullable,
          ORDINAL_POSITION as ordinalPosition
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @viewName AND TABLE_SCHEMA = @schemaName
        ORDER BY ORDINAL_POSITION
      `)

    const columns: ColumnDefinition[] = colResult.recordset.map((r: any) => ({
      columnName: r.columnName,
      sqlServerType: r.sqlType,
      maxLength: r.maxLength,
      isNullable: r.isNullable === 'YES',
      ordinalPosition: r.ordinalPosition,
    }))

    if (columns.length === 0) {
      throw new Error(`View "${sourceSchema}.${sourceView}" has no columns or does not exist`)
    }

    // 5. Handle schema: create or evolve table
    const existingColumns = syncedView.columns

    if (existingColumns.length === 0) {
      // First sync — create the table
      await createEtlTable(pgTableName, columns)

      // Persist column metadata
      for (const col of columns) {
        await prisma.syncedColumn.create({
          data: {
            syncedViewId: syncedView.id,
            columnName: col.columnName,
            sqlServerType: col.sqlServerType,
            isNullable: col.isNullable,
            ordinalPosition: col.ordinalPosition,
            pgType: buildPgColumnType(col.sqlServerType, col.maxLength),
          },
        })
      }
    } else {
      // Detect schema changes
      const existingNames = new Set(existingColumns.map(c => c.columnName.toLowerCase()))
      const newNames = new Set(columns.map(c => c.columnName.toLowerCase()))

      const added = columns.filter(c => !existingNames.has(c.columnName.toLowerCase()))
      const removed = existingColumns.filter(c => !newNames.has(c.columnName.toLowerCase()))

      if (added.length > 0 || removed.length > 0) {
        logger.info(`Schema change detected for ${pgTableName}: +${added.length} cols, -${removed.length} cols`)

        const newVersion = syncedView.schemaVersion + 1

        if (added.length > 0) {
          await evolveTableSchema(pgTableName, added)
          for (const col of added) {
            await prisma.syncedColumn.create({
              data: {
                syncedViewId: syncedView.id,
                columnName: col.columnName,
                sqlServerType: col.sqlServerType,
                isNullable: col.isNullable,
                ordinalPosition: col.ordinalPosition,
                pgType: buildPgColumnType(col.sqlServerType, col.maxLength),
                addedInVersion: newVersion,
              },
            })
          }
        }

        if (removed.length > 0) {
          for (const col of removed) {
            await prisma.syncedColumn.update({
              where: { id: col.id },
              data: { removedInVersion: newVersion },
            })
          }
        }

        await prisma.syncedView.update({
          where: { id: syncedView.id },
          data: { schemaVersion: newVersion },
        })

        await prisma.syncLog.update({
          where: { id: syncLog.id },
          data: {
            schemaChanges: JSON.stringify({
              added: added.map(c => c.columnName),
              removed: removed.map(c => c.columnName),
            }),
          },
        })
      }
    }

    // 6. Full sync: truncate and re-insert
    await truncateEtlTable(pgTableName)

    // 7. Read from SQL Server and write to PostgreSQL in batches
    const countResult = await pool.request()
      .input('viewName2', sourceView)
      .input('schemaName2', sourceSchema)
      .query(`
        SELECT COUNT(*) AS total
        FROM INFORMATION_SCHEMA.VIEWS
        WHERE TABLE_NAME = @viewName2 AND TABLE_SCHEMA = @schemaName2
      `)

    // Verify view exists then count rows
    if (countResult.recordset[0].total === 0) {
      throw new Error(`View "${sourceSchema}.${sourceView}" not found`)
    }

    const totalCountResult = await pool.request()
      .query(`SELECT COUNT(*) AS total FROM [${sourceSchema}].[${sourceView}]`)
    const totalRows = totalCountResult.recordset[0].total

    let rowsSynced = 0
    let offset = 0

    while (offset < totalRows) {
      const batchResult = await pool.request()
        .input('offset', sql.Int, offset)
        .input('batchSize', sql.Int, BATCH_SIZE)
        .query(`
          SELECT * FROM [${sourceSchema}].[${sourceView}]
          ORDER BY (SELECT NULL)
          OFFSET @offset ROWS FETCH NEXT @batchSize ROWS ONLY
        `)

      const rows = batchResult.recordset
      if (rows.length === 0) break

      await insertBatch(pgTableName, columns, rows)

      rowsSynced += rows.length
      offset += BATCH_SIZE
      logger.debug(`Synced ${rowsSynced}/${totalRows} rows for ${pgTableName}`)
    }

    // 8. Update sync status
    const durationMs = Date.now() - startTime
    await prisma.syncedView.update({
      where: { id: syncedView.id },
      data: {
        status: 'SYNCED',
        lastSyncAt: new Date(),
        lastSyncRows: rowsSynced,
        lastSyncDurationMs: durationMs,
        lastError: null,
      },
    })

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'COMPLETED',
        rowsSynced,
        durationMs,
        completedAt: new Date(),
      },
    })

    logger.info(`Sync completed: ${pgTableName} — ${rowsSynced} rows in ${durationMs}ms`)
    return { rowsSynced, durationMs }

  } catch (error: any) {
    const durationMs = Date.now() - startTime
    logger.error(`Sync failed for ${pgTableName}:`, error)

    if (syncedViewId) {
      await prisma.syncedView.update({
        where: { id: syncedViewId },
        data: {
          status: 'FAILED',
          lastError: error.message,
          lastSyncDurationMs: durationMs,
        },
      }).catch(() => {})
    }

    if (syncLogId) {
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: {
          status: 'FAILED',
          error: error.message,
          durationMs,
          completedAt: new Date(),
        },
      }).catch(() => {})
    }

    throw error
  } finally {
    activeSyncs.delete(lockKey)
  }
}

/**
 * Insert a batch of rows into the ETL table using a multi-value INSERT.
 * Column names are sanitized; values are parameterized via $1::TYPE placeholders
 * with explicit casts so PostgreSQL can handle text-to-type conversion.
 */
async function insertBatch(
  pgTableName: string,
  columns: ColumnDefinition[],
  rows: Record<string, any>[]
): Promise<void> {
  if (rows.length === 0) return

  // Pre-compute PG types for each column (for explicit casts)
  const pgTypes = columns.map(c => buildPgColumnType(c.sqlServerType, c.maxLength))

  const colNames = columns
    .map(c => `"${sanitizeIdentifier(c.columnName)}"`)
    .join(', ')

  const values: any[] = []
  const rowPlaceholders: string[] = []

  for (const row of rows) {
    const placeholders: string[] = []
    for (let j = 0; j < columns.length; j++) {
      values.push(row[columns[j].columnName] ?? null)
      placeholders.push(`$${values.length}::${pgTypes[j]}`)
    }
    rowPlaceholders.push(`(${placeholders.join(', ')})`)
  }

  const insertSql = `INSERT INTO etl."${pgTableName}" (${colNames}) VALUES ${rowPlaceholders.join(', ')}`
  await prisma.$executeRawUnsafe(insertSql, ...values)
}

/**
 * Custom error for concurrent sync attempts.
 */
export class SyncConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SyncConflictError'
  }
}
