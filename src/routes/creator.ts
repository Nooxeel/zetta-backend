import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import prisma from '../lib/prisma'
import { profileImageStorage } from '../lib/cloudinary'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret'

// Configure multer for profile images
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

// Middleware to verify JWT and get user
const authenticate = async (req: Request, res: Response, next: Function) => {
  try {
    console.log('[AUTH] Checking authorization header...')
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[AUTH] No token provided')
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; isCreator: boolean }
    
    console.log('[AUTH] Token decoded, userId:', decoded.userId)
    ;(req as any).userId = decoded.userId
    ;(req as any).isCreator = decoded.isCreator
    
    next()
  } catch (error) {
    console.log('[AUTH] Token verification failed:', error)
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Get creator profile by username
router.get('/username/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params

    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        creatorProfile: {
          include: {
            musicTracks: {
              orderBy: { order: 'asc' }
            },
            socialLinks: true,
            subscriptionTiers: {
              where: { isActive: true },
              orderBy: { order: 'asc' }
            },
            posts: {
              select: {
                id: true,
                likes: true,
                views: true,
                content: true
              }
            },
            _count: {
              select: {
                subscribers: true,
                posts: true
              }
            }
          }
        }
      }
    })

    if (!user || !user.creatorProfile) {
      return res.status(404).json({ error: 'Creator not found' })
    }

    // Calculate stats
    const posts = user.creatorProfile.posts || []
    const totalLikes = posts.reduce((acc, post) => acc + post.likes, 0)
    const totalViews = posts.reduce((acc, post) => acc + post.views, 0)
    
    // Count media types by parsing content JSON
    let photosCount = 0
    let videosCount = 0
    let audioCount = 0
    
    posts.forEach(post => {
      try {
        const content = typeof post.content === 'string' 
          ? JSON.parse(post.content) 
          : post.content
        
        if (Array.isArray(content)) {
          const hasVideo = content.some((item: any) => item.type === 'video')
          const hasPhoto = content.some((item: any) => item.type === 'image')
          const hasAudio = content.some((item: any) => item.type === 'audio')
          
          if (hasVideo) videosCount++
          else if (hasPhoto) photosCount++
          else if (hasAudio) audioCount++
        }
      } catch (e) {
        // If content parsing fails, skip this post
      }
    })

    // Remove posts array from response and add calculated stats
    const { posts: _, _count, ...creatorProfile } = user.creatorProfile

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      creatorProfile: {
        ...creatorProfile,
        stats: {
          totalLikes,
          totalViews,
          postsCount: _count.posts,
          photosCount,
          videosCount,
          subscribersCount: _count.subscribers,
          audioCount
        }
      }
    })
  } catch (error) {
    console.error('Get creator error:', error)
    res.status(500).json({ error: 'Failed to get creator' })
  }
})

// Get profile audit logs (authenticated - creator only)
// NOTE: This route must be before /:id to avoid being captured
router.get('/audit-logs', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    const { limit = 50, offset = 0 } = req.query

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      return res.status(404).json({ error: 'Creator profile not found' })
    }

    const logs = await prisma.profileAuditLog.findMany({
      where: { creatorId: creator.id },
      take: Number(limit),
      skip: Number(offset),
      orderBy: { createdAt: 'desc' }
    })

    const total = await prisma.profileAuditLog.count({
      where: { creatorId: creator.id }
    })

    res.json({
      logs,
      total,
      limit: Number(limit),
      offset: Number(offset)
    })
  } catch (error) {
    console.error('Get audit logs error:', error)
    res.status(500).json({ error: 'Failed to get audit logs' })
  }
})

// Get current user's creator profile (authenticated)
// NOTE: This route must be before /:id to avoid being captured
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    console.log('[GET /profile] Searching creator for userId:', userId)

    const creator = await prisma.creator.findUnique({
      where: { userId },
      include: {
        musicTracks: {
          orderBy: { order: 'asc' }
        },
        socialLinks: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            email: true
          }
        }
      }
    })

    console.log('[GET /profile] Creator found:', creator ? 'YES' : 'NO')

    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' })
    }

    res.json(creator)
  } catch (error) {
    console.error('Get creator profile error:', error)
    res.status(500).json({ error: 'Failed to get creator profile' })
  }
})

// Get creator profile by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const creator = await prisma.creator.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        },
        musicTracks: {
          orderBy: { order: 'asc' }
        },
        socialLinks: true,
        subscriptionTiers: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    })

    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' })
    }

    res.json(creator)
  } catch (error) {
    console.error('Get creator error:', error)
    res.status(500).json({ error: 'Failed to get creator' })
  }
})

// Update creator profile (authenticated)
router.put('/profile', authenticate, profileUpload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'coverImage', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    
    const {
      bio,
      backgroundColor,
      backgroundGradient,
      backgroundImage,
      accentColor,
      textColor,
      fontFamily,
      coverImage
    } = req.body

    // Get uploaded file URLs from Cloudinary
    let profileImageUrl = null
    let coverImageUrl = null

    if (files?.profileImage?.[0]) {
      profileImageUrl = files.profileImage[0].path
    }

    if (files?.coverImage?.[0]) {
      coverImageUrl = files.coverImage[0].path
    }

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

    // Fields to track for audit
    const fieldsToTrack = {
      bio,
      backgroundColor,
      backgroundGradient,
      backgroundImage,
      accentColor,
      textColor,
      fontFamily,
      coverImage
    }

    // Create audit logs for changed fields
    const auditLogs = []
    for (const [fieldName, newValue] of Object.entries(fieldsToTrack)) {
      if (newValue !== undefined) {
        const oldValue = (creator as any)[fieldName]
        if (oldValue !== newValue) {
          auditLogs.push({
            creatorId: creator.id,
            fieldName,
            oldValue: oldValue?.toString() || null,
            newValue: newValue?.toString() || null,
            changeType: oldValue ? 'update' : 'create',
            ipAddress,
            userAgent
          })
        }
      }
    }

    // Update profile and create audit logs in transaction
    const updateData: any = {
      bio,
      backgroundColor,
      backgroundGradient,
      backgroundImage,
      accentColor,
      textColor,
      fontFamily
    }

    // Add image URLs if uploaded
    if (profileImageUrl) {
      updateData.profileImage = profileImageUrl
    }
    if (coverImageUrl || coverImage) {
      updateData.coverImage = coverImageUrl || coverImage
    }

    const [updated] = await prisma.$transaction([
      prisma.creator.update({
        where: { id: creator.id },
        data: updateData,
        include: {
          musicTracks: {
            orderBy: { order: 'asc' }
          },
          socialLinks: true
        }
      }),
      ...(auditLogs.length > 0 
        ? [prisma.profileAuditLog.createMany({ data: auditLogs })]
        : [prisma.$queryRaw`SELECT 1`] // No-op if no changes
      )
    ])

    res.json(updated)
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

// Add music track
router.post('/music', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    const { youtubeUrl, youtubeId, title, artist, thumbnail } = req.body

    const creator = await prisma.creator.findUnique({
      where: { userId },
      include: { musicTracks: true }
    })

    if (!creator) {
      return res.status(404).json({ error: 'Creator profile not found' })
    }

    // Check limit (max 3 tracks)
    if (creator.musicTracks.length >= 3) {
      return res.status(400).json({ error: 'Maximum 3 music tracks allowed' })
    }

    const track = await prisma.musicTrack.create({
      data: {
        creatorId: creator.id,
        youtubeUrl,
        youtubeId,
        title,
        artist,
        thumbnail,
        order: creator.musicTracks.length
      }
    })

    res.status(201).json(track)
  } catch (error) {
    console.error('Add music error:', error)
    res.status(500).json({ error: 'Failed to add music track' })
  }
})

// Delete music track
router.delete('/music/:trackId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    const { trackId } = req.params

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      return res.status(404).json({ error: 'Creator profile not found' })
    }

    // Verify track belongs to creator
    const track = await prisma.musicTrack.findFirst({
      where: { id: trackId, creatorId: creator.id }
    })

    if (!track) {
      return res.status(404).json({ error: 'Track not found' })
    }

    await prisma.musicTrack.delete({
      where: { id: trackId }
    })

    res.json({ message: 'Track deleted' })
  } catch (error) {
    console.error('Delete music error:', error)
    res.status(500).json({ error: 'Failed to delete music track' })
  }
})

// Get all creators (for explore page)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = 20, offset = 0 } = req.query

    const creators = await prisma.creator.findMany({
      take: Number(limit),
      skip: Number(offset),
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        },
        _count: {
          select: {
            subscribers: true,
            posts: true
          }
        }
      },
      orderBy: {
        subscribers: {
          _count: 'desc'
        }
      }
    })

    res.json(creators)
  } catch (error) {
    console.error('Get creators error:', error)
    res.status(500).json({ error: 'Failed to get creators' })
  }
})

export default router
