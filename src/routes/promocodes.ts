import { Router, Request, Response } from 'express'
import { createLogger } from '../lib/logger'
import prisma from '../lib/prisma'
import { authenticate } from '../middleware/auth'

const router = Router()
const logger = createLogger('Promocodes')

// Función para generar código aleatorio
function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Sin I, O, 0, 1 para evitar confusión
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// ==================== CREATOR ENDPOINTS ====================

// POST /api/promocodes - Crear promocode
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const {
      code,
      type,
      value,
      currency,
      maxUses,
      maxUsesPerUser,
      minPurchase,
      applicableTiers,
      startsAt,
      expiresAt
    } = req.body

    // Verificar que es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden crear promocodes' })
      return
    }

    // Validar tipo
    const validTypes = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_TRIAL']
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: 'Tipo de promocode inválido' })
      return
    }

    // Validar valor
    if (value === undefined || value <= 0) {
      res.status(400).json({ error: 'El valor debe ser mayor a 0' })
      return
    }

    // Si es porcentaje, validar que no exceda 100%
    if (type === 'PERCENTAGE' && value > 100) {
      res.status(400).json({ error: 'El porcentaje no puede ser mayor a 100%' })
      return
    }

    // Generar código si no se proporciona
    let finalCode = code?.toUpperCase().replace(/[^A-Z0-9]/g, '') || generateCode()

    // Verificar que el código no exista para este creador
    const existingCode = await prisma.promocode.findUnique({
      where: {
        creatorId_code: {
          creatorId: creator.id,
          code: finalCode
        }
      }
    })

    if (existingCode) {
      res.status(400).json({ error: 'Este código ya existe' })
      return
    }

    // Crear promocode
    const promocode = await prisma.promocode.create({
      data: {
        creatorId: creator.id,
        code: finalCode,
        type,
        value: parseFloat(value),
        currency: currency || 'CLP',
        maxUses: maxUses ? parseInt(maxUses) : null,
        maxUsesPerUser: maxUsesPerUser ? parseInt(maxUsesPerUser) : 1,
        minPurchase: minPurchase ? parseFloat(minPurchase) : null,
        applicableTiers: applicableTiers || [],
        startsAt: startsAt ? new Date(startsAt) : new Date(),
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    })

    logger.info(`Creator ${creator.id} created promocode ${finalCode}`)

    res.status(201).json({
      success: true,
      promocode
    })
  } catch (error) {
    logger.error('Error al crear promocode:', error)
    res.status(500).json({ error: 'Error al crear promocode' })
  }
})

// GET /api/promocodes - Listar mis promocodes
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const status = req.query.status as string // active, expired, all

    // Verificar que es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden ver promocodes' })
      return
    }

    // Construir filtro
    const where: any = { creatorId: creator.id }
    
    if (status === 'active') {
      where.isActive = true
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    } else if (status === 'expired') {
      where.OR = [
        { isActive: false },
        { expiresAt: { lte: new Date() } }
      ]
    }

    const [promocodes, total] = await Promise.all([
      prisma.promocode.findMany({
        where,
        include: {
          _count: {
            select: { redemptions: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.promocode.count({ where })
    ])

    res.json({
      promocodes: promocodes.map(p => ({
        ...p,
        totalRedemptions: p._count.redemptions,
        isExpired: p.expiresAt ? new Date(p.expiresAt) < new Date() : false,
        isMaxedOut: p.maxUses ? p.currentUses >= p.maxUses : false
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    logger.error('Error al obtener promocodes:', error)
    res.status(500).json({ error: 'Error al obtener promocodes' })
  }
})

// GET /api/promocodes/:id - Obtener detalle con estadísticas
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { id } = req.params

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden ver promocodes' })
      return
    }

    const promocode = await prisma.promocode.findFirst({
      where: { id, creatorId: creator.id },
      include: {
        redemptions: {
          orderBy: { createdAt: 'desc' },
          take: 50
        },
        _count: {
          select: { redemptions: true }
        }
      }
    })

    if (!promocode) {
      res.status(404).json({ error: 'Promocode no encontrado' })
      return
    }

    // Calcular estadísticas
    const totalDiscountGiven = promocode.redemptions.reduce(
      (sum, r) => sum + r.discountAmount,
      0
    )

    res.json({
      ...promocode,
      stats: {
        totalRedemptions: promocode._count.redemptions,
        totalDiscountGiven,
        isExpired: promocode.expiresAt ? new Date(promocode.expiresAt) < new Date() : false,
        isMaxedOut: promocode.maxUses ? promocode.currentUses >= promocode.maxUses : false
      }
    })
  } catch (error) {
    logger.error('Error al obtener promocode:', error)
    res.status(500).json({ error: 'Error al obtener promocode' })
  }
})

// PUT /api/promocodes/:id - Actualizar promocode
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { id } = req.params
    const { maxUses, expiresAt, isActive, applicableTiers } = req.body

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden actualizar promocodes' })
      return
    }

    const promocode = await prisma.promocode.findFirst({
      where: { id, creatorId: creator.id }
    })

    if (!promocode) {
      res.status(404).json({ error: 'Promocode no encontrado' })
      return
    }

    // Actualizar solo campos permitidos (no se puede cambiar código, tipo ni valor)
    const updated = await prisma.promocode.update({
      where: { id },
      data: {
        maxUses: maxUses !== undefined ? (maxUses ? parseInt(maxUses) : null) : undefined,
        expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        applicableTiers: applicableTiers !== undefined ? applicableTiers : undefined
      }
    })

    res.json({
      success: true,
      promocode: updated
    })
  } catch (error) {
    logger.error('Error al actualizar promocode:', error)
    res.status(500).json({ error: 'Error al actualizar promocode' })
  }
})

// DELETE /api/promocodes/:id - Eliminar/desactivar promocode
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { id } = req.params

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo los creadores pueden eliminar promocodes' })
      return
    }

    const promocode = await prisma.promocode.findFirst({
      where: { id, creatorId: creator.id }
    })

    if (!promocode) {
      res.status(404).json({ error: 'Promocode no encontrado' })
      return
    }

    // Soft delete - desactivar en lugar de eliminar
    await prisma.promocode.update({
      where: { id },
      data: { isActive: false }
    })

    res.json({
      success: true,
      message: 'Promocode desactivado'
    })
  } catch (error) {
    logger.error('Error al eliminar promocode:', error)
    res.status(500).json({ error: 'Error al eliminar promocode' })
  }
})

// ==================== PUBLIC ENDPOINTS ====================

// POST /api/promocodes/validate - Validar código (para fans)
router.post('/validate', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { code, creatorId, tierId, amount } = req.body

    if (!code || !creatorId) {
      res.status(400).json({ error: 'Código y creatorId son requeridos' })
      return
    }

    // Buscar promocode
    const promocode = await prisma.promocode.findUnique({
      where: {
        creatorId_code: {
          creatorId,
          code: code.toUpperCase()
        }
      }
    })

    if (!promocode) {
      res.status(404).json({ 
        valid: false, 
        error: 'Código no encontrado' 
      })
      return
    }

    // Validar que esté activo
    if (!promocode.isActive) {
      res.status(400).json({ 
        valid: false, 
        error: 'Este código ya no está activo' 
      })
      return
    }

    // Validar fecha de inicio
    if (new Date(promocode.startsAt) > new Date()) {
      res.status(400).json({ 
        valid: false, 
        error: 'Este código aún no está disponible' 
      })
      return
    }

    // Validar expiración
    if (promocode.expiresAt && new Date(promocode.expiresAt) < new Date()) {
      res.status(400).json({ 
        valid: false, 
        error: 'Este código ha expirado' 
      })
      return
    }

    // Validar usos totales
    if (promocode.maxUses && promocode.currentUses >= promocode.maxUses) {
      res.status(400).json({ 
        valid: false, 
        error: 'Este código ha alcanzado el límite de usos' 
      })
      return
    }

    // Validar usos por usuario
    const userRedemptions = await prisma.promocodeRedemption.count({
      where: {
        promocodeId: promocode.id,
        userId
      }
    })

    if (userRedemptions >= promocode.maxUsesPerUser) {
      res.status(400).json({ 
        valid: false, 
        error: 'Ya has usado este código el máximo de veces permitido' 
      })
      return
    }

    // Validar tier aplicable
    if (promocode.applicableTiers.length > 0 && tierId) {
      if (!promocode.applicableTiers.includes(tierId)) {
        res.status(400).json({ 
          valid: false, 
          error: 'Este código no aplica para este plan' 
        })
        return
      }
    }

    // Validar monto mínimo
    if (promocode.minPurchase && amount && amount < promocode.minPurchase) {
      res.status(400).json({ 
        valid: false, 
        error: `Monto mínimo requerido: $${promocode.minPurchase}` 
      })
      return
    }

    // Calcular descuento
    let discountAmount = 0
    let finalAmount = amount || 0
    let description = ''

    switch (promocode.type) {
      case 'PERCENTAGE':
        discountAmount = (finalAmount * promocode.value) / 100
        finalAmount = finalAmount - discountAmount
        description = `${promocode.value}% de descuento`
        break
      case 'FIXED_AMOUNT':
        discountAmount = Math.min(promocode.value, finalAmount)
        finalAmount = finalAmount - discountAmount
        description = `$${promocode.value} de descuento`
        break
      case 'FREE_TRIAL':
        discountAmount = finalAmount
        finalAmount = 0
        description = `${promocode.value} días gratis`
        break
    }

    res.json({
      valid: true,
      promocode: {
        id: promocode.id,
        code: promocode.code,
        type: promocode.type,
        value: promocode.value,
        description
      },
      discount: {
        originalAmount: amount || 0,
        discountAmount,
        finalAmount: Math.max(0, finalAmount)
      }
    })
  } catch (error) {
    logger.error('Error al validar promocode:', error)
    res.status(500).json({ error: 'Error al validar código' })
  }
})

// POST /api/promocodes/redeem - Registrar uso de código (llamado internamente al suscribirse)
router.post('/redeem', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { promocodeId, subscriptionId, originalAmount, discountAmount, finalAmount } = req.body

    if (!promocodeId) {
      res.status(400).json({ error: 'promocodeId es requerido' })
      return
    }

    const promocode = await prisma.promocode.findUnique({
      where: { id: promocodeId }
    })

    if (!promocode) {
      res.status(404).json({ error: 'Promocode no encontrado' })
      return
    }

    // Crear redención y actualizar contador en transacción
    const [redemption] = await prisma.$transaction([
      prisma.promocodeRedemption.create({
        data: {
          promocodeId,
          userId,
          subscriptionId,
          originalAmount: originalAmount || 0,
          discountAmount: discountAmount || 0,
          finalAmount: finalAmount || 0
        }
      }),
      prisma.promocode.update({
        where: { id: promocodeId },
        data: { currentUses: { increment: 1 } }
      })
    ])

    logger.info(`User ${userId} redeemed promocode ${promocode.code}`)

    res.json({
      success: true,
      redemption
    })
  } catch (error) {
    logger.error('Error al redimir promocode:', error)
    res.status(500).json({ error: 'Error al redimir código' })
  }
})

export default router
