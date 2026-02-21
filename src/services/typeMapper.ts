/**
 * SQL Server → PostgreSQL type mapping for ETL table creation.
 */

export function sqlServerTypeToPg(sqlType: string): string {
  switch (sqlType.toLowerCase()) {
    case 'tinyint':
    case 'smallint':
      return 'SMALLINT'
    case 'int':
      return 'INTEGER'
    case 'bigint':
      return 'BIGINT'
    case 'decimal':
    case 'numeric':
      return 'NUMERIC'
    case 'float':
      return 'DOUBLE PRECISION'
    case 'real':
      return 'REAL'
    case 'money':
      return 'NUMERIC(19,4)'
    case 'smallmoney':
      return 'NUMERIC(10,4)'
    case 'char':
    case 'nchar':
      return 'CHAR'
    case 'varchar':
    case 'nvarchar':
      return 'VARCHAR'
    case 'text':
    case 'ntext':
      return 'TEXT'
    case 'date':
      return 'DATE'
    case 'time':
      return 'TIME'
    case 'datetime':
    case 'datetime2':
    case 'smalldatetime':
      return 'TIMESTAMP'
    case 'datetimeoffset':
      return 'TIMESTAMPTZ'
    case 'bit':
      return 'BOOLEAN'
    case 'binary':
    case 'varbinary':
    case 'image':
      return 'BYTEA'
    case 'uniqueidentifier':
      return 'UUID'
    case 'xml':
      return 'XML'
    default:
      return 'TEXT'
  }
}

/**
 * Builds the full PostgreSQL column type string including length constraints.
 * Handles VARCHAR(n), VARCHAR(MAX) → TEXT, etc.
 */
export function buildPgColumnType(sqlType: string, maxLength: number | null): string {
  const pgType = sqlServerTypeToPg(sqlType)

  if ((pgType === 'VARCHAR' || pgType === 'CHAR') && maxLength && maxLength > 0) {
    return `${pgType}(${maxLength})`
  }

  // VARCHAR(MAX) / NVARCHAR(MAX) in SQL Server → TEXT in PG
  if ((pgType === 'VARCHAR' || pgType === 'CHAR') && (maxLength === -1 || maxLength === null)) {
    return 'TEXT'
  }

  return pgType
}
