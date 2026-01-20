import { Router, Request, Response } from 'express'
import { createLogger } from '../lib/logger'
import multer from 'multer'
import jwt from 'jsonwebtoken'
import path from 'path'
import prisma from '../lib/prisma'
import { profileImageStorage, cloudinary } from '../lib/cloudinary'

const router = Router()
const logger = createLogger('Upload')

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set. Application cannot start without it.')
}

// SECURITY: Validate image file types by magic bytes (not just MIME type)
const validateImageMagicBytes = (buffer: Buffer): { valid: boolean; detectedType: string | null } => {
  // Check for common image file signatures (magic bytes)
  const magicNumbers: { [key: string]: number[] } = {
    jpg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    gif: [0x47, 0x49, 0x46],
    webp: [0x52, 0x49, 0x46, 0x46] // RIFF (WebP starts with RIFF)
  }

  // Check if buffer starts with any known image magic number
  for (const [type, signature] of Object.entries(magicNumbers)) {
    if (signature.every((byte, index) => buffer[index] === byte)) {
      // Additional check for WebP (RIFF can be other formats)
      if (type === 'webp') {
        const webpSignature = [0x57, 0x45, 0x42, 0x50] // "WEBP"
        if (!webpSignature.every((byte, index) => buffer[index + 8] === byte)) {
          continue
        }
      }
      return { valid: true, detectedType: type }
    }
  }

  return { valid: false, detectedType: null }
}

// Memory storage for validation before Cloudinary upload
const memoryStorage = multer.memoryStorage()

// SECURITY: First line of defense - check MIME type (can be spoofed)
const imageFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  if (allowedTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'))
  }
}

// Pre-validation upload (to memory for magic byte check)
const preValidationUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter
})

// SECURITY: Middleware to validate magic bytes after multer processes file
const validateMagicBytes = (req: Request, res: Response, next: Function) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'No file uploaded' })
  }
  
  const validation = validateImageMagicBytes(req.file.buffer)
  
  if (!validation.valid) {
    logger.warn(`[Security] Invalid file magic bytes from user ${(req as any).userId}, MIME: ${req.file.mimetype}`)
    return res.status(400).json({ 
      error: 'Invalid file content. File signature does not match an allowed image type.' 
    })
  }
  
  logger.debug(`[Upload] File validated: ${validation.detectedType}, size: ${req.file.size}`)
  next()
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

// Upload avatar (saves to Cloudinary)
// Cloudinary performs its own content validation, but we log for security auditing
router.post('/avatar', authenticate, profileUpload.single('avatar'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const userId = (req as any).userId
    const cloudinaryFile = req.file as any
    const avatarUrl = cloudinaryFile.path // Cloudinary URL

    // SECURITY: Verify Cloudinary processed it as an image
    if (cloudinaryFile.format && !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(cloudinaryFile.format)) {
      logger.warn(`[Security] Non-image format uploaded by user ${userId}: ${cloudinaryFile.format}`)
      // Delete from Cloudinary
      try {
        await cloudinary.uploader.destroy(cloudinaryFile.public_id)
      } catch (e) {
        logger.error('Failed to delete invalid file from Cloudinary:', e)
      }
      return res.status(400).json({ error: 'Invalid image format' })
    }

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
    logger.error('Upload avatar error:', error)
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
    // Also update user.avatar to keep them in sync
    await prisma.$transaction([
      prisma.creator.update({
        where: { id: creator.id },
        data: { profileImage: profileUrl }
      }),
      prisma.user.update({
        where: { id: userId },
        data: { avatar: profileUrl }
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
    logger.error('Upload profile error:', error)
    res.status(500).json({ error: 'Failed to upload profile image' })
  }
})

// Upload cover image (for creators)
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
    logger.error('Upload cover error:', error)
    res.status(500).json({ error: 'Failed to upload cover image' })
  }
})

// DISABLED: Fans should not be able to upload cover images (only profile avatar)
// Upload cover image for fans (users) - COMMENTED OUT
/*
router.post('/user/cover', authenticate, profileUpload.single('coverImage'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const userId = (req as any).userId
    const coverUrl = (req.file as any).path // Cloudinary URL

    // Update user cover image
    await prisma.user.update({
      where: { id: userId },
      data: { coverImage: coverUrl }
    })

    res.json({
      message: 'Cover image uploaded successfully',
      url: coverUrl
    })
  } catch (error) {
    logger.error('Upload user cover error:', error)
    res.status(500).json({ error: 'Failed to upload cover image' })
  }
})
*/

export default router
