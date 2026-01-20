import { Router, Request, Response } from 'express'
import { createLogger } from '../lib/logger'
import prisma from '../lib/prisma'
import { authenticate, getUserId } from '../middleware/auth'
import { io } from '../index'

const router = Router()
const logger = createLogger('Broadcasts')

// ==================== CREATOR ENDPOINTS ====================

// POST /api/broadcasts - Crear y enviar broadcast
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req)
    const { 
      content, 
      mediaUrl, 
      mediaType,
      targetType = 'ALL_SUBSCRIBERS',
      targetTierIds = [],
      scheduledFor 
    } = req.body

    // Verificar que es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden enviar broadcasts' })
      return
    }

    if (!content?.trim()) {
      res.status(400).json({ error: 'El contenido es requerido' })
      return
    }

    // Validar targetType
    const validTargets = ['ALL_SUBSCRIBERS', 'SPECIFIC_TIERS', 'NEW_SUBSCRIBERS', 'EXPIRING_SOON']
    if (!validTargets.includes(targetType)) {
      res.status(400).json({ error: 'Tipo de destinatarios inválido' })
      return
    }

    // Si es SPECIFIC_TIERS, validar que haya tiers
    if (targetType === 'SPECIFIC_TIERS' && (!targetTierIds || targetTierIds.length === 0)) {
      res.status(400).json({ error: 'Debes seleccionar al menos un plan' })
      return
    }

    // Determinar status inicial
    const now = new Date()
    let status: 'PENDING' | 'SCHEDULED' = 'PENDING'
    if (scheduledFor && new Date(scheduledFor) > now) {
      status = 'SCHEDULED'
    }

    // Crear broadcast
    const broadcast = await prisma.broadcast.create({
      data: {
        creatorId: creator.id,
        content: content.trim(),
        mediaUrl,
        mediaType,
        targetType,
        targetTierIds,
        status,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null
      }
    })

    // Si no está programado, procesar inmediatamente
    if (status === 'PENDING') {
      // Procesar en background para no bloquear la respuesta
      processBroadcast(broadcast.id, creator.id, userId).catch(err => {
        logger.error('Error processing broadcast:', err)
      })
    }

    logger.info(`Creator ${creator.id} created broadcast ${broadcast.id}`)

    res.status(201).json({
      success: true,
      broadcast: {
        ...broadcast,
        statusMessage: status === 'SCHEDULED' 
          ? 'Mensaje programado' 
          : 'Enviando mensajes...'
      }
    })
  } catch (error) {
    logger.error('Error al crear broadcast:', error)
    res.status(500).json({ error: 'Error al crear broadcast' })
  }
})

// GET /api/broadcasts - Listar mis broadcasts
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req)
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20

    // Verificar que es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden ver broadcasts' })
      return
    }

    const [broadcasts, total] = await Promise.all([
      prisma.broadcast.findMany({
        where: { creatorId: creator.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.broadcast.count({ where: { creatorId: creator.id } })
    ])

    res.json({
      broadcasts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    logger.error('Error al obtener broadcasts:', error)
    res.status(500).json({ error: 'Error al obtener broadcasts' })
  }
})

// GET /api/broadcasts/:id - Detalle de broadcast
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req)
    const { id } = req.params

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden ver broadcasts' })
      return
    }

    const broadcast = await prisma.broadcast.findFirst({
      where: { id, creatorId: creator.id },
      include: {
        recipients: {
          take: 100,
          orderBy: { sentAt: 'desc' }
        },
        _count: {
          select: { recipients: true }
        }
      }
    })

    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast no encontrado' })
      return
    }

    res.json(broadcast)
  } catch (error) {
    logger.error('Error al obtener broadcast:', error)
    res.status(500).json({ error: 'Error al obtener broadcast' })
  }
})

// DELETE /api/broadcasts/:id - Cancelar broadcast programado
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req)
    const { id } = req.params

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden cancelar broadcasts' })
      return
    }

    const broadcast = await prisma.broadcast.findFirst({
      where: { id, creatorId: creator.id }
    })

    if (!broadcast) {
      res.status(404).json({ error: 'Broadcast no encontrado' })
      return
    }

    // Solo se pueden cancelar broadcasts programados o pendientes
    if (!['SCHEDULED', 'PENDING'].includes(broadcast.status)) {
      res.status(400).json({ error: 'Este broadcast ya fue enviado o está en proceso' })
      return
    }

    await prisma.broadcast.update({
      where: { id },
      data: { status: 'CANCELLED' }
    })

    res.json({
      success: true,
      message: 'Broadcast cancelado'
    })
  } catch (error) {
    logger.error('Error al cancelar broadcast:', error)
    res.status(500).json({ error: 'Error al cancelar broadcast' })
  }
})

// GET /api/broadcasts/stats - Estadísticas de broadcasts
router.get('/stats/summary', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req)

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden ver estadísticas' })
      return
    }

    const [totalBroadcasts, totalSent, scheduled, recentBroadcasts] = await Promise.all([
      prisma.broadcast.count({ where: { creatorId: creator.id } }),
      prisma.broadcast.aggregate({
        where: { creatorId: creator.id, status: 'COMPLETED' },
        _sum: { sentCount: true }
      }),
      prisma.broadcast.count({ 
        where: { creatorId: creator.id, status: 'SCHEDULED' } 
      }),
      prisma.broadcast.findMany({
        where: { creatorId: creator.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          content: true,
          status: true,
          sentCount: true,
          totalRecipients: true,
          createdAt: true
        }
      })
    ])

    res.json({
      totalBroadcasts,
      totalMessagesSent: totalSent._sum.sentCount || 0,
      scheduledBroadcasts: scheduled,
      recentBroadcasts
    })
  } catch (error) {
    logger.error('Error al obtener estadísticas:', error)
    res.status(500).json({ error: 'Error al obtener estadísticas' })
  }
})

// GET /api/broadcasts/subscribers/count - Obtener conteo de suscriptores por tipo
router.get('/subscribers/count', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req)
    const targetType = req.query.targetType as string
    const tierIds = req.query.tierIds as string

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden ver esto' })
      return
    }

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    let whereClause: any = {
      creatorId: creator.id,
      status: 'active',
      OR: [
        { endDate: null },
        { endDate: { gte: now } }
      ]
    }

    if (targetType === 'SPECIFIC_TIERS' && tierIds) {
      const ids = tierIds.split(',')
      whereClause.tierId = { in: ids }
    } else if (targetType === 'NEW_SUBSCRIBERS') {
      whereClause.startDate = { gte: sevenDaysAgo }
    } else if (targetType === 'EXPIRING_SOON') {
      whereClause.endDate = { lte: sevenDaysFromNow, gte: now }
      whereClause.autoRenew = false
    }

    const count = await prisma.subscription.count({ where: whereClause })

    res.json({ count })
  } catch (error) {
    logger.error('Error al contar suscriptores:', error)
    res.status(500).json({ error: 'Error al contar suscriptores' })
  }
})

// ==================== HELPER FUNCTIONS ====================

async function processBroadcast(broadcastId: string, creatorId: string, creatorUserId: string) {
  try {
    // Marcar como en proceso
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'PROCESSING', sentAt: new Date() }
    })

    // Obtener broadcast con detalles
    const broadcast = await prisma.broadcast.findUnique({
      where: { id: broadcastId }
    })

    if (!broadcast) {
      logger.error(`Broadcast ${broadcastId} not found`)
      return
    }

    // Construir query para obtener suscriptores objetivo
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    let whereClause: any = {
      creatorId,
      status: 'active',
      OR: [
        { endDate: null },
        { endDate: { gte: now } }
      ]
    }

    switch (broadcast.targetType) {
      case 'SPECIFIC_TIERS':
        if (broadcast.targetTierIds.length > 0) {
          whereClause.tierId = { in: broadcast.targetTierIds }
        }
        break
      case 'NEW_SUBSCRIBERS':
        whereClause.startDate = { gte: sevenDaysAgo }
        break
      case 'EXPIRING_SOON':
        whereClause.endDate = { lte: sevenDaysFromNow, gte: now }
        whereClause.autoRenew = false
        break
      // ALL_SUBSCRIBERS: no additional filters
    }

    // Obtener suscriptores
    const subscriptions = await prisma.subscription.findMany({
      where: whereClause,
      include: {
        user: {
          select: { id: true, username: true, displayName: true }
        }
      }
    })

    const totalRecipients = subscriptions.length

    // Actualizar total de destinatarios
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { totalRecipients }
    })

    if (totalRecipients === 0) {
      await prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: 'COMPLETED', completedAt: new Date() }
      })
      return
    }

    let sentCount = 0
    let failedCount = 0

    // OPTIMIZATION: Pre-load all existing conversations to avoid N+1 queries
    const recipientIds = subscriptions.map(s => s.userId)
    const existingConversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { participant1Id: creatorUserId, participant2Id: { in: recipientIds } },
          { participant1Id: { in: recipientIds }, participant2Id: creatorUserId }
        ]
      }
    })

    // Create a map for quick lookup
    const conversationMap = new Map<string, typeof existingConversations[0]>()
    for (const conv of existingConversations) {
      const otherParticipant = conv.participant1Id === creatorUserId 
        ? conv.participant2Id 
        : conv.participant1Id
      conversationMap.set(otherParticipant, conv)
    }

    // Enviar mensaje a cada suscriptor
    for (const subscription of subscriptions) {
      try {
        const recipientId = subscription.userId

        // Use pre-loaded conversation or create new one
        let conversation = conversationMap.get(recipientId)

        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: {
              participant1Id: creatorUserId,
              participant2Id: recipientId
            }
          })
          // Add to map for potential future use
          conversationMap.set(recipientId, conversation)
        }

        // Crear mensaje
        const message = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: creatorUserId,
            content: broadcast.content,
            type: broadcast.mediaUrl ? (broadcast.mediaType === 'video' ? 'VIDEO' : 'IMAGE') : 'TEXT'
          }
        })

        // Actualizar conversación
        const isParticipant1 = conversation.participant1Id === creatorUserId
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: new Date(),
            [isParticipant1 ? 'participant2Unread' : 'participant1Unread']: { increment: 1 }
          }
        })

        // Registrar recipiente exitoso
        await prisma.broadcastRecipient.create({
          data: {
            broadcastId,
            userId: recipientId,
            conversationId: conversation.id,
            messageId: message.id,
            status: 'SENT',
            sentAt: new Date()
          }
        })

        // Notificar via WebSocket
        try {
          io.to(`user:${recipientId}`).emit('message:new', {
            conversationId: conversation.id,
            message: {
              id: message.id,
              content: message.content,
              type: message.type,
              senderId: creatorUserId,
              createdAt: message.createdAt
            }
          })
        } catch {}

        sentCount++
      } catch (error) {
        logger.error(`Error sending to subscriber ${subscription.userId}:`, error)
        
        await prisma.broadcastRecipient.create({
          data: {
            broadcastId,
            userId: subscription.userId,
            status: 'FAILED',
            error: (error as Error).message
          }
        })
        
        failedCount++
      }

      // Actualizar progreso cada 10 mensajes
      if ((sentCount + failedCount) % 10 === 0) {
        await prisma.broadcast.update({
          where: { id: broadcastId },
          data: { sentCount, failedCount }
        })
      }
    }

    // Marcar como completado
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: 'COMPLETED',
        sentCount,
        failedCount,
        completedAt: new Date()
      }
    })

    logger.info(`Broadcast ${broadcastId} completed: ${sentCount} sent, ${failedCount} failed`)
  } catch (error) {
    logger.error(`Error processing broadcast ${broadcastId}:`, error)
    
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'FAILED' }
    })
  }
}

export default router

