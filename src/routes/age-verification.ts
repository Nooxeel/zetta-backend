import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

// Minimum age for platform access
const MINIMUM_AGE = 18

// Helper to calculate age from birthdate
function calculateAge(birthdate: Date): number {
  const today = new Date()
  const birth = new Date(birthdate)
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  
  return age
}

// GET /api/age-verification/status - Get current verification status
router.get('/status', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        ageVerified: true,
        ageVerifiedAt: true,
        birthdate: true
      }
    })

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' })
      return
    }

    res.json({
      verified: user.ageVerified,
      verifiedAt: user.ageVerifiedAt,
      hasBirthdate: !!user.birthdate
    })
  } catch (error) {
    console.error('Error getting age verification status:', error)
    res.status(500).json({ error: 'Error al obtener estado de verificación' })
  }
})

// POST /api/age-verification/verify - Verify age with birthdate
router.post('/verify', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const { birthdate } = req.body

    if (!birthdate) {
      res.status(400).json({ error: 'Fecha de nacimiento requerida' })
      return
    }

    // Parse and validate birthdate
    const parsedDate = new Date(birthdate)
    
    if (isNaN(parsedDate.getTime())) {
      res.status(400).json({ error: 'Fecha de nacimiento inválida' })
      return
    }

    // Check if date is in the future
    if (parsedDate > new Date()) {
      res.status(400).json({ error: 'La fecha de nacimiento no puede ser futura' })
      return
    }

    // Check if date is too old (e.g., 150 years ago)
    const maxAge = new Date()
    maxAge.setFullYear(maxAge.getFullYear() - 150)
    if (parsedDate < maxAge) {
      res.status(400).json({ error: 'Fecha de nacimiento inválida' })
      return
    }

    // Calculate age
    const age = calculateAge(parsedDate)

    if (age < MINIMUM_AGE) {
      res.status(403).json({ 
        error: `Debes tener al menos ${MINIMUM_AGE} años para usar esta plataforma`,
        minimumAge: MINIMUM_AGE,
        verified: false
      })
      return
    }

    // Get IP for audit trail
    const ip = req.headers['x-forwarded-for'] as string || 
               req.headers['x-real-ip'] as string || 
               req.socket?.remoteAddress || 
               'unknown'

    // Update user with verification
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        birthdate: parsedDate,
        ageVerified: true,
        ageVerifiedAt: new Date(),
        ageVerificationIp: typeof ip === 'string' ? ip.split(',')[0].trim() : ip
      },
      select: {
        ageVerified: true,
        ageVerifiedAt: true
      }
    })

    res.json({
      success: true,
      verified: updatedUser.ageVerified,
      verifiedAt: updatedUser.ageVerifiedAt,
      message: 'Edad verificada exitosamente'
    })
  } catch (error) {
    console.error('Error verifying age:', error)
    res.status(500).json({ error: 'Error al verificar edad' })
  }
})

// POST /api/age-verification/confirm - Quick confirmation (user confirms they are 18+)
// No birthdate required - just a simple confirmation
router.post('/confirm', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    // Get IP for audit trail
    const ip = req.headers['x-forwarded-for'] as string || 
               req.headers['x-real-ip'] as string || 
               req.socket?.remoteAddress || 
               'unknown'

    // Simply mark user as age verified
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ageVerified: true,
        ageVerifiedAt: new Date(),
        ageVerificationIp: typeof ip === 'string' ? ip.split(',')[0].trim() : ip
      },
      select: {
        ageVerified: true,
        ageVerifiedAt: true
      }
    })

    res.json({
      verified: updatedUser.ageVerified,
      verifiedAt: updatedUser.ageVerifiedAt,
      message: 'Edad confirmada'
    })
  } catch (error) {
    console.error('Error confirming age:', error)
    res.status(500).json({ error: 'Error al confirmar edad' })
  }
})

export default router
