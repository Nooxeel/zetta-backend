import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { nanoid } from 'nanoid'

const router = Router()

// Commission configuration
const DEFAULT_COMMISSION_RATE = 0.05 // 5%
const COMMISSION_DURATION_DAYS = 90 // 3 months

// Helper to generate unique referral code
function generateReferralCode(): string {
  return nanoid(8).toUpperCase() // e.g., "AB12CD34"
}

// GET /api/referrals - Get user's referral info and stats
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    // Get or create referral code
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, username: true }
    })

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' })
      return
    }

    // Generate code if doesn't exist
    if (!user.referralCode) {
      user = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: generateReferralCode() },
        select: { referralCode: true, username: true }
      })
    }

    // Get referral stats
    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referred: {
          select: { username: true, displayName: true, avatar: true, createdAt: true }
        },
        commissions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Calculate stats
    const stats = {
      totalReferrals: referrals.length,
      activeReferrals: referrals.filter(r => r.status === 'ACTIVE').length,
      pendingReferrals: referrals.filter(r => r.status === 'PENDING').length,
      totalEarned: referrals.reduce((sum, r) => sum + r.totalEarned, 0),
      thisMonthEarned: referrals.reduce((sum, r) => {
        const monthStart = new Date()
        monthStart.setDate(1)
        monthStart.setHours(0, 0, 0, 0)
        
        const monthCommissions = r.commissions
          .filter(c => c.createdAt >= monthStart)
          .reduce((s, c) => s + c.amount, 0)
        return sum + monthCommissions
      }, 0)
    }

    res.json({
      referralCode: user.referralCode,
      referralLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}?ref=${user.referralCode}`,
      stats,
      referrals: referrals.map(r => ({
        id: r.id,
        referredUser: r.referred,
        status: r.status,
        commissionRate: r.commissionRate,
        commissionEndDate: r.commissionEndDate,
        totalEarned: r.totalEarned,
        convertedAt: r.convertedAt,
        createdAt: r.createdAt
      }))
    })
  } catch (error) {
    console.error('Error getting referrals:', error)
    res.status(500).json({ error: 'Error al obtener referidos' })
  }
})

// POST /api/referrals/apply - Apply a referral code during signup
router.post('/apply', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { code } = req.body

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    if (!code) {
      res.status(400).json({ error: 'Código de referido requerido' })
      return
    }

    // Check if user was already referred
    const existingReferral = await prisma.referral.findUnique({
      where: { referredId: userId }
    })

    if (existingReferral) {
      res.status(400).json({ error: 'Ya tienes un código de referido aplicado' })
      return
    }

    // Find the referrer by code
    const referrer = await prisma.user.findFirst({
      where: { referralCode: code.toUpperCase() }
    })

    if (!referrer) {
      res.status(404).json({ error: 'Código de referido no válido' })
      return
    }

    // Can't refer yourself
    if (referrer.id === userId) {
      res.status(400).json({ error: 'No puedes usar tu propio código de referido' })
      return
    }

    // Calculate commission end date
    const commissionEndDate = new Date()
    commissionEndDate.setDate(commissionEndDate.getDate() + COMMISSION_DURATION_DAYS)

    // Create referral
    const referral = await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredId: userId,
        code: code.toUpperCase(),
        commissionRate: DEFAULT_COMMISSION_RATE,
        commissionEndDate,
        status: 'PENDING'
      }
    })

    res.json({
      success: true,
      message: 'Código de referido aplicado correctamente',
      referral: {
        id: referral.id,
        referrerUsername: referrer.username,
        commissionEndDate
      }
    })
  } catch (error) {
    console.error('Error applying referral:', error)
    res.status(500).json({ error: 'Error al aplicar código de referido' })
  }
})

// POST /api/referrals/regenerate - Regenerate referral code
router.post('/regenerate', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const newCode = generateReferralCode()

    const user = await prisma.user.update({
      where: { id: userId },
      data: { referralCode: newCode },
      select: { referralCode: true }
    })

    res.json({
      success: true,
      referralCode: user.referralCode,
      referralLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}?ref=${user.referralCode}`
    })
  } catch (error) {
    console.error('Error regenerating referral code:', error)
    res.status(500).json({ error: 'Error al regenerar código' })
  }
})

// GET /api/referrals/commissions - Get commission history
router.get('/commissions', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const { page = '1', limit = '20' } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const skip = (pageNum - 1) * limitNum

    // Get all referrals for this user
    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      select: { id: true }
    })

    const referralIds = referrals.map(r => r.id)

    // Get commissions
    const [commissions, total] = await Promise.all([
      prisma.referralCommission.findMany({
        where: { referralId: { in: referralIds } },
        include: {
          referral: {
            include: {
              referred: {
                select: { username: true, displayName: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.referralCommission.count({
        where: { referralId: { in: referralIds } }
      })
    ])

    res.json({
      commissions: commissions.map(c => ({
        id: c.id,
        amount: c.amount,
        sourceType: c.sourceType,
        referredUser: c.referral.referred,
        createdAt: c.createdAt
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    })
  } catch (error) {
    console.error('Error getting commissions:', error)
    res.status(500).json({ error: 'Error al obtener comisiones' })
  }
})

// GET /api/referrals/validate/:code - Validate a referral code (public)
router.get('/validate/:code', async (req, res): Promise<void> => {
  try {
    const { code } = req.params

    if (!code) {
      res.status(400).json({ valid: false, error: 'Código requerido' })
      return
    }

    const referrer = await prisma.user.findFirst({
      where: { referralCode: code.toUpperCase() },
      select: { username: true, displayName: true, avatar: true }
    })

    if (!referrer) {
      res.status(404).json({ valid: false, error: 'Código no válido' })
      return
    }

    res.json({
      valid: true,
      referrer: {
        username: referrer.username,
        displayName: referrer.displayName,
        avatar: referrer.avatar
      }
    })
  } catch (error) {
    console.error('Error validating referral code:', error)
    res.status(500).json({ valid: false, error: 'Error al validar código' })
  }
})

export default router
