import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import prisma from '../lib/prisma'
import { registerSchema, loginSchema, validateData } from '../lib/validators'
import { authLimiter, registerLimiter, skipIfWhitelisted } from '../middleware/rateLimiter'
import { createLogger } from '../lib/logger'
import { applyReferralOnSignup } from '../services/referralService'
import { setTokenCookie, clearTokenCookie, setRefreshTokenCookie, clearRefreshTokenCookie } from '../lib/cookies'
import { sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail, isEmailConfigured } from '../services/emailService'
import { 
  createTokenPair, 
  refreshAccessToken, 
  revokeRefreshToken, 
  revokeAllUserRefreshTokens,
  getUserSessions
} from '../lib/refreshToken'
import { audit } from '../services/audit.service'

const router = Router()
const logger = createLogger('Auth')

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set. Application cannot start without it.')
}

// Register new user
router.post('/register', skipIfWhitelisted(registerLimiter), async (req: Request, res: Response) => {
  logger.info('[REGISTER] Received registration request', { 
    email: req.body.email, 
    username: req.body.username,
    isCreator: req.body.isCreator,
    ip: req.ip 
  })
  
  try {
    // Validar input con Zod
    const validation = validateData(registerSchema, req.body)
    if (!validation.success) {
      logger.warn('[REGISTER] Validation failed', { errors: validation.errors })
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      })
    }
    
    const { email, username, password, displayName, isCreator, referralCode } = validation.data
    logger.info('[REGISTER] Validation passed, checking for existing user')

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    })

    if (existingUser) {
      logger.warn('[REGISTER] User already exists', { email, username })
      return res.status(400).json({ error: 'Email or username already exists' })
    }

    logger.info('[REGISTER] Creating new user')
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        displayName,
        isCreator: isCreator || false
      }
    })

    // If user is a creator, create creator profile
    if (isCreator) {
      await prisma.creator.create({
        data: {
          userId: user.id
        }
      })
    }

    // Apply referral code if provided
    if (referralCode) {
      const referralResult = await applyReferralOnSignup(prisma, user.id, referralCode)
      if (referralResult.success) {
        logger.info(`Referral applied for user ${user.id} from code ${referralCode}`)
      } else {
        logger.warn(`Failed to apply referral: ${referralResult.error}`)
      }
    }

    // Send verification email if email service is configured
    if (isEmailConfigured()) {
      const verificationToken = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

      await prisma.emailVerificationToken.create({
        data: {
          token: verificationToken,
          userId: user.id,
          expiresAt
        }
      })

      // Send async - don't block registration
      sendVerificationEmail(user.email, verificationToken, user.username)
        .catch(err => logger.error('Failed to send verification email:', err))
    }

    // Get client info for token tracking (same as login)
    const userAgent = req.headers['user-agent'] || 'unknown'
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown'

    // Generate token pair (access + refresh) - consistent with login
    const tokenPair = await createTokenPair(
      user.id,
      user.isCreator,
      userAgent,
      ipAddress
    )

    // Set httpOnly cookies
    setTokenCookie(res, tokenPair.accessToken)
    setRefreshTokenCookie(res, tokenPair.refreshToken)

    logger.info('[REGISTER] Registration successful', { userId: user.id, username: user.username })

    // Audit: log registration
    audit.userRegister(user.id, req, { email: user.email, username: user.username, isCreator })

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        isCreator: user.isCreator
      },
      token: tokenPair.accessToken, // For backward compatibility
      expiresIn: tokenPair.accessTokenExpiresIn
    })
  } catch (error) {
    logger.error('[REGISTER] Registration failed with error:', error)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

// Login
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    // Validar input con Zod
    const validation = validateData(loginSchema, req.body)
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      })
    }
    
    const { email, password } = validation.data

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        creatorProfile: true
      }
    })

    if (!user) {
      // Audit: failed login - user not found
      audit.userLoginFailed(email, req, 'User not found')
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      // Audit: failed login - wrong password
      audit.userLoginFailed(email, req, 'Invalid password')
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Get client info for token tracking
    const userAgent = req.headers['user-agent'] || 'unknown'
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown'

    // Generate token pair (access + refresh)
    const tokenPair = await createTokenPair(
      user.id,
      user.isCreator,
      userAgent,
      ipAddress
    )

    // Set httpOnly cookies
    setTokenCookie(res, tokenPair.accessToken)
    setRefreshTokenCookie(res, tokenPair.refreshToken)

    // Audit: successful login
    audit.userLogin(user.id, req)

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        isCreator: user.isCreator,
        creatorProfile: user.creatorProfile
      },
      token: tokenPair.accessToken, // For backward compatibility
      expiresIn: tokenPair.accessTokenExpiresIn
    })
  } catch (error) {
    logger.error('Login error:', error)
    res.status(500).json({ error: 'Failed to login' })
  }
})

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        creatorProfile: {
          include: {
            musicTracks: true,
            socialLinks: true
          }
        }
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    
    // Log fontFamily for debugging
    console.log('[AUTH /me] creatorProfile.fontFamily:', user.creatorProfile?.fontFamily)

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      isCreator: user.isCreator,
      creatorProfile: user.creatorProfile
    })
  } catch (error) {
    logger.error('Get me error:', error)
    res.status(401).json({ error: 'Invalid token' })
  }
})

// Logout - clear cookies and revoke refresh token
router.post('/logout', async (req: Request, res: Response) => {
  try {
    // Get refresh token from cookie
    const refreshToken = req.cookies?.apapacho_refresh
    
    // Revoke the refresh token if present
    if (refreshToken) {
      await revokeRefreshToken(refreshToken)
    }
    
    // Clear both cookies
    clearTokenCookie(res)
    clearRefreshTokenCookie(res)
    
    res.json({ message: 'Logged out successfully' })
  } catch (error) {
    logger.error('Logout error:', error)
    // Still clear cookies even if revocation fails
    clearTokenCookie(res)
    clearRefreshTokenCookie(res)
    res.json({ message: 'Logged out successfully' })
  }
})

// Refresh access token (with refresh token rotation)
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.apapacho_refresh || req.body.refreshToken
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token provided' })
    }
    
    const userAgent = req.headers['user-agent'] || 'unknown'
    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || 'unknown'
    
    const result = await refreshAccessToken(refreshToken, userAgent, ipAddress)
    
    if (!result) {
      clearTokenCookie(res)
      clearRefreshTokenCookie(res)
      return res.status(401).json({ error: 'Invalid or expired refresh token' })
    }
    
    // Set new access token cookie
    setTokenCookie(res, result.accessToken)
    
    // Set new refresh token cookie (rotation)
    setRefreshTokenCookie(res, result.refreshToken)
    
    res.json({
      token: result.accessToken,
      expiresIn: result.accessTokenExpiresIn
    })
  } catch (error) {
    logger.error('Refresh token error:', error)
    res.status(500).json({ error: 'Failed to refresh token' })
  }
})

// Logout from all devices
router.post('/logout-all', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }
    
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    
    const count = await revokeAllUserRefreshTokens(decoded.userId)
    
    clearTokenCookie(res)
    clearRefreshTokenCookie(res)
    
    res.json({ message: `Logged out from ${count} devices` })
  } catch (error) {
    logger.error('Logout all error:', error)
    res.status(401).json({ error: 'Invalid token' })
  }
})

// Get active sessions
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }
    
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string }
    
    const sessions = await getUserSessions(decoded.userId)
    
    res.json(sessions)
  } catch (error) {
    logger.error('Get sessions error:', error)
    res.status(401).json({ error: 'Invalid token' })
  }
})

// ==================== PASSWORD RESET ====================

// Request password reset
router.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email es requerido' })
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    // Always return success to prevent email enumeration
    if (!user) {
      logger.info(`Password reset requested for non-existent email: ${email}`)
      return res.json({ message: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.' })
    }

    // Check if email service is configured
    if (!isEmailConfigured()) {
      logger.error('Email service not configured - cannot send password reset')
      return res.status(503).json({ error: 'Servicio de email no disponible. Contacta soporte.' })
    }

    // Delete any existing tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id }
    })

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Save token
    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt
      }
    })

    // Send email
    const result = await sendPasswordResetEmail(user.email, token, user.username)
    
    if (!result.success) {
      logger.error(`Failed to send password reset email: ${result.error}`)
      return res.status(500).json({ error: 'Error al enviar el email. Intenta nuevamente.' })
    }

    res.json({ message: 'Si el email existe, recibirás un enlace para restablecer tu contraseña.' })
  } catch (error) {
    logger.error('Forgot password error:', error)
    res.status(500).json({ error: 'Error al procesar la solicitud' })
  }
})

// Reset password with token
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      return res.status(400).json({ error: 'Token y contraseña son requeridos' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    }

    // Find valid token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true }
    })

    if (!resetToken) {
      return res.status(400).json({ error: 'Token inválido o expirado' })
    }

    if (resetToken.usedAt) {
      return res.status(400).json({ error: 'Este enlace ya fue utilizado' })
    }

    if (resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'El enlace ha expirado. Solicita uno nuevo.' })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Update password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() }
      })
    ])

    logger.info(`Password reset successful for user ${resetToken.userId}`)
    res.json({ message: 'Contraseña actualizada exitosamente. Ya puedes iniciar sesión.' })
  } catch (error) {
    logger.error('Reset password error:', error)
    res.status(500).json({ error: 'Error al restablecer la contraseña' })
  }
})

// ==================== EMAIL VERIFICATION ====================

// Resend verification email
router.post('/resend-verification', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email es requerido' })
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'Si el email existe y no está verificado, recibirás un enlace.' })
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Este email ya está verificado' })
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ error: 'Servicio de email no disponible' })
    }

    // Delete existing tokens
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id }
    })

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await prisma.emailVerificationToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt
      }
    })

    await sendVerificationEmail(user.email, token, user.username)

    res.json({ message: 'Si el email existe y no está verificado, recibirás un enlace.' })
  } catch (error) {
    logger.error('Resend verification error:', error)
    res.status(500).json({ error: 'Error al enviar el email' })
  }
})

// Verify email with token
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body

    if (!token) {
      return res.status(400).json({ error: 'Token es requerido' })
    }

    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true }
    })

    if (!verificationToken) {
      return res.status(400).json({ error: 'Token inválido' })
    }

    if (verificationToken.usedAt) {
      return res.status(400).json({ error: 'Este enlace ya fue utilizado' })
    }

    if (verificationToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'El enlace ha expirado. Solicita uno nuevo.' })
    }

    // Verify email and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: verificationToken.userId },
        data: { 
          emailVerified: true,
          emailVerifiedAt: new Date()
        }
      }),
      prisma.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: new Date() }
      })
    ])

    // Send welcome email
    if (isEmailConfigured()) {
      await sendWelcomeEmail(
        verificationToken.user.email,
        verificationToken.user.username,
        verificationToken.user.isCreator
      )
    }

    logger.info(`Email verified for user ${verificationToken.userId}`)
    res.json({ message: '¡Email verificado exitosamente!' })
  } catch (error) {
    logger.error('Verify email error:', error)
    res.status(500).json({ error: 'Error al verificar el email' })
  }
})

export default router
