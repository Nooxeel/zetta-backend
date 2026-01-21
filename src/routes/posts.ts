import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import prisma from '../lib/prisma'
import { postImageStorage, postVideoStorage } from '../lib/cloudinary'
import { sanitizePost, sanitizeComment } from '../lib/sanitize'
import { createPostLimiter, uploadLimiter, likeLimiter, commentLimiter, sanitizePagination } from '../middleware/rateLimiter'
import { authenticate, optionalAuthenticate, getUserId } from '../middleware/auth'
import { io } from '../index'
import { createLogger } from '../lib/logger'
import { signContentUrls } from '../lib/signedUrl'

const router = Router()
const logger = createLogger('Posts')

/**
 * Check if user has access to subscriber-only content
 */
async function checkSubscriptionAccess(userId: string | null, creatorId: string, requiredTierId?: string | null): Promise<boolean> {
  if (!userId) return false
  
  // Check if user is the creator
  const creator = await prisma.creator.findUnique({ where: { id: creatorId } })
  if (creator?.userId === userId) return true
  
  // Check active subscription
  const subscription = await prisma.subscription.findUnique({
    where: {
      userId_creatorId: { userId, creatorId }
    }
  })
  
  if (!subscription || subscription.status !== 'active') return false
  
  // If specific tier required, check tier matches
  if (requiredTierId && subscription.tierId !== requiredTierId) {
    // TODO: Check tier hierarchy
    return false
  }
  
  return true
}

/**
 * Safely parse JSON with fallback
 * Prevents crashes from corrupted data
 */
function safeJsonParse(content: string, fallback: any = null): any {
  try {
    return JSON.parse(content)
  } catch (error) {
    logger.warn('Failed to parse JSON content:', { content: content?.substring(0, 100) })
    return fallback
  }
}

// SECURITY: Validate file types by magic bytes
const validateVideoMagicBytes = (buffer: Buffer): boolean => {
  const videoSignatures = {
    mp4: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // ftyp
    webm: [0x1A, 0x45, 0xDF, 0xA3], // EBML
    mov: [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74], // ftypqt
  }

  for (const signature of Object.values(videoSignatures)) {
    if (signature.every((byte, index) => buffer[index] === byte)) {
      return true
    }
  }
  return false
}

const validateImageMagicBytes = (buffer: Buffer): boolean => {
  const imageSignatures = {
    jpg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    gif: [0x47, 0x49, 0x46],
    webp: [0x52, 0x49, 0x46, 0x46]
  }

  for (const signature of Object.values(imageSignatures)) {
    if (signature.every((byte, index) => buffer[index] === byte)) {
      return true
    }
  }
  return false
}

// Configuración de multer para subir videos con Cloudinary
const uploadVideo = multer({
  storage: postVideoStorage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']
    if (allowedTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only MP4, WebM, MOV, and MKV videos are allowed.'))
    }
  }
})

// Configuración de multer para subir imágenes con Cloudinary
const uploadImage = multer({
  storage: postImageStorage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (allowedTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'))
    }
  }
})

// GET /api/posts/my-posts - Obtener posts del creador autenticado
router.get('/my-posts', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)

    // Verificar que el usuario es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      return res.status(403).json({ error: 'Only creators can access their posts' })
    }

    const posts = await prisma.post.findMany({
      where: {
        creatorId: creator.id
      },
      include: {
        creator: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                avatar: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Parse content JSON
    const formatted = posts.map(post => ({
      ...post,
      content: safeJsonParse(post.content, [])
    }))

    res.json(formatted)
  } catch (error) {
    logger.error('Get my posts error:', error)
    res.status(500).json({ error: 'Failed to get posts' })
  }
})

// GET /api/posts - Obtener posts de un creador con paginación
// SECURITY: Filters subscriber-only content based on authentication
router.get('/', optionalAuthenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req) || null
    const { creatorId, visibility, cursor, limit = '10' } = req.query

    const where: any = {}

    if (creatorId) {
      where.creatorId = creatorId as string
    }

    // SECURITY: Don't allow directly requesting subscriber-only content
    // Let the filter below handle access control
    if (visibility && visibility !== 'subscriber') {
      where.visibility = visibility as string
    }

    const take = Math.min(parseInt(limit as string), 50) // Max 50 posts per page

    const posts = await prisma.post.findMany({
      where,
      include: {
        creator: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                avatar: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1, // Fetch one extra to check if there are more
      ...(cursor ? { cursor: { id: cursor as string }, skip: 1 } : {})
    })

    const hasMore = posts.length > take
    const postsToReturn = hasMore ? posts.slice(0, take) : posts
    const nextCursor = hasMore ? postsToReturn[postsToReturn.length - 1].id : null

    // SECURITY: Filter posts based on subscription/purchase access
    const formattedPromises = postsToReturn.map(async (post) => {
      const isSubscriberOnly = post.visibility === 'subscribers' || post.requiredTierId
      const isPPV = post.visibility === 'ppv'
      
      // Check PPV access
      if (isPPV) {
        const hasPurchased = await checkPurchaseAccess(userId, post.id)
        // Creator always has access to their own content
        const isCreator = post.creator.userId === userId
        
        if (!hasPurchased && !isCreator) {
          // Return locked version with price info
          const parsedContent = safeJsonParse(post.content, [])
          return {
            ...post,
            content: parsedContent.map((item: any) => ({
              ...item,
              url: undefined, // Hide actual URL
              thumbnail: item.thumbnail || undefined // Keep thumbnail for preview if exists
            })),
            isLocked: true,
            lockReason: 'ppv',
            price: post.price
          }
        }
      }
      
      // Check subscription access
      if (isSubscriberOnly) {
        const hasAccess = await checkSubscriptionAccess(userId, post.creatorId, post.requiredTierId)
        
        if (!hasAccess) {
          // Return locked version of the post
          return {
            ...post,
            content: [], // Hide actual content
            isLocked: true,
            lockReason: post.requiredTierId ? 'tier_required' : 'subscription_required'
          }
        }
      }
      
      // Parse content and sign URLs for premium content protection
      const parsedContent = safeJsonParse(post.content, [])
      const signedContent = Array.isArray(parsedContent) 
        ? signContentUrls(parsedContent, 3600) // URLs expire in 1 hour
        : parsedContent
      
      return {
        ...post,
        content: signedContent,
        isLocked: false
      }
    })

    const formatted = await Promise.all(formattedPromises)

    res.json({
      posts: formatted,
      nextCursor,
      hasMore
    })
  } catch (error) {
    logger.error('Get posts error:', error)
    res.status(500).json({ error: 'Failed to get posts' })
  }
})

// GET /api/posts/:id - Obtener un post específico
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        creator: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                avatar: true
              }
            }
          }
        }
      }
    })

    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    // Incrementar vistas
    await prisma.post.update({
      where: { id },
      data: { views: post.views + 1 }
    })

    // Parse content and sign URLs for premium content protection
    const parsedContent = safeJsonParse(post.content, [])
    const signedContent = Array.isArray(parsedContent) 
      ? signContentUrls(parsedContent, 3600) // URLs expire in 1 hour
      : parsedContent

    res.json({
      ...post,
      content: signedContent
    })
  } catch (error) {
    logger.error('Get post error:', error)
    res.status(500).json({ error: 'Failed to get post' })
  }
})

// POST /api/posts - Crear nuevo post
router.post('/', createPostLimiter, authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { title, description, content, visibility, price, requiredTierId } = req.body

    logger.debug('[CREATE POST] User:', userId)

    // Verificar que el usuario es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      return res.status(403).json({ error: 'Only creators can create posts' })
    }

    // Validar contenido
    if (!content || !Array.isArray(content) || content.length === 0) {
      return res.status(400).json({ error: 'Content is required and must be an array' })
    }

    // Sanitizar contenido para prevenir XSS
    const sanitized = sanitizePost({ title, description, content })

    // Crear post
    const post = await prisma.post.create({
      data: {
        creatorId: creator.id,
        title: sanitized.title,
        description: sanitized.description,
        content: JSON.stringify(sanitized.content),
        visibility: visibility || 'public',
        price: price ? parseFloat(price) : null,
        requiredTierId: requiredTierId || null
      },
      include: {
        creator: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                avatar: true
              }
            }
          }
        }
      }
    })

    res.json({
      ...post,
      content: safeJsonParse(post.content, [])
    })
  } catch (error) {
    logger.error('Create post error:', error)
    res.status(500).json({ error: 'Failed to create post' })
  }
})

// POST /api/posts/upload-video - Subir video
router.post('/upload-video', uploadLimiter, authenticate, uploadVideo.single('video'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' })
    }

    const videoUrl = (req.file as any).path // Cloudinary URL

    res.json({
      success: true,
      url: videoUrl,
      filename: req.file.filename,
      size: req.file.size
    })
  } catch (error) {
    logger.error('Upload video error:', error)
    res.status(500).json({ error: 'Failed to upload video' })
  }
})

// POST /api/posts/upload-image - Subir imagen
router.post('/upload-image', uploadLimiter, authenticate, uploadImage.single('image'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' })
    }

    const imageUrl = (req.file as any).path // Cloudinary URL

    res.json({
      success: true,
      url: imageUrl,
      filename: req.file.filename,
      size: req.file.size
    })
  } catch (error) {
    logger.error('Upload image error:', error)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

// PUT /api/posts/:id - Actualizar post
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { id } = req.params
    const { title, description, content, visibility, price, requiredTierId } = req.body

    // Verificar que el post existe y pertenece al usuario
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        creator: true
      }
    })

    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    if (post.creator.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to edit this post' })
    }

    // Preparar datos sanitizados para actualizar
    const updates: any = {}
    
    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description
    if (visibility !== undefined) updates.visibility = visibility
    if (price !== undefined) updates.price = parseFloat(price)
    if (requiredTierId !== undefined) updates.requiredTierId = requiredTierId
    
    // Si se proporciona contenido, sanitizarlo
    if (content) {
      if (!Array.isArray(content)) {
        return res.status(400).json({ error: 'Content must be an array' })
      }
      const sanitized = sanitizePost({ title, description, content })
      updates.title = sanitized.title
      updates.description = sanitized.description
      updates.content = JSON.stringify(sanitized.content)
    }

    // Actualizar post
    const updated = await prisma.post.update({
      where: { id },
      data: updates,
      include: {
        creator: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                avatar: true
              }
            }
          }
        }
      }
    })

    res.json({
      ...updated,
      content: safeJsonParse(updated.content, [])
    })
  } catch (error) {
    logger.error('Update post error:', error)
    res.status(500).json({ error: 'Failed to update post' })
  }
})

// DELETE /api/posts/:id - Eliminar post
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { id } = req.params

    // Verificar que el post existe y pertenece al usuario
    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        creator: true
      }
    })

    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    if (post.creator.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this post' })
    }

    // Eliminar archivos asociados
    const content = safeJsonParse(post.content, [])
    for (const item of content) {
      if (item.type === 'video' && item.url.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, '../..', item.url)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
    }

    // Eliminar post
    await prisma.post.delete({
      where: { id }
    })

    res.json({ success: true })
  } catch (error) {
    logger.error('Delete post error:', error)
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

// ==================== POST LIKES ====================

// POST /api/posts/:id/like - Toggle like on a post
router.post('/:id/like', likeLimiter, authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { id: postId } = req.params

    // Verificar que el post existe
    const post = await prisma.post.findUnique({
      where: { id: postId }
    })

    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    // Buscar like existente
    const existingLike = await prisma.postLike.findUnique({
      where: {
        postId_userId: {
          postId,
          userId
        }
      }
    })

    if (existingLike) {
      // Unlike: eliminar like y decrementar contador
      await prisma.$transaction([
        prisma.postLike.delete({
          where: { id: existingLike.id }
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likes: { decrement: 1 } }
        })
      ])

      const updatedPost = await prisma.post.findUnique({
        where: { id: postId },
        include: { creator: { select: { userId: true } } }
      })

      // Emit WebSocket event to creator
      if (updatedPost) {
        io.to(`user:${updatedPost.creator.userId}`).emit('stats:update', {
          type: 'like',
          action: 'remove',
          postId,
          totalLikes: updatedPost.likes
        })
      }

      return res.json({
        liked: false,
        likes: updatedPost?.likes || 0
      })
    } else {
      // Like: crear like e incrementar contador
      await prisma.$transaction([
        prisma.postLike.create({
          data: {
            postId,
            userId
          }
        }),
        prisma.post.update({
          where: { id: postId },
          data: { likes: { increment: 1 } }
        })
      ])

      const updatedPost = await prisma.post.findUnique({
        where: { id: postId },
        include: { creator: { select: { userId: true } } }
      })

      // Emit WebSocket event to creator
      if (updatedPost) {
        io.to(`user:${updatedPost.creator.userId}`).emit('stats:update', {
          type: 'like',
          action: 'add',
          postId,
          totalLikes: updatedPost.likes
        })
      }

      return res.json({
        liked: true,
        likes: updatedPost?.likes || 0
      })
    }
  } catch (error) {
    logger.error('Toggle like error:', error)
    res.status(500).json({ error: 'Failed to toggle like' })
  }
})

// GET /api/posts/:id/like-status - Check if current user liked a post
router.get('/:id/like-status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { id: postId } = req.params

    const like = await prisma.postLike.findUnique({
      where: {
        postId_userId: {
          postId,
          userId
        }
      }
    })

    res.json({
      liked: !!like
    })
  } catch (error) {
    logger.error('Get like status error:', error)
    res.status(500).json({ error: 'Failed to get like status' })
  }
})

// GET /api/posts/like-status/batch?postIds=id1,id2,id3 - Check like status for multiple posts (fixes N+1)
router.get('/like-status/batch', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { postIds } = req.query

    if (!postIds || typeof postIds !== 'string') {
      return res.status(400).json({ error: 'postIds query parameter is required' })
    }

    const postIdArray = postIds.split(',').filter(id => id.trim())

    if (postIdArray.length === 0) {
      return res.json({})
    }

    // Single query to get all likes for this user on these posts
    const likes = await prisma.postLike.findMany({
      where: {
        postId: { in: postIdArray },
        userId
      },
      select: {
        postId: true
      }
    })

    // Convert to Set for O(1) lookup
    const likedPostIds = new Set(likes.map((l: { postId: string }) => l.postId))

    // Build response object: { postId: boolean }
    const response = postIdArray.reduce((acc, postId) => {
      acc[postId] = likedPostIds.has(postId)
      return acc
    }, {} as Record<string, boolean>)

    res.json(response)
  } catch (error) {
    logger.error('Get batch like status error:', error)
    res.status(500).json({ error: 'Failed to get batch like status' })
  }
})

// ==================== POST COMMENTS ====================

// GET /api/posts/:id/comments - Get comments for a post
router.get('/:id/comments', async (req: Request, res: Response) => {
  try {
    const { id: postId } = req.params
    const { take, skip } = sanitizePagination(req.query.limit as string, req.query.offset as string, 100, 50)

    const comments = await prisma.postComment.findMany({
      where: {
        postId,
        deletedAt: null
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take,
      skip
    })

    const total = await prisma.postComment.count({
      where: {
        postId,
        deletedAt: null
      }
    })

    res.json({
      comments,
      total
    })
  } catch (error) {
    logger.error('Get comments error:', error)
    res.status(500).json({ error: 'Failed to get comments' })
  }
})

// POST /api/posts/:id/comments - Create a comment
router.post('/:id/comments', commentLimiter, authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { id: postId } = req.params
    const { content } = req.body

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' })
    }

    if (content.length > 1000) {
      return res.status(400).json({ error: 'Comment is too long (max 1000 characters)' })
    }

    // Verificar que el post existe
    const post = await prisma.post.findUnique({
      where: { id: postId }
    })

    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    // Crear comentario e incrementar contador en una transacción
    const [comment] = await prisma.$transaction([
      prisma.postComment.create({
        data: {
          postId,
          userId,
          content: content.trim()
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          }
        }
      }),
      prisma.post.update({
        where: { id: postId },
        data: { comments: { increment: 1 } }
      })
    ])

    res.json(comment)
  } catch (error) {
    logger.error('Create comment error:', error)
    res.status(500).json({ error: 'Failed to create comment' })
  }
})

// DELETE /api/posts/comments/:commentId - Delete a comment
router.delete('/comments/:commentId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { commentId } = req.params

    // Buscar el comentario
    const comment = await prisma.postComment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          include: {
            creator: true
          }
        }
      }
    })

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' })
    }

    // Verificar que el usuario es el autor del comentario o el creador del post
    const isAuthor = comment.userId === userId
    const isCreator = comment.post.creator.userId === userId

    if (!isAuthor && !isCreator) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' })
    }

    // Soft delete y decrementar contador
    await prisma.$transaction([
      prisma.postComment.update({
        where: { id: commentId },
        data: { deletedAt: new Date() }
      }),
      prisma.post.update({
        where: { id: comment.postId },
        data: { comments: { decrement: 1 } }
      })
    ])

    res.json({ success: true })
  } catch (error) {
    logger.error('Delete comment error:', error)
    res.status(500).json({ error: 'Failed to delete comment' })
  }
})

// ==================== PPV (Pay-Per-View) ENDPOINTS ====================

/**
 * Check if user has purchased a PPV post
 */
async function checkPurchaseAccess(userId: string | null, postId: string): Promise<boolean> {
  if (!userId) return false
  
  const purchase = await prisma.contentPurchase.findUnique({
    where: {
      postId_userId: { postId, userId }
    }
  })
  
  return purchase?.status === 'completed'
}

// GET /api/posts/:postId/purchase-status - Check if user has purchased the post
router.get('/:postId/purchase-status', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { postId } = req.params

    const purchase = await prisma.contentPurchase.findUnique({
      where: {
        postId_userId: { postId, userId }
      }
    })

    res.json({
      purchased: purchase?.status === 'completed',
      purchaseDate: purchase?.createdAt || null
    })
  } catch (error) {
    logger.error('Check purchase status error:', error)
    res.status(500).json({ error: 'Failed to check purchase status' })
  }
})

// POST /api/posts/:postId/purchase - Initiate purchase of PPV content
router.post('/:postId/purchase', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { postId } = req.params

    // Get the post
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        creator: {
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        }
      }
    })

    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    // Verify post is PPV and has a price
    if (post.visibility !== 'ppv') {
      return res.status(400).json({ error: 'This post is not pay-per-view content' })
    }

    if (!post.price || post.price <= 0) {
      return res.status(400).json({ error: 'Post does not have a valid price' })
    }

    // Check if user is the creator (can't buy own content)
    if (post.creator.userId === userId) {
      return res.status(400).json({ error: 'You cannot purchase your own content' })
    }

    // Check if already purchased
    const existingPurchase = await prisma.contentPurchase.findUnique({
      where: {
        postId_userId: { postId, userId }
      }
    })

    if (existingPurchase?.status === 'completed') {
      return res.status(400).json({ error: 'You have already purchased this content' })
    }

    // Calculate fees (15% platform fee)
    const platformFeeRate = 0.15
    const platformFee = Math.round(post.price * platformFeeRate)
    const creatorEarnings = post.price - platformFee

    // For now, create a completed purchase directly
    // TODO: Integrate with Webpay for actual payment processing
    const purchase = await prisma.contentPurchase.create({
      data: {
        postId,
        userId,
        amount: post.price,
        currency: 'CLP',
        platformFee,
        creatorEarnings,
        status: 'completed'
      }
    })

    logger.info(`[PPV] User ${userId} purchased post ${postId} for $${post.price} CLP`)

    res.json({
      success: true,
      purchase: {
        id: purchase.id,
        amount: purchase.amount,
        createdAt: purchase.createdAt
      }
    })
  } catch (error) {
    logger.error('Purchase content error:', error)
    res.status(500).json({ error: 'Failed to process purchase' })
  }
})

// GET /api/posts/my-purchases - Get user's purchased content
router.get('/my-purchases', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    const { limit = '20', cursor } = req.query as { limit?: string; cursor?: string }

    const take = Math.min(parseInt(limit) || 20, 50)

    const purchases = await prisma.contentPurchase.findMany({
      where: {
        userId,
        status: 'completed'
      },
      include: {
        post: {
          include: {
            creator: {
              include: {
                user: {
                  select: {
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    })

    const hasMore = purchases.length > take
    const results = hasMore ? purchases.slice(0, -1) : purchases

    // Parse content and sign URLs for purchased posts
    const postsWithContent = await Promise.all(results.map(async (purchase) => {
      const parsedContent = safeJsonParse(purchase.post.content, [])
      const signedContent = await signContentUrls(parsedContent)
      
      return {
        ...purchase,
        post: {
          ...purchase.post,
          content: signedContent
        }
      }
    }))

    res.json({
      purchases: postsWithContent,
      nextCursor: hasMore ? results[results.length - 1].id : null
    })
  } catch (error) {
    logger.error('Get purchases error:', error)
    res.status(500).json({ error: 'Failed to get purchases' })
  }
})

export default router

