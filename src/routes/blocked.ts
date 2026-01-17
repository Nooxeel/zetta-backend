import { Router, Request, Response } from 'express'
import { createLogger } from '../lib/logger'
import prisma from '../lib/prisma'
import { authenticate } from '../middleware/auth'

const router = Router()
const logger = createLogger('Blocked')

// POST /api/creator/block/:userId - Bloquear un usuario
router.post('/:userId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const creatorUserId = (req as any).userId
    const { userId: targetUserId } = req.params
    const { reason } = req.body

    // Verificar que el usuario autenticado es creador
    const creator = await prisma.creator.findUnique({
      where: { userId: creatorUserId },
      include: { user: { select: { username: true } } }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden bloquear usuarios' })
      return
    }

    // Verificar que el usuario a bloquear existe
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, displayName: true }
    })

    if (!targetUser) {
      res.status(404).json({ error: 'Usuario no encontrado' })
      return
    }

    // No permitir bloquearse a sí mismo
    if (targetUserId === creatorUserId) {
      res.status(400).json({ error: 'No puedes bloquearte a ti mismo' })
      return
    }

    // Verificar si ya está bloqueado
    const existingBlock = await prisma.blockedUser.findUnique({
      where: {
        creatorId_blockedUserId: {
          creatorId: creator.id,
          blockedUserId: targetUserId
        }
      }
    })

    if (existingBlock) {
      res.status(400).json({ error: 'Este usuario ya está bloqueado' })
      return
    }

    // Crear el bloqueo
    const blocked = await prisma.blockedUser.create({
      data: {
        creatorId: creator.id,
        blockedUserId: targetUserId,
        reason: reason || null
      },
      include: {
        blockedUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        }
      }
    })

    // Cancelar suscripción activa si existe
    await prisma.subscription.updateMany({
      where: {
        creatorId: creator.id,
        userId: targetUserId,
        status: 'active'
      },
      data: {
        status: 'cancelled',
        autoRenew: false
      }
    })

    // Archivar conversación si existe
    await prisma.conversation.updateMany({
      where: {
        OR: [
          { participant1Id: creatorUserId, participant2Id: targetUserId },
          { participant1Id: targetUserId, participant2Id: creatorUserId }
        ]
      },
      data: {
        status: 'blocked'
      }
    })

    logger.info(`Creator ${creator.user.username} blocked user ${targetUser.username}`)

    res.status(201).json({
      success: true,
      message: 'Usuario bloqueado exitosamente',
      blocked: {
        id: blocked.id,
        user: blocked.blockedUser,
        reason: blocked.reason,
        createdAt: blocked.createdAt
      }
    })
  } catch (error) {
    logger.error('Error al bloquear usuario:', error)
    res.status(500).json({ error: 'Error al bloquear usuario' })
  }
})

// DELETE /api/creator/block/:userId - Desbloquear un usuario
router.delete('/:userId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const creatorUserId = (req as any).userId
    const { userId: targetUserId } = req.params

    // Verificar que el usuario autenticado es creador
    const creator = await prisma.creator.findUnique({
      where: { userId: creatorUserId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden desbloquear usuarios' })
      return
    }

    // Buscar el bloqueo
    const block = await prisma.blockedUser.findUnique({
      where: {
        creatorId_blockedUserId: {
          creatorId: creator.id,
          blockedUserId: targetUserId
        }
      }
    })

    if (!block) {
      res.status(404).json({ error: 'Este usuario no está bloqueado' })
      return
    }

    // Eliminar el bloqueo
    await prisma.blockedUser.delete({
      where: { id: block.id }
    })

    // Restaurar conversación si existe
    await prisma.conversation.updateMany({
      where: {
        OR: [
          { participant1Id: creatorUserId, participant2Id: targetUserId },
          { participant1Id: targetUserId, participant2Id: creatorUserId }
        ],
        status: 'blocked'
      },
      data: {
        status: 'active'
      }
    })

    logger.info(`Creator unblocked user ${targetUserId}`)

    res.json({
      success: true,
      message: 'Usuario desbloqueado exitosamente'
    })
  } catch (error) {
    logger.error('Error al desbloquear usuario:', error)
    res.status(500).json({ error: 'Error al desbloquear usuario' })
  }
})

// GET /api/creator/blocked - Listar usuarios bloqueados
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const creatorUserId = (req as any).userId
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20

    // Verificar que el usuario autenticado es creador
    const creator = await prisma.creator.findUnique({
      where: { userId: creatorUserId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden ver usuarios bloqueados' })
      return
    }

    const [blockedUsers, total] = await Promise.all([
      prisma.blockedUser.findMany({
        where: { creatorId: creator.id },
        include: {
          blockedUser: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.blockedUser.count({
        where: { creatorId: creator.id }
      })
    ])

    res.json({
      blockedUsers: blockedUsers.map(b => ({
        id: b.id,
        user: b.blockedUser,
        reason: b.reason,
        createdAt: b.createdAt
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    logger.error('Error al obtener usuarios bloqueados:', error)
    res.status(500).json({ error: 'Error al obtener usuarios bloqueados' })
  }
})

// GET /api/creator/block/check/:userId - Verificar si un usuario está bloqueado
router.get('/check/:userId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const creatorUserId = (req as any).userId
    const { userId: targetUserId } = req.params

    // Verificar que el usuario autenticado es creador
    const creator = await prisma.creator.findUnique({
      where: { userId: creatorUserId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden verificar bloqueos' })
      return
    }

    const block = await prisma.blockedUser.findUnique({
      where: {
        creatorId_blockedUserId: {
          creatorId: creator.id,
          blockedUserId: targetUserId
        }
      }
    })

    res.json({
      isBlocked: !!block,
      blockedAt: block?.createdAt || null,
      reason: block?.reason || null
    })
  } catch (error) {
    logger.error('Error al verificar bloqueo:', error)
    res.status(500).json({ error: 'Error al verificar bloqueo' })
  }
})

// GET /api/block/am-i-blocked/:creatorUsername - Verificar si estoy bloqueado por un creador (para fans)
router.get('/am-i-blocked/:creatorUsername', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { creatorUsername } = req.params

    // Buscar el creador por username
    const creator = await prisma.creator.findFirst({
      where: {
        user: { username: creatorUsername }
      }
    })

    if (!creator) {
      res.status(404).json({ error: 'Creador no encontrado' })
      return
    }

    const block = await prisma.blockedUser.findUnique({
      where: {
        creatorId_blockedUserId: {
          creatorId: creator.id,
          blockedUserId: userId
        }
      }
    })

    res.json({
      isBlocked: !!block
    })
  } catch (error) {
    logger.error('Error al verificar si estoy bloqueado:', error)
    res.status(500).json({ error: 'Error al verificar bloqueo' })
  }
})

export default router
