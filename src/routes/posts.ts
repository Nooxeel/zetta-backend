import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { postImageStorage, postVideoStorage } from '../lib/cloudinary'

const router = Router()
const prisma = new PrismaClient()
const JWT_SECRET = process.env.JWT_SECRET || 'apapacho-jwt-secret-2024'

// Middleware de autenticación
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

// Configuración de multer para subir videos con Cloudinary
const uploadVideo = multer({
  storage: postVideoStorage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']
    if (allowedTypes.includes(file.mimetype)) {
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
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'))
    }
  }
})

// GET /api/posts/my-posts - Obtener posts del creador autenticado
router.get('/my-posts', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId

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
      content: JSON.parse(post.content)
    }))

    res.json(formatted)
  } catch (error) {
    console.error('Get my posts error:', error)
    res.status(500).json({ error: 'Failed to get posts' })
  }
})

// GET /api/posts - Obtener posts de un creador
router.get('/', async (req: Request, res: Response) => {
  try {
    const { creatorId, visibility } = req.query

    const where: any = {}
    
    if (creatorId) {
      where.creatorId = creatorId as string
    }
    
    if (visibility) {
      where.visibility = visibility as string
    }

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
      orderBy: { createdAt: 'desc' }
    })

    // Parse content JSON
    const formatted = posts.map(post => ({
      ...post,
      content: JSON.parse(post.content)
    }))

    res.json(formatted)
  } catch (error) {
    console.error('Get posts error:', error)
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

    res.json({
      ...post,
      content: JSON.parse(post.content)
    })
  } catch (error) {
    console.error('Get post error:', error)
    res.status(500).json({ error: 'Failed to get post' })
  }
})

// POST /api/posts - Crear nuevo post
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
    const { title, description, content, visibility, price, requiredTierId } = req.body

    console.log('[CREATE POST] User:', userId)

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

    // Crear post
    const post = await prisma.post.create({
      data: {
        creatorId: creator.id,
        title: title || null,
        description: description || null,
        content: JSON.stringify(content),
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
      content: JSON.parse(post.content)
    })
  } catch (error) {
    console.error('Create post error:', error)
    res.status(500).json({ error: 'Failed to create post' })
  }
})

// POST /api/posts/upload-video - Subir video
router.post('/upload-video', authenticate, uploadVideo.single('video'), async (req: Request, res: Response) => {
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
    console.error('Upload video error:', error)
    res.status(500).json({ error: 'Failed to upload video' })
  }
})

// POST /api/posts/upload-image - Subir imagen
router.post('/upload-image', authenticate, uploadImage.single('image'), async (req: Request, res: Response) => {
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
    console.error('Upload image error:', error)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

// PUT /api/posts/:id - Actualizar post
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
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

    // Actualizar post
    const updated = await prisma.post.update({
      where: { id },
      data: {
        title: title !== undefined ? title : post.title,
        description: description !== undefined ? description : post.description,
        content: content ? JSON.stringify(content) : post.content,
        visibility: visibility || post.visibility,
        price: price !== undefined ? parseFloat(price) : post.price,
        requiredTierId: requiredTierId !== undefined ? requiredTierId : post.requiredTierId
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
      ...updated,
      content: JSON.parse(updated.content)
    })
  } catch (error) {
    console.error('Update post error:', error)
    res.status(500).json({ error: 'Failed to update post' })
  }
})

// DELETE /api/posts/:id - Eliminar post
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId
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
    const content = JSON.parse(post.content)
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
    console.error('Delete post error:', error)
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

export default router
