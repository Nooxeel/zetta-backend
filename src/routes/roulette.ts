import express, { Request, Response } from 'express'
import { createLogger } from '../lib/logger'
import prisma from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { PrizeType } from '@prisma/client'

const router = express.Router()
const logger = createLogger('Roulette')

// Streak bonus configuration
const STREAK_BONUSES: { days: number; bonus: number; badge?: string }[] = [
  { days: 3, bonus: 5 },
  { days: 7, bonus: 15, badge: 'streak_7' },
  { days: 14, bonus: 30 },
  { days: 30, bonus: 50, badge: 'streak_30' },
  { days: 60, bonus: 100 },
  { days: 100, bonus: 200, badge: 'streak_100' },
]

// Get streak bonus for a given streak count
function getStreakBonus(streak: number): { bonus: number; badge?: string } | null {
  // Find exact match for milestone
  const milestone = STREAK_BONUSES.find(b => b.days === streak)
  return milestone || null
}

// Prize type definitions
interface Prize {
  id: number
  label: string
  points: number
  probability: number
  type: PrizeType
  targetCreator?: string // Username for subscription/discount prizes
  discountPercent?: number // For discount prizes
}

// Prize configuration matching frontend - includes real prizes!
const PRIZES: Prize[] = [
  { id: 1, label: '10 Puntos', points: 10, probability: 0.05, type: 'POINTS' },
  { id: 2, label: '5 Puntos', points: 5, probability: 0.13, type: 'POINTS' },
  { id: 3, label: '3 Puntos', points: 3, probability: 0.18, type: 'POINTS' },
  { id: 4, label: '2 Puntos', points: 2, probability: 0.23, type: 'POINTS' },
  { id: 5, label: '1 Punto', points: 1, probability: 0.28, type: 'POINTS' },
  { id: 6, label: 'Intenta de nuevo', points: 0, probability: 0.05, type: 'RETRY' },
  { id: 7, label: '¡Jackpot! 50 Puntos', points: 50, probability: 0.02, type: 'POINTS' },
  // Real prizes - subscriptions and discounts
  { id: 8, label: '🎁 Suscripción @imperfecto', points: 0, probability: 0.02, type: 'SUBSCRIPTION', targetCreator: 'imperfecto' },
  { id: 9, label: '🎟️ 50% off @gatitaveve', points: 0, probability: 0.03, type: 'DISCOUNT', targetCreator: 'gatitaveve', discountPercent: 50 },
  { id: 10, label: '🎟️ 25% off cualquier sub', points: 0, probability: 0.01, type: 'DISCOUNT', discountPercent: 25 },
]

const SPIN_COST = 10

// Weighted random selection
function selectPrize() {
  const random = Math.random()
  let cumulative = 0
  
  for (const prize of PRIZES) {
    cumulative += prize.probability
    if (random <= cumulative) {
      return prize
    }
  }
  
  // Fallback (should never reach here)
  return PRIZES[4] // 1 Punto
}

// GET /api/roulette/points - Get user points
router.get('/points', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.userId

    let userPoints = await prisma.userPoints.findUnique({
      where: { userId },
    })

    // Initialize if doesn't exist
    if (!userPoints) {
      userPoints = await prisma.userPoints.create({
        data: {
          userId,
          points: 1,
          totalEarned: 1,
          totalSpent: 0,
          lastLoginDate: new Date(),
          loginStreak: 1,
        },
      })

      // Create history entry
      await prisma.pointsHistory.create({
        data: {
          userPointsId: userPoints.id,
          amount: 1,
          reason: 'account_created',
        },
      })
    } else {
      // Check if user gets daily login bonus
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const lastLogin = new Date(userPoints.lastLoginDate)
      lastLogin.setHours(0, 0, 0, 0)

      if (today > lastLogin) {
        // Award daily login point
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        const isConsecutive = lastLogin.getTime() === yesterday.getTime()
        const newStreak = isConsecutive ? userPoints.loginStreak + 1 : 1
        
        // Calculate bonus for streak milestones
        const streakBonus = getStreakBonus(newStreak)
        const dailyPoints = 1
        const bonusPoints = streakBonus?.bonus || 0
        const totalPointsToAdd = dailyPoints + bonusPoints

        userPoints = await prisma.userPoints.update({
          where: { userId },
          data: {
            points: userPoints.points + totalPointsToAdd,
            totalEarned: userPoints.totalEarned + totalPointsToAdd,
            lastLoginDate: new Date(),
            loginStreak: newStreak,
          },
        })

        // Create history entry for daily login
        await prisma.pointsHistory.create({
          data: {
            userPointsId: userPoints.id,
            amount: dailyPoints,
            reason: `daily_login_day_${newStreak}`,
          },
        })
        
        // Create separate history entry for streak bonus if earned
        if (bonusPoints > 0) {
          await prisma.pointsHistory.create({
            data: {
              userPointsId: userPoints.id,
              amount: bonusPoints,
              reason: `streak_bonus_${newStreak}_days`,
            },
          })
        }
      }
    }

    // Calculate next milestone
    const nextMilestone = STREAK_BONUSES.find(b => b.days > userPoints.loginStreak)
    
    res.json({
      points: userPoints.points,
      totalEarned: userPoints.totalEarned,
      totalSpent: userPoints.totalSpent,
      loginStreak: userPoints.loginStreak,
      lastLoginDate: userPoints.lastLoginDate,
      streak: {
        current: userPoints.loginStreak,
        nextMilestone: nextMilestone ? {
          days: nextMilestone.days,
          bonus: nextMilestone.bonus,
          daysRemaining: nextMilestone.days - userPoints.loginStreak,
        } : null,
      },
    })
  } catch (error) {
    logger.error('Error fetching user points:', error)
    res.status(500).json({ error: 'Error fetching points' })
  }
})

// GET /api/roulette/streak - Get detailed streak info
router.get('/streak', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.userId

    const userPoints = await prisma.userPoints.findUnique({
      where: { userId },
    })

    if (!userPoints) {
      res.json({
        currentStreak: 0,
        longestStreak: 0,
        milestones: STREAK_BONUSES.map(b => ({ ...b, achieved: false })),
        nextMilestone: STREAK_BONUSES[0],
      })
      return
    }

    const currentStreak = userPoints.loginStreak
    const achievedMilestones = STREAK_BONUSES.filter(b => b.days <= currentStreak)
    const nextMilestone = STREAK_BONUSES.find(b => b.days > currentStreak)

    res.json({
      currentStreak,
      lastLoginDate: userPoints.lastLoginDate,
      milestones: STREAK_BONUSES.map(b => ({
        days: b.days,
        bonus: b.bonus,
        badge: b.badge,
        achieved: b.days <= currentStreak,
        isCurrent: b.days === currentStreak,
      })),
      nextMilestone: nextMilestone ? {
        days: nextMilestone.days,
        bonus: nextMilestone.bonus,
        daysRemaining: nextMilestone.days - currentStreak,
        progress: Math.round((currentStreak / nextMilestone.days) * 100),
      } : null,
      achievedCount: achievedMilestones.length,
      totalBonusEarned: achievedMilestones.reduce((sum, m) => sum + m.bonus, 0),
    })
  } catch (error) {
    logger.error('Error fetching streak info:', error)
    res.status(500).json({ error: 'Error fetching streak' })
  }
})

// POST /api/roulette/spin - Spin the roulette
router.post('/spin', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.userId

    // Get user points
    const userPoints = await prisma.userPoints.findUnique({
      where: { userId },
    })

    if (!userPoints) {
      res.status(404).json({ error: 'User points not found' })
      return
    }

    // Check if user has enough points
    if (userPoints.points < SPIN_COST) {
      res.status(400).json({ 
        error: 'Not enough points',
        required: SPIN_COST,
        current: userPoints.points,
      })
      return
    }

    // Select prize
    const prize = selectPrize()

    // Update points
    const pointsAfterSpin = userPoints.points - SPIN_COST
    const newPoints = pointsAfterSpin + prize.points
    const newTotalSpent = userPoints.totalSpent + SPIN_COST
    const newTotalEarned = userPoints.totalEarned + prize.points

    const updatedUserPoints = await prisma.userPoints.update({
      where: { userId },
      data: {
        points: newPoints,
        totalSpent: newTotalSpent,
        totalEarned: newTotalEarned,
      },
    })

    // Calculate expiration date for special prizes (30 days)
    const expiresAt = prize.type !== 'POINTS' && prize.type !== 'RETRY' 
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null

    // Create spin record with full prize info
    const spinRecord = await prisma.rouletteSpin.create({
      data: {
        userPointsId: userPoints.id,
        prizeId: prize.id,
        prizeLabel: prize.label,
        prizeType: prize.type,
        pointsWon: prize.points,
        targetCreatorUsername: prize.targetCreator || null,
        discountPercent: prize.discountPercent || null,
        prizeRedeemed: prize.type === 'POINTS' || prize.type === 'RETRY', // Points are auto-redeemed
        expiresAt,
      },
    })

    // Create history entries
    await prisma.pointsHistory.createMany({
      data: [
        {
          userPointsId: userPoints.id,
          amount: -SPIN_COST,
          reason: 'roulette_spin',
        },
        ...(prize.points > 0 ? [{
          userPointsId: userPoints.id,
          amount: prize.points,
          reason: `roulette_win_${prize.id}`,
        }] : []),
      ],
    })

    // Build response with prize details
    const response: any = {
      prizeId: prize.id,
      prizeLabel: prize.label,
      prizeType: prize.type,
      pointsWon: prize.points,
      newPoints: updatedUserPoints.points,
      totalEarned: updatedUserPoints.totalEarned,
      totalSpent: updatedUserPoints.totalSpent,
    }

    // Add special prize info
    if (prize.type === 'SUBSCRIPTION') {
      response.specialPrize = {
        type: 'subscription',
        creatorUsername: prize.targetCreator,
        spinId: spinRecord.id,
        expiresAt,
        message: `¡Ganaste una suscripción GRATIS a @${prize.targetCreator}!`,
      }
    } else if (prize.type === 'DISCOUNT') {
      response.specialPrize = {
        type: 'discount',
        creatorUsername: prize.targetCreator || null, // null = any creator
        discountPercent: prize.discountPercent,
        spinId: spinRecord.id,
        expiresAt,
        message: prize.targetCreator 
          ? `¡Ganaste ${prize.discountPercent}% de descuento en @${prize.targetCreator}!`
          : `¡Ganaste ${prize.discountPercent}% de descuento en cualquier suscripción!`,
      }
    }

    logger.info(`User ${userId} won prize: ${prize.label} (type: ${prize.type})`)
    res.json(response)
  } catch (error) {
    logger.error('Error spinning roulette:', error)
    res.status(500).json({ error: 'Error spinning roulette' })
  }
})

// GET /api/roulette/history - Get spin history
router.get('/history', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.userId

    const userPoints = await prisma.userPoints.findUnique({
      where: { userId },
      include: {
        rouletteSpins: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    })

    if (!userPoints) {
      res.json({ spins: [] })
      return
    }

    res.json({
      spins: userPoints.rouletteSpins,
      stats: {
        totalSpins: userPoints.rouletteSpins.length,
        totalPointsWon: userPoints.rouletteSpins.reduce((sum: number, spin: any) => sum + spin.pointsWon, 0),
      },
    })
  } catch (error) {
    logger.error('Error fetching roulette history:', error)
    res.status(500).json({ error: 'Error fetching history' })
  }
})

// GET /api/roulette/prizes - Get unredeemed special prizes
router.get('/prizes', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.userId

    const userPoints = await prisma.userPoints.findUnique({
      where: { userId },
    })

    if (!userPoints) {
      res.json({ prizes: [] })
      return
    }

    // Get unredeemed special prizes (not expired)
    const prizes = await prisma.rouletteSpin.findMany({
      where: {
        userPointsId: userPoints.id,
        prizeRedeemed: false,
        prizeType: { in: ['SUBSCRIPTION', 'DISCOUNT'] },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({
      prizes: prizes.map(p => ({
        id: p.id,
        prizeLabel: p.prizeLabel,
        prizeType: p.prizeType,
        targetCreator: p.targetCreatorUsername,
        discountPercent: p.discountPercent,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
      })),
    })
  } catch (error) {
    logger.error('Error fetching prizes:', error)
    res.status(500).json({ error: 'Error fetching prizes' })
  }
})

// POST /api/roulette/redeem/:spinId - Redeem a special prize
router.post('/redeem/:spinId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user!.userId
    const { spinId } = req.params
    const { creatorUsername } = req.body // For flexible discount coupons

    const userPoints = await prisma.userPoints.findUnique({
      where: { userId },
    })

    if (!userPoints) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    // Find the spin/prize
    const spin = await prisma.rouletteSpin.findFirst({
      where: {
        id: spinId,
        userPointsId: userPoints.id,
        prizeRedeemed: false,
      },
    })

    if (!spin) {
      res.status(404).json({ error: 'Prize not found or already redeemed' })
      return
    }

    // Check if expired
    if (spin.expiresAt && spin.expiresAt < new Date()) {
      res.status(400).json({ error: 'Prize has expired' })
      return
    }

    const targetUsername = spin.targetCreatorUsername || creatorUsername

    if (!targetUsername && spin.prizeType === 'SUBSCRIPTION') {
      res.status(400).json({ error: 'Creator username required' })
      return
    }

    if (spin.prizeType === 'SUBSCRIPTION') {
      // Find creator by user's username
      const creator = await prisma.creator.findFirst({
        where: { 
          user: { username: targetUsername },
        },
        include: {
          subscriptionTiers: {
            where: { isActive: true },
            orderBy: { price: 'asc' },
            take: 1,
          },
          user: {
            select: { username: true, displayName: true },
          },
        },
      })

      if (!creator) {
        res.status(404).json({ error: 'Creator not found' })
        return
      }

      if (creator.subscriptionTiers.length === 0) {
        res.status(400).json({ error: 'Creator has no active subscription tiers' })
        return
      }

      const tier = creator.subscriptionTiers[0]

      // Check if already subscribed
      const existingSub = await prisma.subscription.findUnique({
        where: {
          userId_creatorId: {
            userId,
            creatorId: creator.id,
          },
        },
      })

      if (existingSub && existingSub.status === 'active') {
        res.status(400).json({ error: 'You are already subscribed to this creator' })
        return
      }

      // Create subscription
      const endDate = new Date()
      endDate.setDate(endDate.getDate() + tier.durationDays)

      if (existingSub) {
        await prisma.subscription.update({
          where: { id: existingSub.id },
          data: {
            status: 'active',
            tierId: tier.id,
            startDate: new Date(),
            endDate,
            autoRenew: false, // Free sub doesn't auto-renew
          },
        })
      } else {
        await prisma.subscription.create({
          data: {
            userId,
            creatorId: creator.id,
            tierId: tier.id,
            status: 'active',
            endDate,
            autoRenew: false,
          },
        })
      }

      // Mark prize as redeemed
      await prisma.rouletteSpin.update({
        where: { id: spinId },
        data: {
          prizeRedeemed: true,
          redeemedAt: new Date(),
        },
      })

      logger.info(`User ${userId} redeemed subscription prize for @${targetUsername}`)
      res.json({
        success: true,
        message: `¡Suscripción activada a @${targetUsername}!`,
        subscription: {
          creatorUsername: targetUsername,
          tierName: tier.name,
          expiresAt: endDate,
        },
      })
    } else if (spin.prizeType === 'DISCOUNT') {
      // For discount, just mark as redeemed and return the discount info
      // The actual discount is applied at checkout time
      await prisma.rouletteSpin.update({
        where: { id: spinId },
        data: {
          prizeRedeemed: true,
          redeemedAt: new Date(),
        },
      })

      logger.info(`User ${userId} marked discount prize as claimed`)
      res.json({
        success: true,
        message: `¡Cupón de ${spin.discountPercent}% activado!`,
        discount: {
          percent: spin.discountPercent,
          creatorUsername: spin.targetCreatorUsername || 'any',
        },
      })
    } else {
      res.status(400).json({ error: 'This prize type cannot be redeemed' })
    }
  } catch (error) {
    logger.error('Error redeeming prize:', error)
    res.status(500).json({ error: 'Error redeeming prize' })
  }
})

export default router
