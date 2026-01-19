import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import prisma from './prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
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
 * Refresh the access token using a valid refresh token
 */
export async function refreshAccessToken(
  refreshTokenString: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ accessToken: string; accessTokenExpiresIn: number } | null> {
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
    // Token was revoked - potential security issue
    console.warn(`[Security] Attempted use of revoked refresh token for user ${refreshToken.userId}`)
    return null
  }

  // Check expiration
  if (refreshToken.expiresAt < new Date()) {
    // Clean up expired token
    await prisma.refreshToken.delete({ where: { id: refreshToken.id } })
    return null
  }

  // Generate new access token
  const accessToken = generateAccessToken(
    refreshToken.userId,
    refreshToken.user.isCreator
  )

  return {
    accessToken,
    accessTokenExpiresIn: 15 * 60 // 15 minutes in seconds
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
