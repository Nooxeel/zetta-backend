import { PrismaClient } from '@prisma/client'
import { createLogger } from './logger'

const logger = createLogger('Prisma')

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ]
    : [
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
})

if (process.env.NODE_ENV === 'development') {
  prisma.$on('query' as never, (e: any) => {
    logger.debug(`Query: ${e.query} (${e.duration}ms)`)
  })
}

/**
 * Ensure the etl schema exists in PostgreSQL.
 * Prisma manages the public schema; the etl schema is for dynamic ETL tables.
 */
export async function ensureEtlSchema(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS etl')
    logger.info('ETL schema ensured')
  } catch (error) {
    logger.error('Failed to ensure ETL schema:', error)
    throw error
  }
}

export default prisma
