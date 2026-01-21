import prisma from '../lib/prisma'
import { AuditAction, AuditCategory, AuditStatus, Prisma } from '@prisma/client'
import { Request } from 'express'

/**
 * Audit Service
 * Centralized logging of all user actions for compliance and debugging
 */

interface AuditLogData {
  userId?: string | null
  action: AuditAction
  category: AuditCategory
  description?: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, any>
  status?: AuditStatus
  errorMessage?: string
  req?: Request // To extract IP, user agent, etc.
}

// Map actions to their categories for convenience
const actionCategoryMap: Record<AuditAction, AuditCategory> = {
  // Auth
  USER_REGISTER: 'AUTH',
  USER_LOGIN: 'AUTH',
  USER_LOGOUT: 'AUTH',
  USER_LOGIN_FAILED: 'AUTH',
  PASSWORD_RESET_REQUEST: 'AUTH',
  PASSWORD_RESET_COMPLETE: 'AUTH',
  EMAIL_VERIFICATION_REQUEST: 'AUTH',
  EMAIL_VERIFICATION_COMPLETE: 'AUTH',
  TOKEN_REFRESH: 'AUTH',
  
  // Profile
  PROFILE_UPDATE: 'PROFILE',
  AVATAR_UPLOAD: 'PROFILE',
  COVER_UPLOAD: 'PROFILE',
  CREATOR_PROFILE_UPDATE: 'PROFILE',
  AGE_VERIFICATION: 'PROFILE',
  
  // Content
  POST_CREATE: 'CONTENT',
  POST_UPDATE: 'CONTENT',
  POST_DELETE: 'CONTENT',
  POST_LIKE: 'CONTENT',
  POST_UNLIKE: 'CONTENT',
  POST_COMMENT: 'CONTENT',
  POST_COMMENT_DELETE: 'CONTENT',
  
  // Payment
  SUBSCRIPTION_CREATE: 'PAYMENT',
  SUBSCRIPTION_CANCEL: 'PAYMENT',
  SUBSCRIPTION_RENEW: 'PAYMENT',
  DONATION_SEND: 'PAYMENT',
  TIP_SEND: 'PAYMENT',
  PPV_PURCHASE: 'PAYMENT',
  CARD_REGISTER: 'PAYMENT',
  CARD_DELETE: 'PAYMENT',
  WEBPAY_INIT: 'PAYMENT',
  WEBPAY_COMPLETE: 'PAYMENT',
  WEBPAY_FAIL: 'PAYMENT',
  
  // Social
  FAVORITE_ADD: 'SOCIAL',
  FAVORITE_REMOVE: 'SOCIAL',
  COMMENT_CREATE: 'SOCIAL',
  COMMENT_APPROVE: 'SOCIAL',
  COMMENT_REJECT: 'SOCIAL',
  COMMENT_DELETE: 'SOCIAL',
  MESSAGE_SEND: 'SOCIAL',
  BROADCAST_SEND: 'SOCIAL',
  USER_BLOCK: 'SOCIAL',
  USER_UNBLOCK: 'SOCIAL',
  
  // Gamification
  POINTS_EARN: 'GAMIFICATION',
  BADGE_UNLOCK: 'GAMIFICATION',
  MISSION_COMPLETE: 'GAMIFICATION',
  ROULETTE_SPIN: 'GAMIFICATION',
  REWARD_CLAIM: 'GAMIFICATION',
  
  // Security
  SCREENSHOT_ATTEMPT: 'SECURITY',
  SUSPICIOUS_ACTIVITY: 'SECURITY',
  RATE_LIMIT_EXCEEDED: 'SECURITY',
  
  // Admin
  ADMIN_ACTION: 'ADMIN',
  SYSTEM_ACTION: 'SYSTEM',
}

/**
 * Extract client info from request
 */
function getRequestInfo(req?: Request) {
  if (!req) return {}
  
  return {
    ipAddress: req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
  }
}

/**
 * Log an audit event
 * This is fire-and-forget - errors are logged but don't interrupt the flow
 */
export async function logAudit(data: AuditLogData): Promise<void> {
  try {
    const { req, ...auditData } = data
    const requestInfo = getRequestInfo(req)
    
    // Use the provided category or derive it from action
    const category = auditData.category || actionCategoryMap[auditData.action]
    
    await prisma.auditLog.create({
      data: {
        userId: auditData.userId,
        action: auditData.action,
        category,
        description: auditData.description,
        targetType: auditData.targetType,
        targetId: auditData.targetId,
        metadata: auditData.metadata as Prisma.InputJsonValue,
        status: auditData.status || 'SUCCESS',
        errorMessage: auditData.errorMessage,
        ipAddress: requestInfo.ipAddress,
        userAgent: requestInfo.userAgent,
      }
    })
  } catch (error) {
    // Don't throw - audit logging should never break the main flow
    console.error('[Audit] Failed to log event:', error)
  }
}

/**
 * Convenience methods for common actions
 */
export const audit = {
  // Auth events
  userRegister: (userId: string, req?: Request, metadata?: Record<string, any>) =>
    logAudit({ userId, action: 'USER_REGISTER', category: 'AUTH', targetType: 'User', targetId: userId, metadata, req }),
  
  userLogin: (userId: string, req?: Request, metadata?: Record<string, any>) =>
    logAudit({ userId, action: 'USER_LOGIN', category: 'AUTH', targetType: 'User', targetId: userId, metadata, req }),
  
  userLoginFailed: (email: string, req?: Request, reason?: string) =>
    logAudit({ action: 'USER_LOGIN_FAILED', category: 'AUTH', description: `Login failed for ${email}`, metadata: { email, reason }, req, status: 'FAILURE' }),
  
  userLogout: (userId: string, req?: Request) =>
    logAudit({ userId, action: 'USER_LOGOUT', category: 'AUTH', req }),
  
  tokenRefresh: (userId: string, req?: Request) =>
    logAudit({ userId, action: 'TOKEN_REFRESH', category: 'AUTH', req }),
  
  passwordResetRequest: (userId: string, req?: Request) =>
    logAudit({ userId, action: 'PASSWORD_RESET_REQUEST', category: 'AUTH', req }),
  
  passwordResetComplete: (userId: string, req?: Request) =>
    logAudit({ userId, action: 'PASSWORD_RESET_COMPLETE', category: 'AUTH', req }),
  
  emailVerificationRequest: (userId: string, req?: Request) =>
    logAudit({ userId, action: 'EMAIL_VERIFICATION_REQUEST', category: 'AUTH', req }),
  
  emailVerificationComplete: (userId: string, req?: Request) =>
    logAudit({ userId, action: 'EMAIL_VERIFICATION_COMPLETE', category: 'AUTH', req }),
  
  // Profile events
  profileUpdate: (userId: string, changes: Record<string, any>, req?: Request) =>
    logAudit({ userId, action: 'PROFILE_UPDATE', category: 'PROFILE', targetType: 'User', targetId: userId, metadata: { changes }, req }),
  
  avatarUpload: (userId: string, req?: Request) =>
    logAudit({ userId, action: 'AVATAR_UPLOAD', category: 'PROFILE', targetType: 'User', targetId: userId, req }),
  
  coverUpload: (userId: string, req?: Request) =>
    logAudit({ userId, action: 'COVER_UPLOAD', category: 'PROFILE', targetType: 'User', targetId: userId, req }),
  
  creatorProfileUpdate: (userId: string, creatorId: string, changes: Record<string, any>, req?: Request) =>
    logAudit({ userId, action: 'CREATOR_PROFILE_UPDATE', category: 'PROFILE', targetType: 'Creator', targetId: creatorId, metadata: { changes }, req }),
  
  ageVerification: (userId: string, verified: boolean, req?: Request) =>
    logAudit({ userId, action: 'AGE_VERIFICATION', category: 'PROFILE', targetType: 'User', targetId: userId, metadata: { verified }, req }),
  
  // Content events
  postCreate: (userId: string, postId: string, visibility: string, req?: Request) =>
    logAudit({ userId, action: 'POST_CREATE', category: 'CONTENT', targetType: 'Post', targetId: postId, metadata: { visibility }, req }),
  
  postUpdate: (userId: string, postId: string, changes: Record<string, any>, req?: Request) =>
    logAudit({ userId, action: 'POST_UPDATE', category: 'CONTENT', targetType: 'Post', targetId: postId, metadata: { changes }, req }),
  
  postDelete: (userId: string, postId: string, req?: Request) =>
    logAudit({ userId, action: 'POST_DELETE', category: 'CONTENT', targetType: 'Post', targetId: postId, req }),
  
  postLike: (userId: string, postId: string, req?: Request) =>
    logAudit({ userId, action: 'POST_LIKE', category: 'CONTENT', targetType: 'Post', targetId: postId, req }),
  
  postUnlike: (userId: string, postId: string, req?: Request) =>
    logAudit({ userId, action: 'POST_UNLIKE', category: 'CONTENT', targetType: 'Post', targetId: postId, req }),
  
  postComment: (userId: string, postId: string, commentId: string, req?: Request) =>
    logAudit({ userId, action: 'POST_COMMENT', category: 'CONTENT', targetType: 'PostComment', targetId: commentId, metadata: { postId }, req }),
  
  postCommentDelete: (userId: string, commentId: string, req?: Request) =>
    logAudit({ userId, action: 'POST_COMMENT_DELETE', category: 'CONTENT', targetType: 'PostComment', targetId: commentId, req }),
  
  // Payment events
  subscriptionCreate: (userId: string, creatorId: string, tierId: string, amount: number, req?: Request) =>
    logAudit({ userId, action: 'SUBSCRIPTION_CREATE', category: 'PAYMENT', targetType: 'Subscription', metadata: { creatorId, tierId, amount }, req }),
  
  subscriptionCancel: (userId: string, subscriptionId: string, req?: Request) =>
    logAudit({ userId, action: 'SUBSCRIPTION_CANCEL', category: 'PAYMENT', targetType: 'Subscription', targetId: subscriptionId, req }),
  
  donationSend: (userId: string, creatorId: string, amount: number, req?: Request) =>
    logAudit({ userId, action: 'DONATION_SEND', category: 'PAYMENT', targetType: 'Creator', targetId: creatorId, metadata: { amount }, req }),
  
  tipSend: (userId: string, postId: string, amount: number, req?: Request) =>
    logAudit({ userId, action: 'TIP_SEND', category: 'PAYMENT', targetType: 'Post', targetId: postId, metadata: { amount }, req }),
  
  ppvPurchase: (userId: string, postId: string, amount: number, req?: Request) =>
    logAudit({ userId, action: 'PPV_PURCHASE', category: 'PAYMENT', targetType: 'Post', targetId: postId, metadata: { amount }, req }),
  
  cardRegister: (userId: string, cardId: string, req?: Request) =>
    logAudit({ userId, action: 'CARD_REGISTER', category: 'PAYMENT', targetType: 'SavedCard', targetId: cardId, req }),
  
  cardDelete: (userId: string, cardId: string, req?: Request) =>
    logAudit({ userId, action: 'CARD_DELETE', category: 'PAYMENT', targetType: 'SavedCard', targetId: cardId, req }),
  
  webpayInit: (userId: string, transactionId: string, type: string, amount: number, req?: Request) =>
    logAudit({ userId, action: 'WEBPAY_INIT', category: 'PAYMENT', targetType: 'WebpayTransaction', targetId: transactionId, metadata: { type, amount }, req }),
  
  webpayComplete: (userId: string, transactionId: string, amount: number, req?: Request) =>
    logAudit({ userId, action: 'WEBPAY_COMPLETE', category: 'PAYMENT', targetType: 'WebpayTransaction', targetId: transactionId, metadata: { amount }, req }),
  
  webpayFail: (userId: string, transactionId: string, reason: string, req?: Request) =>
    logAudit({ userId, action: 'WEBPAY_FAIL', category: 'PAYMENT', targetType: 'WebpayTransaction', targetId: transactionId, metadata: { reason }, req, status: 'FAILURE' }),
  
  // Social events
  favoriteAdd: (userId: string, creatorId: string, req?: Request) =>
    logAudit({ userId, action: 'FAVORITE_ADD', category: 'SOCIAL', targetType: 'Creator', targetId: creatorId, req }),
  
  favoriteRemove: (userId: string, creatorId: string, req?: Request) =>
    logAudit({ userId, action: 'FAVORITE_REMOVE', category: 'SOCIAL', targetType: 'Creator', targetId: creatorId, req }),
  
  commentCreate: (userId: string, creatorId: string, commentId: string, req?: Request) =>
    logAudit({ userId, action: 'COMMENT_CREATE', category: 'SOCIAL', targetType: 'Comment', targetId: commentId, metadata: { creatorId }, req }),
  
  commentApprove: (userId: string, commentId: string, req?: Request) =>
    logAudit({ userId, action: 'COMMENT_APPROVE', category: 'SOCIAL', targetType: 'Comment', targetId: commentId, req }),
  
  commentReject: (userId: string, commentId: string, req?: Request) =>
    logAudit({ userId, action: 'COMMENT_REJECT', category: 'SOCIAL', targetType: 'Comment', targetId: commentId, req }),
  
  commentDelete: (userId: string, commentId: string, req?: Request) =>
    logAudit({ userId, action: 'COMMENT_DELETE', category: 'SOCIAL', targetType: 'Comment', targetId: commentId, req }),
  
  messageSend: (userId: string, conversationId: string, req?: Request) =>
    logAudit({ userId, action: 'MESSAGE_SEND', category: 'SOCIAL', targetType: 'Conversation', targetId: conversationId, req }),
  
  broadcastSend: (userId: string, messageCount: number, req?: Request) =>
    logAudit({ userId, action: 'BROADCAST_SEND', category: 'SOCIAL', metadata: { messageCount }, req }),
  
  userBlock: (userId: string, blockedUserId: string, req?: Request) =>
    logAudit({ userId, action: 'USER_BLOCK', category: 'SOCIAL', targetType: 'User', targetId: blockedUserId, req }),
  
  userUnblock: (userId: string, unblockedUserId: string, req?: Request) =>
    logAudit({ userId, action: 'USER_UNBLOCK', category: 'SOCIAL', targetType: 'User', targetId: unblockedUserId, req }),
  
  // Gamification events
  pointsEarn: (userId: string, points: number, reason: string, req?: Request) =>
    logAudit({ userId, action: 'POINTS_EARN', category: 'GAMIFICATION', metadata: { points, reason }, req }),
  
  badgeUnlock: (userId: string, badgeId: string, req?: Request) =>
    logAudit({ userId, action: 'BADGE_UNLOCK', category: 'GAMIFICATION', targetType: 'Badge', targetId: badgeId, req }),
  
  missionComplete: (userId: string, missionId: string, req?: Request) =>
    logAudit({ userId, action: 'MISSION_COMPLETE', category: 'GAMIFICATION', targetType: 'Mission', targetId: missionId, req }),
  
  rouletteSpin: (userId: string, prizeId: string | null, req?: Request) =>
    logAudit({ userId, action: 'ROULETTE_SPIN', category: 'GAMIFICATION', metadata: { prizeId }, req }),
  
  rewardClaim: (userId: string, rewardType: string, amount: number, req?: Request) =>
    logAudit({ userId, action: 'REWARD_CLAIM', category: 'GAMIFICATION', metadata: { rewardType, amount }, req }),
  
  // Security events
  screenshotAttempt: (userId: string, postId: string | null, method: string, req?: Request) =>
    logAudit({ userId, action: 'SCREENSHOT_ATTEMPT', category: 'SECURITY', targetType: 'Post', targetId: postId || undefined, metadata: { method }, req }),
  
  suspiciousActivity: (userId: string | null, description: string, metadata: Record<string, any>, req?: Request) =>
    logAudit({ userId, action: 'SUSPICIOUS_ACTIVITY', category: 'SECURITY', description, metadata, req }),
  
  rateLimitExceeded: (userId: string | null, endpoint: string, req?: Request) =>
    logAudit({ userId, action: 'RATE_LIMIT_EXCEEDED', category: 'SECURITY', metadata: { endpoint }, req }),
  
  // Admin events
  adminAction: (adminUserId: string, action: string, targetType: string, targetId: string, metadata?: Record<string, any>, req?: Request) =>
    logAudit({ userId: adminUserId, action: 'ADMIN_ACTION', category: 'ADMIN', description: action, targetType, targetId, metadata, req }),
  
  systemAction: (action: string, metadata?: Record<string, any>) =>
    logAudit({ action: 'SYSTEM_ACTION', category: 'SYSTEM', description: action, metadata }),
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(filters: {
  userId?: string
  action?: AuditAction
  category?: AuditCategory
  targetType?: string
  targetId?: string
  status?: AuditStatus
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}) {
  const where: Prisma.AuditLogWhereInput = {}
  
  if (filters.userId) where.userId = filters.userId
  if (filters.action) where.action = filters.action
  if (filters.category) where.category = filters.category
  if (filters.targetType) where.targetType = filters.targetType
  if (filters.targetId) where.targetId = filters.targetId
  if (filters.status) where.status = filters.status
  
  if (filters.startDate || filters.endDate) {
    where.createdAt = {}
    if (filters.startDate) where.createdAt.gte = filters.startDate
    if (filters.endDate) where.createdAt.lte = filters.endDate
  }
  
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
      include: {
        user: {
          select: { id: true, username: true, email: true }
        }
      }
    }),
    prisma.auditLog.count({ where })
  ])
  
  return { logs, total }
}

/**
 * Get audit summary for a user
 */
export async function getUserAuditSummary(userId: string) {
  const [
    totalActions,
    lastLogin,
    actionCounts,
    recentActions
  ] = await Promise.all([
    prisma.auditLog.count({ where: { userId } }),
    prisma.auditLog.findFirst({
      where: { userId, action: 'USER_LOGIN' },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.auditLog.groupBy({
      by: ['category'],
      where: { userId },
      _count: true
    }),
    prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
  ])
  
  return {
    totalActions,
    lastLogin: lastLogin?.createdAt,
    actionsByCategory: Object.fromEntries(
      actionCounts.map((c: { category: string; _count: number }) => [c.category, c._count])
    ),
    recentActions
  }
}
