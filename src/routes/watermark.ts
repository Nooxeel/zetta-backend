import { Router, Request, Response } from 'express'
import { createLogger } from '../lib/logger'
import prisma from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { WatermarkSettings, getDefaultWatermarkSettings, applyWatermark } from '../lib/watermark'

const router = Router()
const logger = createLogger('Watermark')

// GET /api/watermark/settings - Obtener configuración de watermark del creador
router.get('/settings', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId

    const creator = await prisma.creator.findUnique({
      where: { userId },
      select: { watermarkSettings: true, id: true }
    })

    if (!creator) {
      res.status(404).json({ error: 'Perfil de creador no encontrado' })
      return
    }

    const settings = (creator.watermarkSettings as unknown as WatermarkSettings) || getDefaultWatermarkSettings()

    res.json({ settings })
  } catch (error) {
    logger.error('Error al obtener configuración de watermark:', error)
    res.status(500).json({ error: 'Error al obtener configuración' })
  }
})

// PUT /api/watermark/settings - Actualizar configuración de watermark
router.put('/settings', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { enabled, text, position, opacity, size } = req.body

    const creator = await prisma.creator.findUnique({
      where: { userId }
    })

    if (!creator) {
      res.status(404).json({ error: 'Perfil de creador no encontrado' })
      return
    }

    // Validar posición
    const validPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']
    if (position && !validPositions.includes(position)) {
      res.status(400).json({ error: 'Posición inválida' })
      return
    }

    // Validar tamaño
    const validSizes = ['small', 'medium', 'large']
    if (size && !validSizes.includes(size)) {
      res.status(400).json({ error: 'Tamaño inválido' })
      return
    }

    // Validar opacidad
    const validOpacity = opacity !== undefined ? Math.max(0.1, Math.min(1, opacity)) : undefined

    // Obtener settings actuales y mezclar con nuevos
    const currentSettings = (creator.watermarkSettings as unknown as WatermarkSettings) || getDefaultWatermarkSettings()
    
    const newSettings: WatermarkSettings = {
      enabled: enabled !== undefined ? Boolean(enabled) : currentSettings.enabled,
      text: text !== undefined ? String(text).slice(0, 50) : currentSettings.text, // Max 50 chars
      position: position || currentSettings.position,
      opacity: validOpacity || currentSettings.opacity,
      size: size || currentSettings.size
    }

    await prisma.creator.update({
      where: { id: creator.id },
      data: { watermarkSettings: newSettings as any }
    })

    logger.info(`Creator ${creator.id} updated watermark settings`)

    res.json({
      success: true,
      settings: newSettings
    })
  } catch (error) {
    logger.error('Error al actualizar watermark:', error)
    res.status(500).json({ error: 'Error al actualizar configuración' })
  }
})

// POST /api/watermark/apply - Aplicar watermark a una URL (utility endpoint)
router.post('/apply', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, creatorId, contentType = 'image' } = req.body

    if (!url || !creatorId) {
      res.status(400).json({ error: 'URL y creatorId son requeridos' })
      return
    }

    const creator = await prisma.creator.findUnique({
      where: { id: creatorId },
      select: { watermarkSettings: true, user: { select: { username: true } } }
    })

    if (!creator) {
      res.json({ url }) // Devolver URL original si no existe creador
      return
    }

    let settings = (creator.watermarkSettings as unknown as WatermarkSettings) || getDefaultWatermarkSettings()
    
    // Si no hay texto configurado, usar @username
    if (settings.enabled && !settings.text && creator.user) {
      settings = { ...settings, text: `@${creator.user.username}` }
    }

    const watermarkedUrl = applyWatermark(url, settings, contentType as 'image' | 'video')

    res.json({ 
      url: watermarkedUrl,
      hasWatermark: settings.enabled && Boolean(settings.text)
    })
  } catch (error) {
    logger.error('Error al aplicar watermark:', error)
    res.status(500).json({ error: 'Error al aplicar watermark' })
  }
})

// POST /api/watermark/preview - Previsualizar watermark en una URL de ejemplo
router.post('/preview', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { settings: previewSettings, sampleUrl } = req.body

    const creator = await prisma.creator.findUnique({
      where: { userId },
      select: { user: { select: { username: true } } }
    })

    if (!creator) {
      res.status(404).json({ error: 'Perfil de creador no encontrado' })
      return
    }

    // Usar URL de ejemplo si no se proporciona una
    const url = sampleUrl || 'https://res.cloudinary.com/demo/image/upload/sample.jpg'
    
    // Usar settings de preview o crear unos por defecto con el username
    const settings: WatermarkSettings = {
      enabled: true,
      text: previewSettings?.text || `@${creator.user.username}`,
      position: previewSettings?.position || 'bottom-right',
      opacity: previewSettings?.opacity || 0.7,
      size: previewSettings?.size || 'medium'
    }

    const watermarkedUrl = applyWatermark(url, settings, 'image')

    res.json({
      originalUrl: url,
      watermarkedUrl,
      settings
    })
  } catch (error) {
    logger.error('Error al previsualizar watermark:', error)
    res.status(500).json({ error: 'Error al previsualizar' })
  }
})

export default router
