import { Router, Request, Response } from 'express'
import multer from 'multer'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'
import { profileImageStorage, cloudinary } from '../lib/cloudinary'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret'

const imageFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'))
  }
}

const profileUpload = multer({
  storage: profileImageStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter
})

// Middleware to verify JWT
const authenticate = async (req: Request, res: Response, next: Function) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    
    ;(req as any).userId = decoded.userId
    
    next()
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Upload avatar (saves to frontend public/images)
router.post('/avatar', authenticate, profileUpload.single('avatar'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const userId = (req as any).userId
    const ext = path.extname(req.file.originalname)
    const avatarUrl = `/images/${userId}/avatar${ext}`

    // Update user avatar
    await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl }
    })

    res.json({ 
      message: 'Avatar uploaded successfully',
      url: avatarUrl 
    })
  } catch (error) {
    console.error('Upload avatar error:', error)
    res.status(500).json({ error: 'Failed to upload avatar' })
  }
})

// Upload profile image
router.post('/profile', authenticate, profileUpload.single('profileImage'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const userId = (req as any).userId
    const profileUrl = (req.file as any).path // Cloudinary URL

    // Get creator profile
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      return res.status(404).json({ error: 'Creator profile not found' })
    }

    // Get client info for audit
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
    const userAgent = req.headers['user-agent'] || 'unknown'
    const oldValue = creator.profileImage

    // Update profile image and create audit log in transaction
    await prisma.$transaction([
      prisma.creator.update({
        where: { id: creator.id },
        data: { profileImage: profileUrl }
      }),
      prisma.profileAuditLog.create({
        data: {
          creatorId: creator.id,
          fieldName: 'profileImage',
          oldValue: oldValue || null,
          newValue: profileUrl,
          changeType: oldValue ? 'update' : 'create',
          ipAddress,
          userAgent
        }
      })
    ])

    res.json({ 
      message: 'Profile image uploaded successfully',
      url: profileUrl 
    })
  } catch (error) {
    console.error('Upload profile error:', error)
    res.status(500).json({ error: 'Failed to upload profile image' })
  }
})

// Upload cover image
router.post('/cover', authenticate, profileUpload.single('coverImage'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const userId = (req as any).userId
    const coverUrl = (req.file as any).path // Cloudinary URL

    // Get creator profile
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      return res.status(404).json({ error: 'Creator profile not found' })
    }

    // Get client info for audit
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
    const userAgent = req.headers['user-agent'] || 'unknown'
    const oldValue = creator.coverImage

    // Update cover image and create audit log in transaction
    await prisma.$transaction([
      prisma.creator.update({
        where: { id: creator.id },
        data: { coverImage: coverUrl }
      }),
      prisma.profileAuditLog.create({
        data: {
          creatorId: creator.id,
          fieldName: 'coverImage',
          oldValue: oldValue || null,
          newValue: coverUrl,
          changeType: oldValue ? 'update' : 'create',
          ipAddress,
          userAgent
        }
      })
    ])

    res.json({ 
      message: 'Cover image uploaded successfully',
      url: coverUrl 
    })
  } catch (error) {
    console.error('Upload cover error:', error)
    res.status(500).json({ error: 'Failed to upload cover image' })
  }
})

export default router
