import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

// Discover creators by interests (public or authenticated)
router.get('/creators', async (req: Request, res: Response) => {
  try {
    const { interestIds, limit = 20, offset = 0 } = req.query

    // Parse interestIds if provided
    const interestIdsArray = interestIds
      ? (interestIds as string).split(',').filter(Boolean)
      : []

    if (interestIdsArray.length === 0) {
      // No filters, return popular creators
      const creators = await prisma.creator.findMany({
        where: {
          status: 'ACTIVE'
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              isCreator: true
            }
          },
          interests: {
            include: {
              interest: true
            }
          },
          _count: {
            select: {
              subscribers: true
            }
          }
        },
        orderBy: [
          { isVerified: 'desc' },
          { totalViews: 'desc' }
        ],
        take: Number(limit),
        skip: Number(offset)
      })

      return res.json(creators)
    }

    // Find creators with matching interests
    const creators = await prisma.creator.findMany({
      where: {
        status: 'ACTIVE',
        interests: {
          some: {
            interestId: {
              in: interestIdsArray
            }
          }
        }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            isCreator: true
          }
        },
        interests: {
          include: {
            interest: true
          }
        },
        _count: {
          select: {
            subscribers: true
          }
        }
      },
      take: Number(limit),
      skip: Number(offset)
    })

    // Calculate relevance score for each creator
    const creatorsWithScore = creators.map(creator => {
      const creatorInterestIds = creator.interests.map(ci => ci.interestId)
      const sharedInterests = interestIdsArray.filter(id => creatorInterestIds.includes(id))
      const relevanceScore = (sharedInterests.length / creatorInterestIds.length) * 100

      return {
        ...creator,
        relevanceScore,
        sharedInterestsCount: sharedInterests.length
      }
    })

    // Sort by relevance, verification, and popularity
    creatorsWithScore.sort((a, b) => {
      // Prioritize verified creators
      if (a.isVerified !== b.isVerified) return b.isVerified ? 1 : -1
      // Then by relevance
      if (a.relevanceScore !== b.relevanceScore) return b.relevanceScore - a.relevanceScore
      // Finally by popularity
      return b.totalViews - a.totalViews
    })

    res.json(creatorsWithScore)
  } catch (error) {
    console.error('Discover creators error:', error)
    res.status(500).json({ error: 'Failed to discover creators' })
  }
})

// Get personalized recommendations for authenticated user
router.get('/recommended', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId!
    const { limit = 20, offset = 0 } = req.query

    // Get user's interests
    const userInterests = await prisma.userInterest.findMany({
      where: { userId },
      select: { interestId: true }
    })

    const userInterestIds = userInterests.map(ui => ui.interestId)

    if (userInterestIds.length === 0) {
      // No interests set, return popular creators
      const creators = await prisma.creator.findMany({
        where: {
          status: 'ACTIVE',
          userId: { not: userId } // Exclude own profile if creator
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              isCreator: true
            }
          },
          interests: {
            include: {
              interest: true
            }
          },
          _count: {
            select: {
              subscribers: true
            }
          }
        },
        orderBy: [
          { isVerified: 'desc' },
          { totalViews: 'desc' }
        ],
        take: Number(limit),
        skip: Number(offset)
      })

      return res.json(creators)
    }

    // Get creators the user already follows
    const userSubscriptions = await prisma.subscription.findMany({
      where: { userId },
      select: { creatorId: true }
    })

    const subscribedCreatorIds = userSubscriptions.map(s => s.creatorId)

    // Find creators with matching interests (excluding already subscribed)
    const creators = await prisma.creator.findMany({
      where: {
        status: 'ACTIVE',
        userId: { not: userId },
        id: { notIn: subscribedCreatorIds },
        interests: {
          some: {
            interestId: {
              in: userInterestIds
            }
          }
        }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            isCreator: true
          }
        },
        interests: {
          include: {
            interest: true
          }
        },
        _count: {
          select: {
            subscribers: true
          }
        }
      },
      take: Number(limit) * 2 // Get more for better sorting
    })

    // Calculate relevance score
    const creatorsWithScore = creators.map(creator => {
      const creatorInterestIds = creator.interests.map(ci => ci.interestId)
      const sharedInterests = userInterestIds.filter(id => creatorInterestIds.includes(id))
      const relevanceScore = (sharedInterests.length / Math.max(userInterestIds.length, creatorInterestIds.length)) * 100

      return {
        ...creator,
        relevanceScore,
        sharedInterestsCount: sharedInterests.length
      }
    })

    // Sort by relevance and verification
    creatorsWithScore.sort((a, b) => {
      if (a.isVerified !== b.isVerified) return b.isVerified ? 1 : -1
      if (a.relevanceScore !== b.relevanceScore) return b.relevanceScore - a.relevanceScore
      return b.totalViews - a.totalViews
    })

    // Apply pagination after sorting
    const paginatedResults = creatorsWithScore.slice(
      Number(offset),
      Number(offset) + Number(limit)
    )

    res.json(paginatedResults)
  } catch (error) {
    console.error('Get recommended creators error:', error)
    res.status(500).json({ error: 'Failed to get recommendations' })
  }
})

// Search creators by interests AND keywords
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query, interestIds, limit = 20, offset = 0 } = req.query

    const interestIdsArray = interestIds
      ? (interestIds as string).split(',').filter(Boolean)
      : []

    const where: any = {
      status: 'ACTIVE'
    }

    // Add text search if query provided
    if (query) {
      where.OR = [
        { user: { username: { contains: query as string, mode: 'insensitive' } } },
        { user: { displayName: { contains: query as string, mode: 'insensitive' } } },
        { bio: { contains: query as string, mode: 'insensitive' } }
      ]
    }

    // Add interest filter if provided
    if (interestIdsArray.length > 0) {
      where.interests = {
        some: {
          interestId: {
            in: interestIdsArray
          }
        }
      }
    }

    const creators = await prisma.creator.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            isCreator: true
          }
        },
        interests: {
          include: {
            interest: true
          }
        },
        _count: {
          select: {
            subscribers: true
          }
        }
      },
      orderBy: [
        { isVerified: 'desc' },
        { totalViews: 'desc' }
      ],
      take: Number(limit),
      skip: Number(offset)
    })

    res.json(creators)
  } catch (error) {
    console.error('Search creators error:', error)
    res.status(500).json({ error: 'Failed to search creators' })
  }
})

export default router
