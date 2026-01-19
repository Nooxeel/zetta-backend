/**
 * Cookie configuration for JWT httpOnly cookies
 * More secure than localStorage - protects against XSS attacks
 */

import { Response, CookieOptions } from 'express'

const isProduction = process.env.NODE_ENV === 'production'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// Cookie names
export const JWT_COOKIE_NAME = 'apapacho_token'
export const REFRESH_COOKIE_NAME = 'apapacho_refresh'

// Cookie configuration for access token (short-lived)
export const getAccessCookieOptions = (): CookieOptions => ({
  httpOnly: true,                    // Not accessible via JavaScript
  secure: isProduction,              // HTTPS only in production
  sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-site in prod, 'lax' for local
  maxAge: 15 * 60 * 1000,            // 15 minutes in milliseconds
  path: '/',                          // Available on all routes
})

// Cookie configuration for refresh token (long-lived)
export const getRefreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,                    // Not accessible via JavaScript
  secure: isProduction,              // HTTPS only in production
  sameSite: isProduction ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days in milliseconds
  path: '/api/auth',                  // Only sent to auth endpoints (more secure)
})

// Legacy cookie options (for backward compatibility during transition)
export const getCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,   // 7 days in milliseconds
  path: '/',
})

/**
 * Set JWT access token in httpOnly cookie
 */
export function setTokenCookie(res: Response, token: string): void {
  res.cookie(JWT_COOKIE_NAME, token, getAccessCookieOptions())
}

/**
 * Set refresh token in httpOnly cookie
 */
export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions())
}

/**
 * Clear JWT cookie (for logout)
 */
export function clearTokenCookie(res: Response): void {
  res.clearCookie(JWT_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  })
}

/**
 * Clear refresh token cookie (for logout)
 */
export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
  })
}
