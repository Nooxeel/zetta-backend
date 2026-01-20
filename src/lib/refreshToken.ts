import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import prisma from './prisma'
import { createLogger } from './logger'

const logger = createLogger('RefreshToken')

// SECURITY: JWT_SECRET must be configured - no fallback allowed
if (!process.env.JWT_SECRET) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set. Application cannot start without it.')
}
const JWT_SECRET: string = process.env.JWT_SECRET

const ACCESS_TOKEN_EXPIRY = '15m'  // Short-lived access token
const REFRESH_TOKEN_EXPIRY_DAYS = 30 // Long-lived refresh token

/**
 * Refresh Token Service
 * 
 * Implements secure token refresh flow:
 * 1. Access tokens: Short-lived (15min), used for API requests
 * 2. Refresh tokens: Long-lived (30 days), stored in DB, used to get new access tokens
 */

interface TokenPair {
  accessToken: string
  refreshToken: string
  accessTokenExpiresIn: number
  refreshTokenExpiresAt: Date
}

/**
 * Generate a new access token
 */
export function generateAccessToken(userId: string, isCreator: boolean): string {
  return jwt.sign(
    { userId, isCreator },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  )
}

/**
 * Generate a secure random refresh token
 */
function generateRefreshTokenString(): string {
  return crypto.randomBytes(64).toString('hex')
}

/**
 * Create a new token pair (access + refresh)
 */
export async function createTokenPair(
  userId: string,
  isCreator: boolean,
  userAgent?: string,
  ipAddress?: string
): Promise<TokenPair> {
  const accessToken = generateAccessToken(userId, isCreator)
  const refreshTokenString = generateRefreshTokenString()
  
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS)

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      token: refreshTokenString,
      userId,
      expiresAt,
      userAgent: userAgent?.substring(0, 500), // Limit length
      ipAddress: ipAddress?.substring(0, 45), // IPv6 max length
    }
  })

  return {
    accessToken,
    refreshToken: refreshTokenString,
    accessTokenExpiresIn: 15 * 60, // 15 minutes in seconds
    refreshTokenExpiresAt: expiresAt
  }
}

/**
 * Refresh Token Rotation Result
 */
interface RefreshResult {
  accessToken: string
  accessTokenExpiresIn: number
  refreshToken: string
  refreshTokenExpiresAt: Date
}

/**
 * Refresh the access token using a valid refresh token
 * Implements refresh token rotation: revokes old token and issues new one
 */
export async function refreshAccessToken(
  refreshTokenString: string,
  userAgent?: string,
  ipAddress?: string
): Promise<RefreshResult | null> {
  // Find the refresh token
  const refreshToken = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenString },
    include: { user: true }
  })

  // Validate token exists and is not revoked
  if (!refreshToken) {
    return null
  }

  if (refreshToken.revokedAt) {
    // Token was revoked - potential token reuse attack!
    // Revoke ALL tokens for this user as a security measure
    logger.warn(`[SECURITY] Attempted reuse of revoked refresh token for user ${refreshToken.userId}. Revoking all user tokens.`)
    await revokeAllUserRefreshTokens(refreshToken.userId)
    return null
  }

  // Check expiration
  if (refreshToken.expiresAt < new Date()) {
    // Clean up expired token
    await prisma.refreshToken.delete({ where: { id: refreshToken.id } })
    return null
  }

  // REFRESH TOKEN ROTATION:
  // 1. Revoke the old token
  await prisma.refreshToken.update({
    where: { id: refreshToken.id },
    data: { revokedAt: new Date() }
  })

  // 2. Generate new token pair
  const newRefreshTokenString = generateRefreshTokenString()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS)

  // 3. Store new refresh token
  await prisma.refreshToken.create({
    data: {
      token: newRefreshTokenString,
      userId: refreshToken.userId,
      expiresAt,
      userAgent: userAgent?.substring(0, 500),
      ipAddress: ipAddress?.substring(0, 45),
    }
  })

  // 4. Generate new access token
  const accessToken = generateAccessToken(
    refreshToken.userId,
    refreshToken.user.isCreator
  )

  logger.debug(`Refresh token rotated for user ${refreshToken.userId}`)

  return {
    accessToken,
    accessTokenExpiresIn: 15 * 60, // 15 minutes in seconds
    refreshToken: newRefreshTokenString,
    refreshTokenExpiresAt: expiresAt
  }
}

/**
 * Revoke a specific refresh token (logout from one device)
 */
export async function revokeRefreshToken(refreshTokenString: string): Promise<boolean> {
  try {
    await prisma.refreshToken.update({
      where: { token: refreshTokenString },
      data: { revokedAt: new Date() }
    })
    return true
  } catch {
    return false
  }
}

/**
 * Revoke all refresh tokens for a user (logout from all devices)
 */
export async function revokeAllUserRefreshTokens(userId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { 
      userId,
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  })
  return result.count
}

/**
 * Clean up expired refresh tokens (run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } }
      ]
    }
  })
  return result.count
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string) {
  return prisma.refreshToken.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      expiresAt: true
    },
    orderBy: { createdAt: 'desc' }
  })
}
