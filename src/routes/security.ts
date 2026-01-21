/**
 * Security Routes
 * 
 * Handles security-related events like screenshot attempt tracking
 */

import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, optionalAuthenticate, getUserId } from '../middleware/auth'
import { createLogger } from '../lib/logger'

const router = Router()
const logger = createLogger('Security')

// Rate limiting for screenshot reports (prevent spam)
const screenshotReportLimits = new Map<string, { count: number; resetAt: number }>()
const MAX_REPORTS_PER_MINUTE = 10

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const limit = screenshotReportLimits.get(userId)
  
  if (!limit || now > limit.resetAt) {
    screenshotReportLimits.set(userId, { count: 1, resetAt: now + 60000 })
    return true
  }
  
  if (limit.count >= MAX_REPORTS_PER_MINUTE) {
    return false
  }
  
  limit.count++
  return true
}

/**
 * POST /api/security/screenshot-attempt
 * Record a screenshot attempt
 */
router.post('/screenshot-attempt', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    
    // Rate limit check
    if (!checkRateLimit(userId)) {
      return res.status(429).json({ error: 'Too many reports' })
    }
    
    const { method, postId, creatorId, pageUrl } = req.body
    
    // Validate method
    const validMethods = [
      'printscreen',
      'win_snip',
      'mac_screenshot',
      'focus_loss',
      'context_menu',
      'save_shortcut',
      'devtools',
      'unknown'
    ]
    
    if (!method || !validMethods.includes(method)) {
      return res.status(400).json({ error: 'Invalid method' })
    }
    
    // Get IP and User-Agent
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || null
    const userAgent = req.headers['user-agent'] || null
    
    // Create record
    const attempt = await prisma.screenshotAttempt.create({
      data: {
        userId,
        method,
        postId: postId || null,
        creatorId: creatorId || null,
        pageUrl: pageUrl || null,
        ipAddress,
        userAgent,
      }
    })
    
    logger.info(`Screenshot attempt recorded: user=${userId}, method=${method}, post=${postId || 'N/A'}`)
    
    // Check if user has too many attempts (potential abuse)
    const recentAttempts = await prisma.screenshotAttempt.count({
      where: {
        userId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    })
    
    // Log warning if user has many attempts
    if (recentAttempts > 20) {
      logger.warn(`User ${userId} has ${recentAttempts} screenshot attempts in last 24h`)
    }
    
    res.json({ 
      success: true,
      id: attempt.id 
    })
  } catch (error) {
    logger.error('Error recording screenshot attempt:', error)
    res.status(500).json({ error: 'Failed to record' })
  }
})

/**
 * GET /api/security/screenshot-attempts
 * Get screenshot attempts for a creator's content (creator only)
 */
router.get('/screenshot-attempts', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    
    // Check if user is a creator
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })
    
    if (!creator) {
      return res.status(403).json({ error: 'Only creators can view this' })
    }
    
    const { limit = '50', offset = '0' } = req.query
    
    // Get attempts on this creator's content
    const attempts = await prisma.screenshotAttempt.findMany({
      where: {
        creatorId: creator.id
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit as string), 100),
      skip: parseInt(offset as string)
    })
    
    const total = await prisma.screenshotAttempt.count({
      where: { creatorId: creator.id }
    })
    
    res.json({
      attempts,
      total
    })
  } catch (error) {
    logger.error('Error getting screenshot attempts:', error)
    res.status(500).json({ error: 'Failed to get attempts' })
  }
})

/**
 * GET /api/security/screenshot-stats
 * Get screenshot attempt statistics for a creator
 */
router.get('/screenshot-stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req)
    
    // Check if user is a creator
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })
    
    if (!creator) {
      return res.status(403).json({ error: 'Only creators can view this' })
    }
    
    // Get stats
    const [total, last24h, last7d, byMethod, topOffenders] = await Promise.all([
      // Total attempts
      prisma.screenshotAttempt.count({
        where: { creatorId: creator.id }
      }),
      
      // Last 24 hours
      prisma.screenshotAttempt.count({
        where: {
          creatorId: creator.id,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      }),
      
      // Last 7 days
      prisma.screenshotAttempt.count({
        where: {
          creatorId: creator.id,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      }),
      
      // By method
      prisma.screenshotAttempt.groupBy({
        by: ['method'],
        where: { creatorId: creator.id },
        _count: { method: true }
      }),
      
      // Top offenders (users with most attempts)
      prisma.screenshotAttempt.groupBy({
        by: ['userId'],
        where: { creatorId: creator.id },
        _count: { userId: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10
      })
    ])
    
    // Get user details for top offenders
    const offenderIds = topOffenders.map(o => o.userId)
    const offenderUsers = await prisma.user.findMany({
      where: { id: { in: offenderIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true
      }
    })
    
    const offendersWithDetails = topOffenders.map(o => ({
      ...o,
      user: offenderUsers.find(u => u.id === o.userId)
    }))
    
    res.json({
      total,
      last24h,
      last7d,
      byMethod: byMethod.map(m => ({ method: m.method, count: m._count.method })),
      topOffenders: offendersWithDetails.map(o => ({
        user: o.user,
        attempts: o._count.userId
      }))
    })
  } catch (error) {
    logger.error('Error getting screenshot stats:', error)
    res.status(500).json({ error: 'Failed to get stats' })
  }
})

export default router
