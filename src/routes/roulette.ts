import express, { Request, Response } from 'express'
import { createLogger } from '../lib/logger'
import prisma from '../lib/prisma'
import { authenticate } from '../middleware/auth'

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

// Prize configuration matching frontend
const PRIZES = [
  { id: 1, label: '10 Puntos', points: 10, probability: 0.05 },
  { id: 2, label: '5 Puntos', points: 5, probability: 0.15 },
  { id: 3, label: '3 Puntos', points: 3, probability: 0.20 },
  { id: 4, label: '2 Puntos', points: 2, probability: 0.25 },
  { id: 5, label: '1 Punto', points: 1, probability: 0.30 },
  { id: 6, label: 'Intenta de nuevo', points: 0, probability: 0.03 },
  { id: 7, label: '¡Jackpot! 50 Puntos', points: 50, probability: 0.02 },
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

    // Create spin record
    await prisma.rouletteSpin.create({
      data: {
        userPointsId: userPoints.id,
        prizeId: prize.id,
        prizeLabel: prize.label,
        pointsWon: prize.points,
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

    res.json({
      prizeId: prize.id,
      prizeLabel: prize.label,
      pointsWon: prize.points,
      newPoints: updatedUserPoints.points,
      totalEarned: updatedUserPoints.totalEarned,
      totalSpent: updatedUserPoints.totalSpent,
    })
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

export default router
