import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate } from '../middleware/auth'

const router = Router()

// GET /api/subscriptions/tiers/:creatorId - Obtener tiers de un creador (público)
router.get('/tiers/:creatorId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { creatorId } = req.params

    const tiers = await prisma.subscriptionTier.findMany({
      where: {
        creatorId,
        isActive: true
      },
      orderBy: { order: 'asc' }
    })

    res.json(tiers)
  } catch (error) {
    console.error('Error al obtener tiers:', error)
    res.status(500).json({ error: 'Error al obtener planes de suscripción' })
  }
})

// GET /api/subscriptions/my-tiers - Obtener mis tiers (creador autenticado)
router.get('/my-tiers', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId

    // Verificar que es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo creadores pueden acceder a esta función' })
      return
    }

    const tiers = await prisma.subscriptionTier.findMany({
      where: { creatorId: creator.id },
      orderBy: { order: 'asc' }
    })

    res.json(tiers)
  } catch (error) {
    console.error('Error al obtener mis tiers:', error)
    res.status(500).json({ error: 'Error al obtener mis planes' })
  }
})

// POST /api/subscriptions/tiers - Crear tier (creador autenticado)
router.post('/tiers', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { name, description, price, currency, benefits, durationDays } = req.body

    // Validar campos requeridos
    if (!name || price === undefined || price === null) {
      res.status(400).json({ error: 'Nombre y precio son requeridos' })
      return
    }

    if (price < 0) {
      res.status(400).json({ error: 'El precio no puede ser negativo' })
      return
    }

    // Validar durationDays
    const validDurations = [30, 90, 365]
    const duration = durationDays || 30
    if (!validDurations.includes(duration)) {
      res.status(400).json({ error: 'Duración inválida. Debe ser 30, 90 o 365 días' })
      return
    }

    // Verificar que es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo creadores pueden crear planes' })
      return
    }

    // Contar tiers existentes para el orden
    const existingTiers = await prisma.subscriptionTier.count({
      where: { creatorId: creator.id }
    })

    const tier = await prisma.subscriptionTier.create({
      data: {
        creatorId: creator.id,
        name,
        description: description || null,
        price: parseFloat(price),
        currency: currency || 'CLP',
        durationDays: duration,
        benefits: benefits || '',
        order: existingTiers
      }
    })

    res.status(201).json(tier)
  } catch (error) {
    console.error('Error al crear tier:', error)
    res.status(500).json({ error: 'Error al crear plan de suscripción' })
  }
})

// PUT /api/subscriptions/tiers/:tierId - Actualizar tier
router.put('/tiers/:tierId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { tierId } = req.params
    const { name, description, price, currency, benefits, isActive, durationDays } = req.body

    // Verificar que es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo creadores pueden actualizar planes' })
      return
    }

    // Verificar que el tier pertenece al creador
    const existingTier = await prisma.subscriptionTier.findUnique({
      where: { id: tierId }
    })

    if (!existingTier || existingTier.creatorId !== creator.id) {
      res.status(404).json({ error: 'Plan no encontrado' })
      return
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (price !== undefined) updateData.price = parseFloat(price)
    if (currency !== undefined) updateData.currency = currency
    if (benefits !== undefined) updateData.benefits = benefits
    if (isActive !== undefined) updateData.isActive = isActive
    if (durationDays !== undefined) {
      const validDurations = [30, 90, 365]
      if (!validDurations.includes(durationDays)) {
        res.status(400).json({ error: 'Duración inválida. Debe ser 30, 90 o 365 días' })
        return
      }
      updateData.durationDays = durationDays
    }

    const tier = await prisma.subscriptionTier.update({
      where: { id: tierId },
      data: updateData
    })

    res.json(tier)
  } catch (error) {
    console.error('Error al actualizar tier:', error)
    res.status(500).json({ error: 'Error al actualizar plan' })
  }
})

// DELETE /api/subscriptions/tiers/:tierId - Eliminar tier
router.delete('/tiers/:tierId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { tierId } = req.params

    // Verificar que es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo creadores pueden eliminar planes' })
      return
    }

    // Verificar que el tier pertenece al creador
    const existingTier = await prisma.subscriptionTier.findUnique({
      where: { id: tierId }
    })

    if (!existingTier || existingTier.creatorId !== creator.id) {
      res.status(404).json({ error: 'Plan no encontrado' })
      return
    }

    // Verificar si hay suscriptores activos
    const activeSubscribers = await prisma.subscription.count({
      where: {
        tierId,
        status: 'active'
      }
    })

    if (activeSubscribers > 0) {
      res.status(400).json({ error: `No puedes eliminar un plan con ${activeSubscribers} suscriptores activos` })
      return
    }

    await prisma.subscriptionTier.delete({
      where: { id: tierId }
    })

    res.json({ message: 'Plan eliminado correctamente' })
  } catch (error) {
    console.error('Error al eliminar tier:', error)
    res.status(500).json({ error: 'Error al eliminar plan' })
  }
})

// GET /api/subscriptions/my-subscriptions - Mis suscripciones como fan
router.get('/my-subscriptions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId

    const subscriptions = await prisma.subscription.findMany({
      where: {
        userId,
        status: 'active'
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
        },
        tier: true
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(subscriptions)
  } catch (error) {
    console.error('Error al obtener suscripciones:', error)
    res.status(500).json({ error: 'Error al obtener suscripciones' })
  }
})

// GET /api/subscriptions/check/:creatorId - Verificar si estoy suscrito a un creador
router.get('/check/:creatorId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { creatorId } = req.params

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        creatorId,
        OR: [
          { status: 'active' },
          {
            status: 'cancelled',
            endDate: { gte: new Date() } // Aún no ha expirado
          }
        ]
      },
      include: {
        tier: true
      }
    })

    res.json({
      isSubscribed: !!subscription,
      subscription: subscription || null
    })
  } catch (error) {
    console.error('Error al verificar suscripción:', error)
    res.status(500).json({ error: 'Error al verificar suscripción' })
  }
})

// POST /api/subscriptions/subscribe - Suscribirse a un creador (por ahora simulado)
router.post('/subscribe', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { creatorId, tierId } = req.body

    if (!creatorId || !tierId) {
      res.status(400).json({ error: 'creatorId y tierId son requeridos' })
      return
    }

    // Verificar que el usuario no sea el mismo creador
    const creator = await prisma.creator.findUnique({
      where: { id: creatorId }
    })

    if (!creator) {
      res.status(404).json({ error: 'Creador no encontrado' })
      return
    }

    if (creator.userId === userId) {
      res.status(400).json({ error: 'No puedes suscribirte a tu propio perfil' })
      return
    }

    // Verificar que el tier existe y pertenece al creador
    const tier = await prisma.subscriptionTier.findFirst({
      where: {
        id: tierId,
        creatorId,
        isActive: true
      }
    })

    if (!tier) {
      res.status(404).json({ error: 'Plan de suscripción no encontrado o inactivo' })
      return
    }

    // Verificar que no esté ya suscrito activo
    const existingSubscription = await prisma.subscription.findUnique({
      where: {
        userId_creatorId: {
          userId,
          creatorId
        }
      }
    })

    if (existingSubscription && existingSubscription.status === 'active') {
      res.status(400).json({ error: 'Ya estás suscrito a este creador' })
      return
    }

    // TODO: INTEGRACIÓN CON PASARELA DE PAGOS
    // ==========================================
    // 1. Crear orden de pago con la pasarela (Flow, Transbank, MercadoPago, etc.)
    // 2. Redirigir al usuario a la URL de pago
    // 3. Esperar confirmación vía webhook
    // 4. Crear suscripción solo después de pago confirmado
    // 
    // Ejemplo con Flow:
    // const paymentOrder = await flowAPI.createPayment({
    //   amount: tier.price,
    //   currency: tier.currency,
    //   subject: `Suscripción ${tier.name} - ${creator.user.displayName}`,
    //   email: user.email,
    //   urlConfirmation: `${process.env.API_URL}/webhooks/flow/confirm`,
    //   urlReturn: `${process.env.FRONTEND_URL}/${creator.user.username}?subscribed=true`
    // })
    // 
    // res.json({
    //   paymentUrl: paymentOrder.url,
    //   token: paymentOrder.token
    // })
    // ==========================================

    // POR AHORA: Aprobación automática para desarrollo/testing
    // Calcular endDate basado en durationDays del tier
    const endDate = new Date(Date.now() + tier.durationDays * 24 * 60 * 60 * 1000)
    
    // Usar upsert para actualizar si existe o crear si no existe
    const subscription = await prisma.subscription.upsert({
      where: {
        userId_creatorId: {
          userId,
          creatorId
        }
      },
      update: {
        tierId,
        status: 'active',
        startDate: new Date(),
        endDate,
        autoRenew: true
      },
      create: {
        userId,
        creatorId,
        tierId,
        status: 'active',
        endDate,
        autoRenew: true
      },
      include: {
        tier: true,
        creator: {
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
        }
      }
    })

    res.status(201).json({
      success: true,
      message: 'Suscripción creada exitosamente',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        autoRenew: subscription.autoRenew,
        tier: {
          id: tier.id,
          name: tier.name,
          price: tier.price,
          currency: tier.currency
        },
        creator: {
          username: subscription.creator.user.username,
          displayName: subscription.creator.user.displayName
        }
      }
    })
  } catch (error) {
    console.error('Error al suscribirse:', error)
    res.status(500).json({ error: 'Error al procesar suscripción' })
  }
})

// POST /api/subscriptions/unsubscribe/:creatorId - Cancelar suscripción
router.post('/unsubscribe/:creatorId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { creatorId } = req.params

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        creatorId,
        status: 'active'
      }
    })

    if (!subscription) {
      res.status(404).json({ error: 'No tienes una suscripción activa con este creador' })
      return
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'cancelled',
        autoRenew: false
      }
    })

    res.json({ message: 'Suscripción cancelada. Tendrás acceso hasta el fin del período.' })
  } catch (error) {
    console.error('Error al cancelar suscripción:', error)
    res.status(500).json({ error: 'Error al cancelar suscripción' })
  }
})

// GET /api/subscriptions/subscribers - Mis suscriptores (como creador)
router.get('/subscribers', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo creadores pueden ver sus suscriptores' })
      return
    }

    const subscribers = await prisma.subscription.findMany({
      where: {
        creatorId: creator.id,
        status: 'active'
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        },
        tier: true
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(subscribers)
  } catch (error) {
    console.error('Error al obtener suscriptores:', error)
    res.status(500).json({ error: 'Error al obtener suscriptores' })
  }
})

export default router
