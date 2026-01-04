import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set.')
}

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

// Plataformas predefinidas con sus iconos
const PLATFORM_ICONS: Record<string, string> = {
  instagram: '📷',
  twitter: '🐦',
  tiktok: '🎵',
  youtube: '▶️',
  twitch: '🎮',
  onlyfans: '🔞',
  fansly: '💜',
  patreon: '🎨',
  discord: '💬',
  telegram: '✈️',
  snapchat: '👻',
  reddit: '🤖',
  facebook: '👥',
  linkedin: '💼',
  github: '💻',
  website: '🌐',
  email: '📧',
  custom: '🔗'
}

// GET /api/sociallinks/:creatorUsername - Obtener links públicos de un creador
router.get('/:creatorUsername', async (req: Request, res: Response): Promise<void> => {
  try {
    const { creatorUsername } = req.params

    // Buscar creador por username
    const user = await prisma.user.findUnique({
      where: { username: creatorUsername },
      include: {
        creatorProfile: {
          include: {
            socialLinks: {
              where: { isVisible: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    })

    if (!user || !user.creatorProfile) {
      res.status(404).json({ error: 'Creator not found' })
      return
    }

    res.json(user.creatorProfile.socialLinks)
  } catch (error) {
    console.error('Get social links error:', error)
    res.status(500).json({ error: 'Failed to fetch social links' })
  }
})

// GET /api/sociallinks/me/all - Obtener todos los links del creador autenticado
router.get('/me/all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId

    const creator = await prisma.creator.findUnique({
      where: { userId },
      include: {
        socialLinks: {
          orderBy: { order: 'asc' }
        }
      }
    })

    if (!creator) {
      res.status(404).json({ error: 'Creator profile not found' })
      return
    }

    res.json(creator.socialLinks)
  } catch (error) {
    console.error('Get my social links error:', error)
    res.status(500).json({ error: 'Failed to fetch social links' })
  }
})

// POST /api/sociallinks - Crear nuevo link
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { platform, url, label, icon } = req.body

    // Validaciones
    if (!platform || !url) {
      res.status(400).json({ error: 'Platform and URL are required' })
      return
    }

    // Validar formato de URL
    try {
      new URL(url)
    } catch {
      res.status(400).json({ error: 'Invalid URL format' })
      return
    }

    const creator = await prisma.creator.findUnique({
      where: { userId },
      include: {
        socialLinks: true
      }
    })

    if (!creator) {
      res.status(404).json({ error: 'Creator profile not found' })
      return
    }

    // Límite de 10 enlaces
    if (creator.socialLinks.length >= 10) {
      res.status(400).json({ error: 'Maximum of 10 social links allowed' })
      return
    }

    // Calcular el siguiente order
    const maxOrder = creator.socialLinks.reduce((max, link) =>
      link.order > max ? link.order : max, -1
    )

    // Obtener icono automático si no se provee
    const finalIcon = icon || PLATFORM_ICONS[platform.toLowerCase()] || PLATFORM_ICONS.custom

    const socialLink = await prisma.socialLink.create({
      data: {
        creatorId: creator.id,
        platform,
        url,
        label: label || null,
        icon: finalIcon,
        order: maxOrder + 1,
        isVisible: true
      }
    })

    res.status(201).json(socialLink)
  } catch (error) {
    console.error('Create social link error:', error)
    res.status(500).json({ error: 'Failed to create social link' })
  }
})

// PUT /api/sociallinks/:id - Actualizar link
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { id } = req.params
    const { platform, url, label, icon, isVisible } = req.body

    // Verificar que el link pertenece al creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(404).json({ error: 'Creator profile not found' })
      return
    }

    const existingLink = await prisma.socialLink.findUnique({
      where: { id }
    })

    if (!existingLink || existingLink.creatorId !== creator.id) {
      res.status(404).json({ error: 'Social link not found' })
      return
    }

    // Validar URL si se está actualizando
    if (url) {
      try {
        new URL(url)
      } catch {
        res.status(400).json({ error: 'Invalid URL format' })
        return
      }
    }

    const updateData: any = { updatedAt: new Date() }
    if (platform !== undefined) updateData.platform = platform
    if (url !== undefined) updateData.url = url
    if (label !== undefined) updateData.label = label || null
    if (icon !== undefined) updateData.icon = icon
    if (isVisible !== undefined) updateData.isVisible = isVisible

    const updatedLink = await prisma.socialLink.update({
      where: { id },
      data: updateData
    })

    res.json(updatedLink)
  } catch (error) {
    console.error('Update social link error:', error)
    res.status(500).json({ error: 'Failed to update social link' })
  }
})

// PUT /api/sociallinks/reorder - Reordenar links
router.put('/reorder/batch', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { linkIds } = req.body // Array de IDs en el nuevo orden

    if (!Array.isArray(linkIds)) {
      res.status(400).json({ error: 'linkIds must be an array' })
      return
    }

    const creator = await prisma.creator.findUnique({
      where: { userId },
      include: {
        socialLinks: true
      }
    })

    if (!creator) {
      res.status(404).json({ error: 'Creator profile not found' })
      return
    }

    // Verificar que todos los IDs pertenecen al creador
    const creatorLinkIds = creator.socialLinks.map(l => l.id)
    const invalidIds = linkIds.filter(id => !creatorLinkIds.includes(id))

    if (invalidIds.length > 0) {
      res.status(400).json({ error: 'Invalid link IDs' })
      return
    }

    // Actualizar el order de cada link
    await prisma.$transaction(
      linkIds.map((linkId, index) =>
        prisma.socialLink.update({
          where: { id: linkId },
          data: {
            order: index,
            updatedAt: new Date()
          }
        })
      )
    )

    // Retornar los links actualizados
    const updatedLinks = await prisma.socialLink.findMany({
      where: { creatorId: creator.id },
      orderBy: { order: 'asc' }
    })

    res.json(updatedLinks)
  } catch (error) {
    console.error('Reorder social links error:', error)
    res.status(500).json({ error: 'Failed to reorder social links' })
  }
})

// DELETE /api/sociallinks/:id - Eliminar link
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { id } = req.params

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(404).json({ error: 'Creator profile not found' })
      return
    }

    const existingLink = await prisma.socialLink.findUnique({
      where: { id }
    })

    if (!existingLink || existingLink.creatorId !== creator.id) {
      res.status(404).json({ error: 'Social link not found' })
      return
    }

    await prisma.socialLink.delete({
      where: { id }
    })

    res.json({ message: 'Social link deleted successfully' })
  } catch (error) {
    console.error('Delete social link error:', error)
    res.status(500).json({ error: 'Failed to delete social link' })
  }
})

// GET /api/sociallinks/platforms/list - Obtener lista de plataformas disponibles
router.get('/platforms/list', (req: Request, res: Response): void => {
  const platforms = Object.entries(PLATFORM_ICONS).map(([key, icon]) => ({
    value: key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    icon
  }))

  res.json(platforms)
})

export default router
