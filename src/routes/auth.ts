import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret'

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, username, password, displayName, isCreator } = req.body

    // Validate input
    if (!email || !username || !password || !displayName) {
      return res.status(400).json({ error: 'All fields are required' })
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    })

    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already exists' })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        displayName,
        isCreator: isCreator || false
      }
    })

    // If user is a creator, create creator profile
    if (isCreator) {
      await prisma.creator.create({
        data: {
          userId: user.id
        }
      })
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, isCreator: user.isCreator },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        isCreator: user.isCreator
      },
      token
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        creatorProfile: true
      }
    })

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, isCreator: user.isCreator },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        isCreator: user.isCreator,
        creatorProfile: user.creatorProfile
      },
      token
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Failed to login' })
  }
})

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        creatorProfile: {
          include: {
            musicTracks: true,
            socialLinks: true
          }
        }
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      isCreator: user.isCreator,
      creatorProfile: user.creatorProfile
    })
  } catch (error) {
    console.error('Get me error:', error)
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
