import { v2 as cloudinary } from 'cloudinary'

/**
 * Signed URLs for premium content protection
 * 
 * URLs expire after a configurable time, preventing permanent sharing
 * Each URL is cryptographically signed and can't be modified
 */

// Default expiration: 1 hour
const DEFAULT_EXPIRATION_SECONDS = 3600

/**
 * Generate a signed URL for a Cloudinary resource
 * @param publicId - The public ID of the resource (e.g., 'apapacho/posts/userId/images/image-123')
 * @param options - Configuration options
 * @returns Signed URL with expiration
 */
export function generateSignedUrl(
  publicId: string,
  options: {
    resourceType?: 'image' | 'video'
    expiresInSeconds?: number
    transformation?: object[]
  } = {}
): string {
  const {
    resourceType = 'image',
    expiresInSeconds = DEFAULT_EXPIRATION_SECONDS,
    transformation = []
  } = options

  // Calculate expiration timestamp
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds

  // Generate signed URL - use 'upload' type since images are uploaded publicly
  // For true protection, would need to change upload settings to authenticated
  const signedUrl = cloudinary.url(publicId, {
    sign_url: true,
    type: 'upload', // Images are uploaded publicly, not authenticated
    resource_type: resourceType,
    expires_at: expiresAt,
    transformation,
    secure: true // Always use HTTPS
  })

  return signedUrl
}

/**
 * Generate a signed URL from a full Cloudinary URL
 * Extracts public_id and generates a new signed URL
 * 
 * @param originalUrl - Full Cloudinary URL (e.g., https://res.cloudinary.com/...)
 * @param options - Configuration options
 * @returns Signed URL with expiration, or original URL if not Cloudinary
 */
export function signCloudinaryUrl(
  originalUrl: string,
  options: {
    resourceType?: 'image' | 'video'
    expiresInSeconds?: number
    transformation?: object[]
  } = {}
): string {
  if (!originalUrl || !originalUrl.includes('cloudinary')) {
    return originalUrl
  }

  try {
    // Determine resource type from URL
    const resourceType = originalUrl.includes('/video/') ? 'video' : 'image'
    
    let publicId: string
    
    // Check if URL already has authenticated format with signature
    // Format: /image/authenticated/s--SIGNATURE--/v123/folder/file
    if (originalUrl.includes('/authenticated/')) {
      // Extract public_id from authenticated URL
      // Remove query params first
      const urlWithoutQuery = originalUrl.split('?')[0]
      
      // Find the part after the signature (s--...--/)
      const signatureMatch = urlWithoutQuery.match(/\/s--[^/]+--\/(.+)$/)
      if (signatureMatch) {
        let pathAfterSig = signatureMatch[1]
        // Remove version prefix if present (v1234567890/)
        pathAfterSig = pathAfterSig.replace(/^v\d+\//, '')
        // Remove file extension
        publicId = pathAfterSig.replace(/\.[^/.]+$/, '')
      } else {
        // Fallback: try to get path after /authenticated/
        const authMatch = urlWithoutQuery.match(/\/authenticated\/(.+)$/)
        if (authMatch) {
          let pathAfterAuth = authMatch[1]
          // Remove signature if present
          pathAfterAuth = pathAfterAuth.replace(/s--[^/]+--\//, '')
          // Remove version prefix
          pathAfterAuth = pathAfterAuth.replace(/^v\d+\//, '')
          // Remove file extension
          publicId = pathAfterAuth.replace(/\.[^/.]+$/, '')
        } else {
          return originalUrl
        }
      }
    } else {
      // Standard URL format: https://res.cloudinary.com/{cloud}/image/upload/v{version}/{folder}/{file}
      const urlParts = originalUrl.split('/upload/')
      if (urlParts.length < 2) {
        return originalUrl
      }

      // Get the path after /upload/ (may include version and transformations)
      let pathAfterUpload = urlParts[1]
      
      // Remove query params
      pathAfterUpload = pathAfterUpload.split('?')[0]
      
      // Remove version prefix if present (v1234567890/)
      pathAfterUpload = pathAfterUpload.replace(/^v\d+\//, '')
      
      // Remove file extension to get public_id
      publicId = pathAfterUpload.replace(/\.[^/.]+$/, '')
    }

    return generateSignedUrl(publicId, {
      ...options,
      resourceType: options.resourceType || resourceType
    })
  } catch (error) {
    console.error('Error signing Cloudinary URL:', error)
    return originalUrl
  }
}

/**
 * Sign multiple URLs in a content array (for posts with multiple media items)
 * 
 * NOTE: URL signing is currently disabled because Cloudinary images are uploaded
 * with type 'upload' (public). Signed URLs with expiration only work with 
 * type 'authenticated'. For now, we return original URLs.
 * 
 * TODO: To enable true URL protection:
 * 1. Change CloudinaryStorage to use access_mode: 'authenticated'
 * 2. Re-enable URL signing
 * 
 * @param content - Array of content items with url and type
 * @param expiresInSeconds - Expiration time for all URLs (currently unused)
 * @returns Content array with URLs (unchanged for now)
 */
export function signContentUrls(
  content: Array<{ url: string; type: string; [key: string]: any }>,
  _expiresInSeconds: number = DEFAULT_EXPIRATION_SECONDS
): Array<{ url: string; type: string; [key: string]: any }> {
  // Return content as-is since signing is disabled
  // This fixes the issue where signed URLs were breaking image display
  return content
}

/**
 * Check if a URL is a valid signed Cloudinary URL
 * Note: This only checks format, not cryptographic validity
 * 
 * @param url - URL to check
 * @returns true if URL appears to be signed
 */
export function isSignedUrl(url: string): boolean {
  return url.includes('/s--') && url.includes('--/')
}
