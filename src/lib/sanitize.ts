/**
 * Sanitización XSS para contenido de usuario
 */

import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitiza un string HTML/texto para prevenir ataques XSS
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') return ''
  
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'target'],
    ALLOW_DATA_ATTR: false
  })
}

/**
 * Sanitiza texto plano (remueve todos los tags HTML)
 */
export function sanitizeText(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') return ''
  
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  })
}

/**
 * Sanitiza contenido de post (array de media items)
 */
export function sanitizePostContent(content: any): any {
  if (!Array.isArray(content)) {
    throw new Error('Post content must be an array')
  }

  return content.map(item => {
    if (typeof item !== 'object' || !item) {
      throw new Error('Invalid content item')
    }

    const { type, url, thumbnail, caption, ...rest } = item

    // Validar tipo
    const validTypes = ['image', 'video', 'audio']
    if (!type || !validTypes.includes(type)) {
      throw new Error(`Invalid content type: ${type}`)
    }

    // Validar URLs (básico - cloudinary o URLs válidas)
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid content URL')
    }

    // Sanitizar campos de texto opcionales
    const sanitized: any = {
      type,
      url: sanitizeText(url), // Remove any potential script injection in URL
      thumbnail: thumbnail ? sanitizeText(thumbnail) : null
    }

    // Sanitizar caption si existe
    if (caption && typeof caption === 'string') {
      sanitized.caption = sanitizeText(caption)
    }

    // Preserve otros campos seguros (isBlurred, etc.)
    if (typeof rest.isBlurred === 'boolean') {
      sanitized.isBlurred = rest.isBlurred
    }

    return sanitized
  })
}

/**
 * Sanitiza un objeto de post completo antes de guardarlo
 */
export function sanitizePost(post: {
  title?: string | null
  description?: string | null
  content: any
}): {
  title: string | null
  description: string | null
  content: any
} {
  return {
    title: post.title ? sanitizeText(post.title).substring(0, 200) : null,
    description: post.description ? sanitizeText(post.description).substring(0, 1000) : null,
    content: sanitizePostContent(post.content)
  }
}

/**
 * Sanitiza un comentario antes de guardarlo
 */
export function sanitizeComment(content: string): string {
  if (!content || typeof content !== 'string') {
    throw new Error('Comment content is required')
  }

  // Permitir formato básico pero no scripts
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br'],
    ALLOWED_ATTR: []
  })

  // Limitar longitud
  return sanitized.substring(0, 2000)
}

/**
 * Sanitiza datos de perfil de creador
 */
export function sanitizeCreatorProfile(profile: {
  bio?: string
  bioTitle?: string
  [key: string]: any
}): any {
  const sanitized: any = { ...profile }

  if (profile.bio) {
    // Permitir formato básico en bio
    sanitized.bio = DOMPurify.sanitize(profile.bio, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p'],
      ALLOWED_ATTR: []
    }).substring(0, 5000)
  }

  if (profile.bioTitle) {
    sanitized.bioTitle = sanitizeText(profile.bioTitle).substring(0, 100)
  }

  return sanitized
}
