import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { verifyGoogleToken, signJwt, hashPassword, comparePassword } from '../lib/auth'
import { authenticate } from '../middleware/auth'
import { createLogger } from '../lib/logger'

const router = Router()
const logger = createLogger('Auth Routes')

/**
 * POST /api/auth/google
 *
 * Receives a Google credential (ID token) from the frontend,
 * verifies it, upserts the user in PostgreSQL, and returns a JWT.
 * Supports account linking: if an email/password user logs in with Google,
 * their account is linked to the Google identity.
 */
router.post('/google', async (req: Request, res: Response) => {
  const { credential } = req.body

  if (!credential || typeof credential !== 'string') {
    res.status(400).json({ error: 'Missing required body param: credential' })
    return
  }

  try {
    const googleUser = await verifyGoogleToken(credential)

    // Check if user exists by googleId
    let user = await prisma.user.findUnique({ where: { googleId: googleUser.googleId } })

    if (user) {
      // Existing Google user — update profile
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: googleUser.email,
          name: googleUser.name,
          image: googleUser.image,
        },
      })
    } else {
      // Check if email already exists (email/password user linking with Google)
      const existingByEmail = await prisma.user.findUnique({ where: { email: googleUser.email } })
      if (existingByEmail) {
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleId: googleUser.googleId,
            name: googleUser.name || existingByEmail.name,
            image: googleUser.image || existingByEmail.image,
          },
        })
      } else {
        user = await prisma.user.create({
          data: {
            googleId: googleUser.googleId,
            email: googleUser.email,
            name: googleUser.name,
            image: googleUser.image,
            role: 'BASIC',
          },
        })
      }
    }

    const token = signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    logger.info(`User authenticated via Google: ${user.email} (${user.role})`)

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
 * POST /api/auth/register
 *
 * Register a new user with email and password.
 */
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Missing required body params: email, password' })
    return
  }

  if (password.length < 4) {
    res.status(400).json({ error: 'Password must be at least 4 characters' })
    return
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' })
      return
    }

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: typeof name === 'string' ? name : null,
        role: 'BASIC',
      },
    })

    const token = signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    logger.info(`User registered: ${user.email}`)

    res.status(201).json({
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
    logger.error('Registration failed:', error)
    res.status(500).json({ error: 'Registration failed', details: error.message })
  }
})

/**
 * POST /api/auth/login
 *
 * Login with email and password.
 */
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Missing required body params: email, password' })
    return
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !user.password) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const isValid = await comparePassword(password, user.password)
    if (!isValid) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const token = signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    logger.info(`User logged in: ${user.email} (${user.role})`)

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
    logger.error('Login failed:', error)
    res.status(500).json({ error: 'Login failed', details: error.message })
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
