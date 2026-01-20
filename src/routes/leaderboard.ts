import express, { Request, Response } from 'express'
import { createLogger } from '../lib/logger'
import prisma from '../lib/prisma'
import authenticate, { optionalAuthenticate, getUserId, getUser } from '../middleware/auth'

const router = express.Router()
const logger = createLogger('Leaderboard')

// GET /api/leaderboard/tippers - Top tippers globally (last 30 days)
router.get('/tippers', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)
    const days = parseInt(req.query.days as string) || 30
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const topTippers = await prisma.donation.groupBy({
      by: ['fromUserId'],
      where: {
        createdAt: { gte: startDate },
        isAnonymous: false,
        status: 'completed',
      },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    })

    // Get user details
    const userIds = topTippers.map(t => t.fromUserId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
      },
    })

    const userMap = new Map(users.map(u => [u.id, u]))

    const leaderboard = topTippers.map((tipper, index) => {
      const user = userMap.get(tipper.fromUserId)
      return {
        rank: index + 1,
        userId: tipper.fromUserId,
        username: user?.username || 'Deleted User',
        displayName: user?.displayName || 'Deleted User',
        avatar: user?.avatar,
        totalAmount: tipper._sum.amount || 0,
        donationCount: tipper._count.id,
      }
    })

    res.json({
      period: `${days}_days`,
      leaderboard,
      updatedAt: new Date(),
    })
  } catch (error) {
    logger.error('Error fetching top tippers:', error)
    res.status(500).json({ error: 'Error fetching leaderboard' })
  }
})

// GET /api/leaderboard/tippers/:creatorId - Top tippers for a specific creator
router.get('/tippers/:creatorId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { creatorId } = req.params
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)
    const days = parseInt(req.query.days as string) || 30
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Verify creator exists
    const creator = await prisma.creator.findUnique({
      where: { id: creatorId },
      include: { user: { select: { username: true, displayName: true } } },
    })

    if (!creator) {
      res.status(404).json({ error: 'Creator not found' })
      return
    }

    const topTippers = await prisma.donation.groupBy({
      by: ['fromUserId'],
      where: {
        toCreatorId: creatorId,
        createdAt: { gte: startDate },
        isAnonymous: false,
        status: 'completed',
      },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: limit,
    })

    // Get user details
    const userIds = topTippers.map(t => t.fromUserId)
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
      },
    })

    const userMap = new Map(users.map(u => [u.id, u]))

    const leaderboard = topTippers.map((tipper, index) => {
      const user = userMap.get(tipper.fromUserId)
      return {
        rank: index + 1,
        userId: tipper.fromUserId,
        username: user?.username || 'Deleted User',
        displayName: user?.displayName || 'Deleted User',
        avatar: user?.avatar,
        totalAmount: tipper._sum.amount || 0,
        donationCount: tipper._count.id,
      }
    })

    res.json({
      creator: {
        id: creatorId,
        username: creator.user.username,
        displayName: creator.user.displayName,
      },
      period: `${days}_days`,
      leaderboard,
      updatedAt: new Date(),
    })
  } catch (error) {
    logger.error('Error fetching creator top tippers:', error)
    res.status(500).json({ error: 'Error fetching leaderboard' })
  }
})

// GET /api/leaderboard/points - Top users by total points earned
router.get('/points', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)

    const topPoints = await prisma.userPoints.findMany({
      orderBy: { totalEarned: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    })

    const leaderboard = topPoints.map((up, index) => ({
      rank: index + 1,
      userId: up.userId,
      username: up.user.username,
      displayName: up.user.displayName,
      avatar: up.user.avatar,
      totalEarned: up.totalEarned,
      currentPoints: up.points,
      loginStreak: up.loginStreak,
    }))

    res.json({
      leaderboard,
      updatedAt: new Date(),
    })
  } catch (error) {
    logger.error('Error fetching points leaderboard:', error)
    res.status(500).json({ error: 'Error fetching leaderboard' })
  }
})

// GET /api/leaderboard/streaks - Top users by login streak
router.get('/streaks', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50)

    const topStreaks = await prisma.userPoints.findMany({
      where: { loginStreak: { gt: 0 } },
      orderBy: { loginStreak: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    })

    const leaderboard = topStreaks.map((up, index) => ({
      rank: index + 1,
      userId: up.userId,
      username: up.user.username,
      displayName: up.user.displayName,
      avatar: up.user.avatar,
      loginStreak: up.loginStreak,
      lastLoginDate: up.lastLoginDate,
    }))

    res.json({
      leaderboard,
      updatedAt: new Date(),
    })
  } catch (error) {
    logger.error('Error fetching streaks leaderboard:', error)
    res.status(500).json({ error: 'Error fetching leaderboard' })
  }
})

// GET /api/leaderboard/my-rank - Get current user's ranks
router.get('/my-rank', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUser(req).userId
    const days = parseInt(req.query.days as string) || 30
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get user's tipping total
    const userTipping = await prisma.donation.aggregate({
      where: {
        fromUserId: userId,
        createdAt: { gte: startDate },
        status: 'completed',
      },
      _sum: { amount: true },
      _count: { id: true },
    })

    // Get user's points
    const userPoints = await prisma.userPoints.findUnique({
      where: { userId },
    })

    // Count users with more tips
    const tipRank = await prisma.donation.groupBy({
      by: ['fromUserId'],
      where: {
        createdAt: { gte: startDate },
        status: 'completed',
      },
      _sum: { amount: true },
      having: {
        amount: { _sum: { gt: userTipping._sum.amount || 0 } },
      },
    })

    // Count users with more points
    const pointsRank = userPoints
      ? await prisma.userPoints.count({
          where: { totalEarned: { gt: userPoints.totalEarned } },
        })
      : null

    // Count users with longer streaks
    const streakRank = userPoints
      ? await prisma.userPoints.count({
          where: { loginStreak: { gt: userPoints.loginStreak } },
        })
      : null

    res.json({
      tipping: {
        rank: tipRank.length + 1,
        totalAmount: userTipping._sum.amount || 0,
        donationCount: userTipping._count.id,
      },
      points: userPoints ? {
        rank: (pointsRank || 0) + 1,
        totalEarned: userPoints.totalEarned,
        currentPoints: userPoints.points,
      } : null,
      streak: userPoints ? {
        rank: (streakRank || 0) + 1,
        currentStreak: userPoints.loginStreak,
      } : null,
    })
  } catch (error) {
    logger.error('Error fetching user rank:', error)
    res.status(500).json({ error: 'Error fetching rank' })
  }
})

export default router

