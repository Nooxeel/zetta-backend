/**
 * SQL Server Database Connection Manager
 * Manages multiple named SQL Server connections (SoMee hosted databases).
 * 
 * Usage:
 *   const pool = await dbManager.getPool('inventario')
 *   const result = await pool.request().query('SELECT * FROM Products')
 */

import sql from 'mssql'
import { createLogger } from './logger'

const logger = createLogger('DatabaseManager')

export interface DatabaseConfig {
  /** Friendly name for this connection (e.g., 'inventario', 'ventas') */
  name: string
  server: string
  database: string
  user: string
  password: string
  port?: number
  /** Optional: override default options */
  options?: Partial<sql.config['options']>
}

const DEFAULT_OPTIONS: sql.config['options'] = {
  encrypt: true,
  trustServerCertificate: true, // Required for SoMee / self-signed certs
  requestTimeout: 30000,        // 30s per query
  connectTimeout: 15000,        // 15s to connect
}

class DatabaseManager {
  private pools: Map<string, sql.ConnectionPool> = new Map()
  private configs: Map<string, sql.config> = new Map()

  /**
   * Register a database connection configuration.
   * Does NOT connect immediately — lazy connection on first getPool() call.
   */
  register(dbConfig: DatabaseConfig): void {
    const config: sql.config = {
      server: dbConfig.server,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port || 1433,
      options: {
        ...DEFAULT_OPTIONS,
        ...dbConfig.options,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    }

    this.configs.set(dbConfig.name, config)
    logger.info(`Registered database: "${dbConfig.name}" → ${dbConfig.server}/${dbConfig.database}`)
  }

  /**
   * Register multiple databases from environment variables.
   * Expects: DB_{NAME}_SERVER, DB_{NAME}_DATABASE, DB_{NAME}_USER, DB_{NAME}_PASSWORD, DB_{NAME}_PORT
   * 
   * Example env vars for a database named "INVENTARIO":
   *   DB_INVENTARIO_SERVER=sql.somee.com
   *   DB_INVENTARIO_DATABASE=mydb
   *   DB_INVENTARIO_USER=myuser
   *   DB_INVENTARIO_PASSWORD=mypass
   */
  registerFromEnv(names: string[]): void {
    for (const name of names) {
      const prefix = `DB_${name.toUpperCase()}`
      const server = process.env[`${prefix}_SERVER`]
      const database = process.env[`${prefix}_DATABASE`]
      const user = process.env[`${prefix}_USER`]
      const password = process.env[`${prefix}_PASSWORD`]
      const port = process.env[`${prefix}_PORT`]

      if (!server || !database || !user || !password) {
        logger.warn(`Skipping database "${name}": missing env vars (need ${prefix}_SERVER, _DATABASE, _USER, _PASSWORD)`)
        continue
      }

      this.register({
        name: name.toLowerCase(),
        server,
        database,
        user,
        password,
        port: port ? parseInt(port, 10) : undefined,
      })
    }
  }

  /**
   * Get a connected pool for the given database name.
   * Creates the connection on first call (lazy initialization).
   */
  async getPool(name: string): Promise<sql.ConnectionPool> {
    // Return existing connected pool
    const existing = this.pools.get(name)
    if (existing?.connected) {
      return existing
    }

    // Get config
    const config = this.configs.get(name)
    if (!config) {
      throw new Error(`Database "${name}" is not registered. Available: [${this.getRegisteredNames().join(', ')}]`)
    }

    // Create and connect
    try {
      logger.info(`Connecting to database "${name}"...`)
      const pool = new sql.ConnectionPool(config)
      await pool.connect()
      this.pools.set(name, pool)
      logger.info(`✅ Connected to database "${name}"`)
      return pool
    } catch (error) {
      logger.error(`❌ Failed to connect to database "${name}":`, error)
      throw error
    }
  }

  /**
   * Test connectivity to a specific database.
   */
  async testConnection(name: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now()
    try {
      const pool = await this.getPool(name)
      await pool.request().query('SELECT 1 AS ping')
      return { ok: true, latencyMs: Date.now() - start }
    } catch (error: any) {
      return { ok: false, latencyMs: Date.now() - start, error: error.message }
    }
  }

  /**
   * Test connectivity to ALL registered databases.
   */
  async testAllConnections(): Promise<Record<string, { ok: boolean; latencyMs: number; error?: string }>> {
    const results: Record<string, { ok: boolean; latencyMs: number; error?: string }> = {}
    for (const name of this.getRegisteredNames()) {
      results[name] = await this.testConnection(name)
    }
    return results
  }

  /**
   * Get list of registered database names.
   */
  getRegisteredNames(): string[] {
    return Array.from(this.configs.keys())
  }

  /**
   * Close all connections (for graceful shutdown).
   */
  async closeAll(): Promise<void> {
    for (const [name, pool] of this.pools.entries()) {
      try {
        await pool.close()
        logger.info(`Closed connection to "${name}"`)
      } catch (error) {
        logger.error(`Error closing connection to "${name}":`, error)
      }
    }
    this.pools.clear()
  }
}

// Singleton instance
export const dbManager = new DatabaseManager()

export default dbManager
