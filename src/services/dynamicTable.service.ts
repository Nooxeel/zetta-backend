/**
 * Dynamic Table Service
 * Handles DDL operations for dynamically-created ETL tables in the PostgreSQL "etl" schema.
 */

import prisma from '../lib/prisma'
import { buildPgColumnType } from './typeMapper'
import { createLogger } from '../lib/logger'

const logger = createLogger('DynamicTable')

export interface ColumnDefinition {
  columnName: string
  sqlServerType: string
  maxLength: number | null
  isNullable: boolean
  ordinalPosition: number
}

/**
 * Sanitize a name for use as a PostgreSQL identifier.
 * Removes anything that is not alphanumeric or underscore.
 */
export function sanitizeIdentifier(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, '_')
}

/**
 * Generate a deterministic PG table name from source identifiers.
 * Format: {dbName}__{schema}__{viewName}
 */
export function generatePgTableName(dbName: string, schema: string, viewName: string): string {
  return `${sanitizeIdentifier(dbName)}__${sanitizeIdentifier(schema)}__${sanitizeIdentifier(viewName)}`
}

/**
 * Create a new table in the etl schema based on column definitions.
 */
export async function createEtlTable(
  pgTableName: string,
  columns: ColumnDefinition[]
): Promise<void> {
  const columnDefs = columns.map(col => {
    const pgType = buildPgColumnType(col.sqlServerType, col.maxLength)
    const nullable = col.isNullable ? '' : ' NOT NULL'
    return `  "${sanitizeIdentifier(col.columnName)}" ${pgType}${nullable}`
  })

  const ddl = `
    CREATE TABLE IF NOT EXISTS etl."${pgTableName}" (
      _etl_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      _etl_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ${columnDefs.join(',\n      ')}
    )
  `

  logger.info(`Creating ETL table: etl."${pgTableName}" with ${columns.length} columns`)
  await prisma.$executeRawUnsafe(ddl)
}

/**
 * Add new columns to an existing ETL table.
 * New columns are always nullable to not break existing rows.
 */
export async function evolveTableSchema(
  pgTableName: string,
  columnsToAdd: ColumnDefinition[]
): Promise<void> {
  for (const col of columnsToAdd) {
    const pgType = buildPgColumnType(col.sqlServerType, col.maxLength)
    const ddl = `ALTER TABLE etl."${pgTableName}" ADD COLUMN IF NOT EXISTS "${sanitizeIdentifier(col.columnName)}" ${pgType}`
    logger.info(`Adding column to etl."${pgTableName}": ${col.columnName} (${pgType})`)
    await prisma.$executeRawUnsafe(ddl)
  }
}

/**
 * Truncate the table data (for full sync — keeps structure, removes rows).
 */
export async function truncateEtlTable(pgTableName: string): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE etl."${pgTableName}" RESTART IDENTITY`)
}

/**
 * Drop an ETL table entirely.
 */
export async function dropEtlTable(pgTableName: string): Promise<void> {
  logger.info(`Dropping ETL table: etl."${pgTableName}"`)
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS etl."${pgTableName}" CASCADE`)
}
