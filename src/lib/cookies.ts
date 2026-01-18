/**
 * Cookie configuration for JWT httpOnly cookies
 * More secure than localStorage - protects against XSS attacks
 */

import { Response, CookieOptions } from 'express'

const isProduction = process.env.NODE_ENV === 'production'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// Cookie name for JWT
export const JWT_COOKIE_NAME = 'apapacho_token'

// Cookie configuration
export const getCookieOptions = (): CookieOptions => ({
  httpOnly: true,                    // Not accessible via JavaScript
  secure: isProduction,              // HTTPS only in production
  sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-site in prod, 'lax' for local
  maxAge: 7 * 24 * 60 * 60 * 1000,   // 7 days in milliseconds
  path: '/',                          // Available on all routes
  // Domain is automatically set by the browser
})

/**
 * Set JWT token in httpOnly cookie
 */
export function setTokenCookie(res: Response, token: string): void {
  res.cookie(JWT_COOKIE_NAME, token, getCookieOptions())
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
