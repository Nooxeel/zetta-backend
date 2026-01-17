import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { ImportPlatform, ImportStatus } from '@prisma/client'

const router = Router()

// Supported platforms
const SUPPORTED_PLATFORMS = ['ONLYFANS', 'ARSMATE', 'FANSLY'] as const

// GET /api/import/platforms - Get supported platforms
router.get('/platforms', (req, res): void => {
  res.json({
    platforms: [
      {
        id: 'ONLYFANS',
        name: 'OnlyFans',
        icon: '🔞',
        description: 'Importa tu perfil, posts y configuración desde OnlyFans',
        supported: ['profile', 'posts', 'settings']
      },
      {
        id: 'ARSMATE',
        name: 'Arsmate',
        icon: '🌶️',
        description: 'Importa tu contenido desde Arsmate',
        supported: ['profile', 'posts', 'settings']
      },
      {
        id: 'FANSLY',
        name: 'Fansly',
        icon: '💎',
        description: 'Importa tu perfil y posts desde Fansly',
        supported: ['profile', 'posts']
      }
    ]
  })
})

// GET /api/import - Get import history
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    // Get creator
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo creadores pueden importar' })
      return
    }

    const imports = await prisma.platformImport.findMany({
      where: { creatorId: creator.id },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    res.json({ imports })
  } catch (error) {
    console.error('Error getting imports:', error)
    res.status(500).json({ error: 'Error al obtener importaciones' })
  }
})

// POST /api/import/start - Start a new import
router.post('/start', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { platform, data } = req.body

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    // Validate platform
    if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
      res.status(400).json({ error: 'Plataforma no soportada' })
      return
    }

    // Get creator
    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo creadores pueden importar' })
      return
    }

    // Check for existing pending/processing import
    const existingImport = await prisma.platformImport.findFirst({
      where: {
        creatorId: creator.id,
        status: { in: ['PENDING', 'PROCESSING'] }
      }
    })

    if (existingImport) {
      res.status(400).json({ 
        error: 'Ya tienes una importación en proceso',
        existingImportId: existingImport.id
      })
      return
    }

    // Create import record
    const importRecord = await prisma.platformImport.create({
      data: {
        creatorId: creator.id,
        platform: platform as ImportPlatform,
        status: 'PENDING',
        importData: data || {}
      }
    })

    // Start processing in background
    processImport(importRecord.id, creator.id, platform as ImportPlatform, data)
      .catch(err => console.error('Import processing error:', err))

    res.json({
      success: true,
      importId: importRecord.id,
      message: 'Importación iniciada. Te notificaremos cuando termine.'
    })
  } catch (error) {
    console.error('Error starting import:', error)
    res.status(500).json({ error: 'Error al iniciar importación' })
  }
})

// POST /api/import/profile - Import profile data directly
router.post('/profile', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { platform, profileData } = req.body

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    if (!platform || !profileData) {
      res.status(400).json({ error: 'Datos de perfil requeridos' })
      return
    }

    // Get creator
    const creator = await prisma.creator.findUnique({
      where: { userId },
      include: { user: true }
    })

    if (!creator) {
      res.status(403).json({ error: 'Solo creadores pueden importar' })
      return
    }

    // Map profile data from different platforms
    const mappedData = mapProfileData(platform, profileData)

    // Update creator profile
    const updateData: Record<string, string | number | boolean | null> = {}

    if (mappedData.bio && !creator.bio) {
      updateData.bio = mappedData.bio
    }
    if (mappedData.displayName && creator.user.displayName === creator.user.username) {
      // Update user displayName if it's still the default
      await prisma.user.update({
        where: { id: userId },
        data: { displayName: mappedData.displayName }
      })
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.creator.update({
        where: { id: creator.id },
        data: updateData
      })
    }

    // Create import record
    await prisma.platformImport.create({
      data: {
        creatorId: creator.id,
        platform: platform as ImportPlatform,
        status: 'COMPLETED',
        profileImported: true,
        importData: { profileData: mappedData } as object,
        startedAt: new Date(),
        completedAt: new Date()
      }
    })

    res.json({
      success: true,
      message: 'Perfil importado correctamente',
      imported: mappedData
    })
  } catch (error) {
    console.error('Error importing profile:', error)
    res.status(500).json({ error: 'Error al importar perfil' })
  }
})

// GET /api/import/:id - Get import status
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { id } = req.params

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'No autorizado' })
      return
    }

    const importRecord = await prisma.platformImport.findFirst({
      where: { id, creatorId: creator.id }
    })

    if (!importRecord) {
      res.status(404).json({ error: 'Importación no encontrada' })
      return
    }

    res.json({ import: importRecord })
  } catch (error) {
    console.error('Error getting import:', error)
    res.status(500).json({ error: 'Error al obtener importación' })
  }
})

// DELETE /api/import/:id - Cancel import
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    const { id } = req.params

    if (!userId) {
      res.status(401).json({ error: 'No autenticado' })
      return
    }

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(403).json({ error: 'No autorizado' })
      return
    }

    const importRecord = await prisma.platformImport.findFirst({
      where: { id, creatorId: creator.id }
    })

    if (!importRecord) {
      res.status(404).json({ error: 'Importación no encontrada' })
      return
    }

    if (!['PENDING', 'PROCESSING'].includes(importRecord.status)) {
      res.status(400).json({ error: 'Solo se pueden cancelar importaciones pendientes' })
      return
    }

    await prisma.platformImport.update({
      where: { id },
      data: { status: 'CANCELLED' }
    })

    res.json({ success: true, message: 'Importación cancelada' })
  } catch (error) {
    console.error('Error cancelling import:', error)
    res.status(500).json({ error: 'Error al cancelar importación' })
  }
})

// Helper functions

interface MappedProfileData {
  displayName?: string
  bio?: string
  socialLinks?: Array<{ platform: string; url: string }>
}

function mapProfileData(platform: string, data: Record<string, unknown>): MappedProfileData {
  const mapped: MappedProfileData = {}

  switch (platform) {
    case 'ONLYFANS':
      mapped.displayName = data.name as string || data.displayName as string
      mapped.bio = data.about as string || data.bio as string
      if (data.website) {
        mapped.socialLinks = [{ platform: 'website', url: data.website as string }]
      }
      break

    case 'ARSMATE':
      mapped.displayName = data.nickname as string || data.displayName as string
      mapped.bio = data.description as string || data.bio as string
      break

    case 'FANSLY':
      mapped.displayName = data.displayName as string
      mapped.bio = data.bio as string || data.about as string
      break

    default:
      mapped.displayName = data.displayName as string
      mapped.bio = data.bio as string
  }

  return mapped
}

async function processImport(
  importId: string,
  creatorId: string,
  platform: ImportPlatform,
  data: Record<string, unknown>
): Promise<void> {
  try {
    // Update status to processing
    await prisma.platformImport.update({
      where: { id: importId },
      data: { 
        status: 'PROCESSING',
        startedAt: new Date()
      }
    })

    let postsImported = 0
    let mediaImported = 0
    let errorsCount = 0
    const errors: string[] = []
    let profileImported = false

    // Import profile if provided
    if (data.profile) {
      try {
        const creator = await prisma.creator.findUnique({
          where: { id: creatorId },
          include: { user: true }
        })

        if (creator) {
          const mappedProfile = mapProfileData(platform, data.profile as Record<string, unknown>)
          
          if (mappedProfile.bio) {
            await prisma.creator.update({
              where: { id: creatorId },
              data: { bio: mappedProfile.bio }
            })
          }
          
          profileImported = true
        }
      } catch (err) {
        errors.push(`Error importing profile: ${err}`)
        errorsCount++
      }
    }

    // Import posts if provided
    if (data.posts && Array.isArray(data.posts)) {
      for (const post of data.posts) {
        try {
          // Create post (simplified - in real implementation would handle media upload)
          await prisma.post.create({
            data: {
              creatorId,
              content: (post as Record<string, unknown>).text as string || (post as Record<string, unknown>).caption as string || '',
              visibility: 'public'
            }
          })
          postsImported++
          
          // Count media
          if ((post as Record<string, unknown>).media && Array.isArray((post as Record<string, unknown>).media)) {
            mediaImported += ((post as Record<string, unknown>).media as unknown[]).length
          }
        } catch (err) {
          errors.push(`Error importing post: ${err}`)
          errorsCount++
        }
      }
    }

    // Update final status
    const finalStatus: ImportStatus = errorsCount > 0 
      ? (postsImported > 0 || profileImported ? 'PARTIAL' : 'FAILED')
      : 'COMPLETED'

    await prisma.platformImport.update({
      where: { id: importId },
      data: {
        status: finalStatus,
        profileImported,
        postsImported,
        mediaImported,
        errorsCount,
        errorLog: errors.length > 0 ? JSON.stringify(errors) : null,
        completedAt: new Date()
      }
    })
  } catch (error) {
    console.error('Import processing error:', error)
    
    await prisma.platformImport.update({
      where: { id: importId },
      data: {
        status: 'FAILED',
        errorLog: JSON.stringify([`Fatal error: ${error}`]),
        completedAt: new Date()
      }
    })
  }
}

export default router
