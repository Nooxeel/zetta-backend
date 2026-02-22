import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { verifyGoogleToken, signJwt } from '../lib/auth'
import { authenticate } from '../middleware/auth'
import { createLogger } from '../lib/logger'

const router = Router()
const logger = createLogger('Auth Routes')

/**
 * POST /api/auth/google
 *
 * Receives a Google credential (ID token) from the frontend,
 * verifies it, upserts the user in PostgreSQL, and returns a JWT.
 */
router.post('/google', async (req: Request, res: Response) => {
  const { credential } = req.body

  if (!credential || typeof credential !== 'string') {
    res.status(400).json({ error: 'Missing required body param: credential' })
    return
  }

  try {
    const googleUser = await verifyGoogleToken(credential)

    const user = await prisma.user.upsert({
      where: { googleId: googleUser.googleId },
      update: {
        email: googleUser.email,
        name: googleUser.name,
        image: googleUser.image,
      },
      create: {
        googleId: googleUser.googleId,
        email: googleUser.email,
        name: googleUser.name,
        image: googleUser.image,
        role: 'BASIC',
      },
    })

    const token = signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    logger.info(`User authenticated: ${user.email} (${user.role})`)

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
      },
    })
  } catch (error: any) {
    logger.error('Google auth failed:', error)
    res.status(401).json({ error: 'Authentication failed', details: error.message })
  }
})

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's profile (fresh from DB).
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    })

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
      },
    })
  } catch (error: any) {
    logger.error('Failed to get user profile:', error)
    res.status(500).json({ error: 'Failed to get user profile', details: error.message })
  }
})

export default router
