import { Router, Request, Response } from 'express'
import { authenticate, getUser } from '../middleware/auth'
import { queryAuditLogs, getUserAuditSummary } from '../services/audit.service'
import { AuditAction, AuditCategory, AuditStatus, AuditLog } from '@prisma/client'
import prisma from '../lib/prisma'

const router = Router()

// All routes require authentication
router.use(authenticate)

/**
 * Check if user is admin (for now, check by email domain or specific users)
 * TODO: Add proper admin role to User model
 */
async function isAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  })
  // Temporary: admin check by email
  const adminEmails = ['admin@apapacho.com', 'admin@apapacho.cl']
  return user ? adminEmails.includes(user.email) : false
}

/**
 * GET /audit/logs
 * Query audit logs with filters (admin only)
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).userId
    
    if (!await isAdmin(userId)) {
      return res.status(403).json({ error: 'Admin access required' })
    }
    
    const {
      userId: filterUserId,
      action,
      category,
      targetType,
      targetId,
      status,
      startDate,
      endDate,
      limit = '50',
      offset = '0'
    } = req.query
    
    const result = await queryAuditLogs({
      userId: filterUserId as string,
      action: action as AuditAction,
      category: category as AuditCategory,
      targetType: targetType as string,
      targetId: targetId as string,
      status: status as AuditStatus,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    })
    
    res.json(result)
  } catch (error) {
    console.error('Error querying audit logs:', error)
    res.status(500).json({ error: 'Failed to query audit logs' })
  }
})

/**
 * GET /audit/users/:userId
 * Get audit summary for a specific user (admin only)
 */
router.get('/users/:userId', async (req: Request, res: Response) => {
  try {
    const adminId = getUser(req).userId
    
    if (!await isAdmin(adminId)) {
      return res.status(403).json({ error: 'Admin access required' })
    }
    
    const { userId } = req.params
    const summary = await getUserAuditSummary(userId)
    
    res.json(summary)
  } catch (error) {
    console.error('Error getting user audit summary:', error)
    res.status(500).json({ error: 'Failed to get audit summary' })
  }
})

/**
 * GET /audit/my-activity
 * Get current user's own audit log (for transparency)
 */
router.get('/my-activity', async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).userId
    
    const { limit = '20', offset = '0' } = req.query
    
    const result = await queryAuditLogs({
      userId,
      limit: Math.min(parseInt(limit as string), 100), // Max 100
      offset: parseInt(offset as string)
    })
    
    // Remove sensitive fields for non-admin users
    const sanitizedLogs = result.logs.map((log: AuditLog) => ({
      id: log.id,
      action: log.action,
      category: log.category,
      description: log.description,
      targetType: log.targetType,
      status: log.status,
      createdAt: log.createdAt
      // Exclude: ipAddress, userAgent, metadata
    }))
    
    res.json({ logs: sanitizedLogs, total: result.total })
  } catch (error) {
    console.error('Error getting user activity:', error)
    res.status(500).json({ error: 'Failed to get activity' })
  }
})

/**
 * GET /audit/stats
 * Get platform-wide audit statistics (admin only)
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).userId
    
    if (!await isAdmin(userId)) {
      return res.status(403).json({ error: 'Admin access required' })
    }
    
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    
    const [
      totalLogs,
      last24hLogs,
      last7dLogs,
      byCategory,
      byStatus,
      failedLogins24h,
      securityEvents24h
    ] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: last24h } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: last7d } } }),
      prisma.auditLog.groupBy({
        by: ['category'],
        _count: true
      }),
      prisma.auditLog.groupBy({
        by: ['status'],
        _count: true
      }),
      prisma.auditLog.count({
        where: {
          action: 'USER_LOGIN_FAILED',
          createdAt: { gte: last24h }
        }
      }),
      prisma.auditLog.count({
        where: {
          category: 'SECURITY',
          createdAt: { gte: last24h }
        }
      })
    ])
    
    res.json({
      total: totalLogs,
      last24h: last24hLogs,
      last7d: last7dLogs,
      byCategory: Object.fromEntries(byCategory.map((c: { category: string; _count: number }) => [c.category, c._count])),
      byStatus: Object.fromEntries(byStatus.map((s: { status: string; _count: number }) => [s.status, s._count])),
      alerts: {
        failedLogins24h,
        securityEvents24h
      }
    })
  } catch (error) {
    console.error('Error getting audit stats:', error)
    res.status(500).json({ error: 'Failed to get audit stats' })
  }
})

export default router
