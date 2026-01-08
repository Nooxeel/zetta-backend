/**
 * Sanitización XSS para contenido de usuario (Backend - Node.js)
 * Implementación nativa sin dependencias externas para mejor compatibilidad
 */

/**
 * Escapa caracteres HTML peligrosos
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  }
  return text.replace(/[&<>"'/]/g, (char) => map[char])
}

/**
 * Remueve todos los tags HTML excepto los permitidos
 */
function stripHtml(html: string, allowedTags: string[] = []): string {
  if (!html) return ''
  
  // Si no hay tags permitidos, remover todos
  if (allowedTags.length === 0) {
    return html.replace(/<[^>]*>/g, '')
  }
  
  // Permitir solo tags específicos (formato simple)
  const allowedPattern = allowedTags.map(tag => `</?${tag}>`).join('|')
  const regex = new RegExp(`<(?!(?:${allowedTags.join('|')})[> /])([^>]+)>`, 'gi')
  return html.replace(regex, '')
}

/**
 * Sanitiza un string HTML/texto para prevenir ataques XSS
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') return ''
  
  // Remover scripts y tags peligrosos
  let clean = dirty
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
  
  // Permitir solo tags seguros básicos
  const allowedTags = ['b', 'i', 'em', 'strong', 'br', 'p']
  clean = stripHtml(clean, allowedTags)
  
  return clean
}

/**
 * Sanitiza texto plano (remueve todos los tags HTML)
 */
export function sanitizeText(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') return ''
  
  // Remover todos los tags HTML
  return dirty
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .trim()
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
  const sanitized = sanitizeHtml(content)

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
    sanitized.bio = sanitizeHtml(profile.bio).substring(0, 5000)
  }

  if (profile.bioTitle) {
    sanitized.bioTitle = sanitizeText(profile.bioTitle).substring(0, 100)
  }

  return sanitized
}
