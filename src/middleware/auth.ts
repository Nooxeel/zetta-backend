import { Request, Response, NextFunction } from 'express'
import { verifyJwt, JwtPayload } from '../lib/auth'
import prisma from '../lib/prisma'
import { createLogger } from '../lib/logger'

const logger = createLogger('AuthMiddleware')

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

/**
 * Extracts and verifies the JWT from the Authorization header.
 * Attaches the decoded payload to req.user.
 * Returns 401 if no token or invalid token.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)

  try {
    const payload = verifyJwt(token)
    req.user = payload
    next()
  } catch (error) {
    logger.warn('JWT verification failed:', error)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

/**
 * Checks that the authenticated user has one of the specified roles.
 * Fetches the CURRENT role from the database (not the JWT claim)
 * so role changes take effect immediately without re-login.
 * Must be used AFTER authenticate middleware.
 */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { role: true },
      })

      if (!user || !roles.includes(user.role)) {
        res.status(403).json({ error: 'Insufficient permissions' })
        return
      }

      // Update the JWT payload with the fresh role
      req.user.role = user.role
      next()
    } catch (error) {
      logger.error('Role check failed:', error)
      res.status(500).json({ error: 'Failed to verify permissions' })
    }
  }
}
