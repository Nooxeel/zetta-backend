import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

// Get all available interests (public)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search } = req.query

    const where: any = {}

    if (category) {
      where.category = category
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { slug: { contains: search as string, mode: 'insensitive' } }
      ]
    }

    const interests = await prisma.interest.findMany({
      where,
      orderBy: [
        { usageCount: 'desc' },
        { name: 'asc' }
      ]
    })

    res.json(interests)
  } catch (error) {
    console.error('Get interests error:', error)
    res.status(500).json({ error: 'Failed to fetch interests' })
  }
})

// Get interests by category (for UI filtering)
router.get('/by-category', async (req: Request, res: Response) => {
  try {
    const interests = await prisma.interest.findMany({
      orderBy: [
        { category: 'asc' },
        { usageCount: 'desc' }
      ]
    })

    // Group by category
    const grouped = interests.reduce((acc, interest) => {
      if (!acc[interest.category]) {
        acc[interest.category] = []
      }
      acc[interest.category].push(interest)
      return acc
    }, {} as Record<string, any[]>)

    res.json(grouped)
  } catch (error) {
    console.error('Get interests by category error:', error)
    res.status(500).json({ error: 'Failed to fetch interests' })
  }
})

// ==================== USER INTERESTS ====================

// Get current user's interests
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId!

    const userInterests = await prisma.userInterest.findMany({
      where: { userId },
      include: {
        interest: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    })

    res.json(userInterests.map(ui => ui.interest))
  } catch (error) {
    console.error('Get user interests error:', error)
    res.status(500).json({ error: 'Failed to fetch user interests' })
  }
})

// Add interests to current user
router.post('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId!
    const { interestIds } = req.body

    if (!Array.isArray(interestIds) || interestIds.length === 0) {
      return res.status(400).json({ error: 'interestIds must be a non-empty array' })
    }

    // Validate limits (3-10 for users)
    const currentCount = await prisma.userInterest.count({
      where: { userId }
    })

    if (currentCount + interestIds.length > 10) {
      return res.status(400).json({
        error: 'Maximum 10 interests allowed',
        current: currentCount,
        limit: 10
      })
    }

    // Create user interests and increment usage count in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create all user interests
      const userInterests = await Promise.all(
        interestIds.map(interestId =>
          tx.userInterest.create({
            data: { userId, interestId },
            include: { interest: true }
          })
        )
      )

      // Increment usage count for all interests
      await Promise.all(
        interestIds.map(interestId =>
          tx.interest.update({
            where: { id: interestId },
            data: { usageCount: { increment: 1 } }
          })
        )
      )

      return userInterests
    })

    res.json(result.map(ui => ui.interest))
  } catch (error: any) {
    console.error('Add user interests error:', error)

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'One or more interests already added' })
    }

    res.status(500).json({ error: 'Failed to add interests' })
  }
})

// Remove interest from current user
router.delete('/me/:interestId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId!
    const { interestId } = req.params

    // Validate minimum interests (3 minimum)
    const currentCount = await prisma.userInterest.count({
      where: { userId }
    })

    if (currentCount <= 3) {
      return res.status(400).json({
        error: 'Minimum 3 interests required',
        current: currentCount
      })
    }

    await prisma.$transaction([
      prisma.userInterest.deleteMany({
        where: {
          userId,
          interestId
        }
      }),
      prisma.interest.update({
        where: { id: interestId },
        data: { usageCount: { decrement: 1 } }
      })
    ])

    res.json({ success: true })
  } catch (error) {
    console.error('Remove user interest error:', error)
    res.status(500).json({ error: 'Failed to remove interest' })
  }
})

// ==================== CREATOR INTERESTS ====================

// Get creator interests by username (public)
router.get('/creator/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params

    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        creatorProfile: {
          include: {
            interests: {
              include: {
                interest: true
              },
              orderBy: {
                createdAt: 'asc'
              }
            }
          }
        }
      }
    })

    if (!user || !user.creatorProfile) {
      return res.status(404).json({ error: 'Creator not found' })
    }

    res.json(user.creatorProfile.interests.map(ci => ci.interest))
  } catch (error) {
    console.error('Get creator interests error:', error)
    res.status(500).json({ error: 'Failed to fetch creator interests' })
  }
})

// Get current creator's interests
router.get('/creator/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId!

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        creatorProfile: {
          include: {
            interests: {
              include: {
                interest: true
              },
              orderBy: {
                createdAt: 'asc'
              }
            }
          }
        }
      }
    })

    if (!user || !user.creatorProfile) {
      return res.status(404).json({ error: 'Creator profile not found' })
    }

    res.json(user.creatorProfile.interests.map(ci => ci.interest))
  } catch (error) {
    console.error('Get creator interests error:', error)
    res.status(500).json({ error: 'Failed to fetch creator interests' })
  }
})

// Add interests to creator profile
router.post('/creator/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId!
    const { interestIds } = req.body

    if (!Array.isArray(interestIds) || interestIds.length === 0) {
      return res.status(400).json({ error: 'interestIds must be a non-empty array' })
    }

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      return res.status(404).json({ error: 'Creator profile not found' })
    }

    // Validate limits (5-15 for creators)
    const currentCount = await prisma.creatorInterest.count({
      where: { creatorId: creator.id }
    })

    if (currentCount + interestIds.length > 15) {
      return res.status(400).json({
        error: 'Maximum 15 interests allowed for creators',
        current: currentCount,
        limit: 15
      })
    }

    // Create creator interests and increment usage count in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create all creator interests
      const creatorInterests = await Promise.all(
        interestIds.map(interestId =>
          tx.creatorInterest.create({
            data: { creatorId: creator.id, interestId },
            include: { interest: true }
          })
        )
      )

      // Increment usage count for all interests
      await Promise.all(
        interestIds.map(interestId =>
          tx.interest.update({
            where: { id: interestId },
            data: { usageCount: { increment: 1 } }
          })
        )
      )

      return creatorInterests
    })

    res.json(result.map(ci => ci.interest))
  } catch (error: any) {
    console.error('Add creator interests error:', error)

    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'One or more interests already added' })
    }

    res.status(500).json({ error: 'Failed to add interests' })
  }
})

// Remove interest from creator profile
router.delete('/creator/me/:interestId', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId!
    const { interestId } = req.params

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      return res.status(404).json({ error: 'Creator profile not found' })
    }

    // Validate minimum interests (5 minimum for creators)
    const currentCount = await prisma.creatorInterest.count({
      where: { creatorId: creator.id }
    })

    if (currentCount <= 5) {
      return res.status(400).json({
        error: 'Minimum 5 interests required for creators',
        current: currentCount
      })
    }

    await prisma.$transaction([
      prisma.creatorInterest.deleteMany({
        where: {
          creatorId: creator.id,
          interestId
        }
      }),
      prisma.interest.update({
        where: { id: interestId },
        data: { usageCount: { decrement: 1 } }
      })
    ])

    res.json({ success: true })
  } catch (error) {
    console.error('Remove creator interest error:', error)
    res.status(500).json({ error: 'Failed to remove interest' })
  }
})

export default router
