import { v2 as cloudinary } from 'cloudinary'
import { createLogger } from './logger'

const logger = createLogger('Watermark')

export interface WatermarkSettings {
  enabled: boolean
  text: string           // Texto del watermark (ej: @username)
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
  opacity: number        // 0.1 - 1.0
  size: 'small' | 'medium' | 'large'
}

// Mapeo de posiciones a gravity de Cloudinary
const POSITION_MAP: Record<string, string> = {
  'top-left': 'north_west',
  'top-right': 'north_east',
  'bottom-left': 'south_west',
  'bottom-right': 'south_east',
  'center': 'center'
}

// Mapeo de tamaños a font_size
const SIZE_MAP: Record<string, number> = {
  'small': 24,
  'medium': 36,
  'large': 48
}

/**
 * Genera la URL de una imagen con watermark aplicado
 * Usa las transformaciones de Cloudinary para aplicar el overlay de texto
 */
export function getWatermarkedImageUrl(
  originalUrl: string,
  settings: WatermarkSettings
): string {
  if (!settings.enabled || !settings.text) {
    return originalUrl
  }

  try {
    // Extraer el public_id de la URL de Cloudinary
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    if (!cloudName || !originalUrl.includes('cloudinary')) {
      return originalUrl
    }

    // Parse la URL para obtener el public_id
    // Formato: https://res.cloudinary.com/{cloud_name}/image/upload/{transformaciones}/{public_id}.{ext}
    const urlParts = originalUrl.split('/upload/')
    if (urlParts.length !== 2) {
      return originalUrl
    }

    const pathAfterUpload = urlParts[1]
    
    // Construir transformación de watermark
    const gravity = POSITION_MAP[settings.position] || 'south_east'
    const fontSize = SIZE_MAP[settings.size] || 36
    const opacity = Math.round((settings.opacity || 0.7) * 100)
    
    // Texto encode para URL (reemplazar caracteres especiales)
    const encodedText = encodeURIComponent(settings.text)
    
    // Transformación de overlay de texto
    // l_text: = overlay de texto
    // Formato: l_text:fuente_tamaño:texto
    const watermarkTransform = [
      `l_text:Arial_${fontSize}_bold:${encodedText}`,
      `co_white`,  // Color del texto
      `o_${opacity}`,  // Opacidad
      `g_${gravity}`,  // Posición
      `x_20`,  // Padding horizontal
      `y_20`   // Padding vertical
    ].join(',')

    // También agregar un borde/sombra para mejor visibilidad
    const shadowTransform = [
      `l_text:Arial_${fontSize}_bold:${encodedText}`,
      `co_rgb:000000`,  // Sombra negra
      `o_${Math.round(opacity * 0.5)}`,
      `g_${gravity}`,
      `x_22`,
      `y_22`
    ].join(',')

    // Insertar transformación después de /upload/
    const newUrl = `${urlParts[0]}/upload/${shadowTransform}/${watermarkTransform}/${pathAfterUpload}`
    
    return newUrl
  } catch (error) {
    logger.error('Error generating watermarked URL:', error)
    return originalUrl
  }
}

/**
 * Genera la URL de un video con watermark
 * Cloudinary también soporta overlays en videos
 */
export function getWatermarkedVideoUrl(
  originalUrl: string,
  settings: WatermarkSettings
): string {
  if (!settings.enabled || !settings.text) {
    return originalUrl
  }

  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    if (!cloudName || !originalUrl.includes('cloudinary')) {
      return originalUrl
    }

    const urlParts = originalUrl.split('/upload/')
    if (urlParts.length !== 2) {
      return originalUrl
    }

    const pathAfterUpload = urlParts[1]
    
    const gravity = POSITION_MAP[settings.position] || 'south_east'
    const fontSize = SIZE_MAP[settings.size] || 36
    const opacity = Math.round((settings.opacity || 0.7) * 100)
    const encodedText = encodeURIComponent(settings.text)

    // Para videos, la sintaxis es similar
    const watermarkTransform = [
      `l_text:Arial_${fontSize}_bold:${encodedText}`,
      `co_white`,
      `o_${opacity}`,
      `g_${gravity}`,
      `x_20`,
      `y_20`
    ].join(',')

    const newUrl = `${urlParts[0]}/upload/${watermarkTransform}/${pathAfterUpload}`
    
    return newUrl
  } catch (error) {
    logger.error('Error generating watermarked video URL:', error)
    return originalUrl
  }
}

/**
 * Aplica watermark a una URL según el tipo de contenido
 */
export function applyWatermark(
  url: string,
  settings: WatermarkSettings | null,
  contentType: 'image' | 'video' = 'image'
): string {
  if (!settings || !settings.enabled) {
    return url
  }

  return contentType === 'video'
    ? getWatermarkedVideoUrl(url, settings)
    : getWatermarkedImageUrl(url, settings)
}

/**
 * Obtiene configuración de watermark por defecto
 */
export function getDefaultWatermarkSettings(): WatermarkSettings {
  return {
    enabled: false,
    text: '',
    position: 'bottom-right',
    opacity: 0.7,
    size: 'medium'
  }
}

export default {
  getWatermarkedImageUrl,
  getWatermarkedVideoUrl,
  applyWatermark,
  getDefaultWatermarkSettings
}
