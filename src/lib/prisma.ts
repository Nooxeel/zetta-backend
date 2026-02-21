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

export default prisma
