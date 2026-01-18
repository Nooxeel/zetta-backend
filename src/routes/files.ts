/**
 * Protected File Serving Route
 * 
 * Serves files from uploads directory with access control:
 * - Public files: avatars, covers, profile images - no auth required
 * - Private files: post content - requires subscription or ownership
 */

import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import jwt from 'jsonwebtoken'
import path from 'path'
import fs from 'fs'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required')
}

const UPLOADS_DIR = path.join(__dirname, '../../uploads')

// Paths that are always public (no auth required)
const PUBLIC_PATHS = [
  'avatars',
  'covers', 
  'profiles',
  'profile-images',
  'banners'
]

// Extract user from token (optional - returns null if no token)
function getUserFromToken(authHeader: string | undefined): { userId: string } | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  
  try {
    const token = authHeader.split(' ')[1]
    return jwt.verify(token, JWT_SECRET!) as { userId: string }
  } catch {
    return null
  }
}

// Check if user has access to creator's content
async function hasAccessToCreator(userId: string | null, creatorId: string): Promise<boolean> {
  // Creator always has access to their own content
  if (userId === creatorId) {
    return true
  }

  // Check if user is subscribed to creator
  if (userId) {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: userId,
        creatorId: creatorId,
        status: 'active',
        endDate: { gt: new Date() }
      }
    })
    
    if (subscription) {
      return true
    }
  }

  return false
}

/**
 * GET /files/:creatorId/*
 * Serve files with access control
 */
router.get('/:creatorId/*', async (req: Request, res: Response) => {
  try {
    const { creatorId } = req.params
    const filePath = req.params[0] // Everything after creatorId
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' })
    }

    // Prevent directory traversal attacks
    const normalizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '')
    const fullPath = path.join(UPLOADS_DIR, creatorId, normalizedPath)
    
    // Ensure the path is within uploads directory
    if (!fullPath.startsWith(UPLOADS_DIR)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    // Determine if path is public
    const pathParts = normalizedPath.split('/')
    const isPublicPath = PUBLIC_PATHS.some(p => 
      pathParts[0]?.toLowerCase().includes(p.toLowerCase())
    )

    // Public paths - serve without auth
    if (isPublicPath) {
      return res.sendFile(fullPath)
    }

    // Private paths - check authentication
    const user = getUserFromToken(req.headers.authorization)
    
    // Check if user has access
    const hasAccess = await hasAccessToCreator(user?.userId || null, creatorId)
    
    if (!hasAccess) {
      // Return 403 or a placeholder image
      return res.status(403).json({ 
        error: 'Subscription required',
        message: 'Debes estar suscrito para ver este contenido'
      })
    }

    // User has access - serve the file
    res.sendFile(fullPath)
    
  } catch (error) {
    console.error('[Files] Error serving file:', error)
    res.status(500).json({ error: 'Error serving file' })
  }
})

export default router
