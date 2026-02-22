import { Request, Response, NextFunction } from 'express'
import { verifyJwt, JwtPayload } from '../lib/auth'
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
 * Must be used AFTER authenticate middleware.
 * Returns 403 if the user lacks the required role.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    next()
  }
}
