import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { sanitizeCreatorProfile } from '../lib/sanitize'
import { authenticate, optionalAuthenticate } from '../middleware/auth'
import { creatorCache } from '../lib/cache'
import { createLogger } from '../lib/logger'
import { isUserBlockedByUsername } from '../middleware/blockCheck'
import { sanitizePagination, publicProfileLimiter } from '../middleware/rateLimiter'

const router = Router()
const logger = createLogger('Creator')

// Helper para construir respuesta de creador
async function buildCreatorResponse(username: string) {
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
    return null
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

  return {
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
  }
}

// Get creator profile by username (con caché)
// Rate limited to prevent profile enumeration
router.get('/username/:username', publicProfileLimiter, optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const { username } = req.params
    const userId = (req as any).userId

    // Verificar si el usuario está bloqueado por este creador
    if (userId) {
      const isBlocked = await isUserBlockedByUsername(username, userId)
      if (isBlocked) {
        return res.status(403).json({ 
          error: 'No tienes acceso a este perfil',
          code: 'USER_BLOCKED'
        })
      }
    }

    const cacheKey = `creator:${username}`

    // Intentar obtener del caché
    const cached = creatorCache.get(cacheKey)
    if (cached) {
      logger.debug(`Cache hit for creator: ${username}`)
      return res.json(cached)
    }

    // Si no está en caché, obtener de la DB
    const response = await buildCreatorResponse(username)

    if (!response) {
      return res.status(404).json({ error: 'Creator not found' })
    }

    // Guardar en caché
    creatorCache.set(cacheKey, response)
    logger.debug(`Cache miss, stored creator: ${username}`)

    res.json(response)
  } catch (error) {
    logger.error('Get creator error:', error)
    res.status(500).json({ error: 'Failed to get creator' })
  }
})

// Get profile audit logs (authenticated - creator only)
// NOTE: This route must be before /:id to avoid being captured
router.get('/audit-logs', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    const { take, skip } = sanitizePagination(req.query.limit as string, req.query.offset as string, 50)

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      return res.status(404).json({ error: 'Creator profile not found' })
    }

    const logs = await prisma.profileAuditLog.findMany({
      where: { creatorId: creator.id },
      take,
      skip,
      orderBy: { createdAt: 'desc' }
    })

    const total = await prisma.profileAuditLog.count({
      where: { creatorId: creator.id }
    })

    res.json({
      logs,
      total,
      limit: take,
      offset: skip
    })
  } catch (error) {
    logger.error('Get audit logs error:', error)
    res.status(500).json({ error: 'Failed to get audit logs' })
  }
})

// Get current user's creator profile (authenticated)
// NOTE: This route must be before /:id to avoid being captured
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    logger.debug('Searching creator for userId:', userId)

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
            avatar: true
            // SECURITY: email removed - should not be exposed to other users
          }
        }
      }
    })

    logger.debug('Creator found:', creator ? 'YES' : 'NO')

    if (!creator) {
      return res.status(404).json({ error: 'Creator not found' })
    }

    res.json(creator)
  } catch (error) {
    logger.error('Get creator profile error:', error)
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
    logger.error('Get creator error:', error)
    res.status(500).json({ error: 'Failed to get creator' })
  }
})

// Update creator profile (authenticated) - JSON only, images use /upload endpoints
router.put('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    
    const {
      bio,
      bioTitle,
      extendedInfo,
      extendedInfoTitle,
      backgroundColor,
      backgroundGradient,
      backgroundImage,
      accentColor,
      textColor,
      fontFamily,
      coverImage,
      visibilitySettings
    } = req.body

    // Get creator profile
    const creator = await prisma.creator.findUnique({
      where: { userId },
      include: { user: { select: { username: true } } }
    })

    if (!creator) {
      return res.status(404).json({ error: 'Creator profile not found' })
    }

    // Invalidar caché del creador
    const username = creator.user?.username
    if (username) {
      creatorCache.delete(`creator:${username}`)
      logger.debug(`Invalidated cache for creator: ${username}`)
    }

    // Get client info for audit
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
    const userAgent = req.headers['user-agent'] || 'unknown'

    // Sanitizar datos del perfil para prevenir XSS
    const sanitizedBody = sanitizeCreatorProfile({
      bio,
      bioTitle,
      extendedInfo,
      extendedInfoTitle,
      backgroundColor,
      backgroundGradient,
      backgroundImage,
      accentColor,
      textColor,
      fontFamily,
      coverImage,
      visibilitySettings
    })

    // Fields to track for audit
    const fieldsToTrack = {
      bio: sanitizedBody.bio,
      bioTitle: sanitizedBody.bioTitle,
      extendedInfo: sanitizedBody.extendedInfo,
      extendedInfoTitle: sanitizedBody.extendedInfoTitle,
      backgroundColor: sanitizedBody.backgroundColor,
      backgroundGradient: sanitizedBody.backgroundGradient,
      backgroundImage: sanitizedBody.backgroundImage,
      accentColor: sanitizedBody.accentColor,
      textColor: sanitizedBody.textColor,
      fontFamily: sanitizedBody.fontFamily,
      coverImage: sanitizedBody.coverImage
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
      bio: sanitizedBody.bio,
      bioTitle: sanitizedBody.bioTitle,
      extendedInfo: sanitizedBody.extendedInfo,
      extendedInfoTitle: sanitizedBody.extendedInfoTitle,
      backgroundColor: sanitizedBody.backgroundColor,
      backgroundGradient: sanitizedBody.backgroundGradient,
      backgroundImage: sanitizedBody.backgroundImage,
      accentColor: sanitizedBody.accentColor,
      textColor: sanitizedBody.textColor,
      fontFamily: sanitizedBody.fontFamily,
      visibilitySettings: sanitizedBody.visibilitySettings
    }

    // Add coverImage if provided
    if (sanitizedBody.coverImage) {
      updateData.coverImage = sanitizedBody.coverImage
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
    logger.error('Update profile error:', error)
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

    // Invalidar caché del creador
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
    if (user?.username) {
      creatorCache.delete(user.username)
      logger.debug('Cache invalidated for', user.username)
    }

    res.status(201).json(track)
  } catch (error) {
    logger.error('Add music error:', error)
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

    // Invalidar caché del creador
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
    if (user?.username) {
      creatorCache.delete(user.username)
      logger.debug('Cache invalidated for', user.username)
    }

    res.json({ message: 'Track deleted' })
  } catch (error) {
    logger.error('Delete music error:', error)
    res.status(500).json({ error: 'Failed to delete music track' })
  }
})

// Get all creators (for explore page)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { take, skip } = sanitizePagination(req.query.limit as string, req.query.offset as string, 50, 20)

    const creators = await prisma.creator.findMany({
      take,
      skip,
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
    logger.error('Get creators error:', error)
    res.status(500).json({ error: 'Failed to get creators' })
  }
})

// GET /api/creators/:id/stats - Get real-time stats for a creator
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const { id: creatorId } = req.params

    // Get total likes from all posts
    const likesResult = await prisma.post.aggregate({
      where: { creatorId },
      _sum: { likes: true }
    })

    // Get total comments from all posts
    const commentsResult = await prisma.post.aggregate({
      where: { creatorId },
      _sum: { comments: true }
    })

    res.json({
      totalLikes: likesResult._sum.likes || 0,
      totalPostComments: commentsResult._sum.comments || 0
    })
  } catch (error) {
    logger.error('Get creator stats error:', error)
    res.status(500).json({ error: 'Failed to get creator stats' })
  }
})

export default router
