import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage para imágenes de perfil y portada
export const profileImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const userId = (req as any).userId;
    return {
      folder: `apapacho/profiles/${userId}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
      public_id: file.fieldname === 'profileImage' ? 'profile' : 'cover',
    };
  },
});

// Storage para posts - imágenes
export const postImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const userId = (req as any).userId;
    const timestamp = Date.now();
    return {
      folder: `apapacho/posts/${userId}/images`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 2000, height: 2000, crop: 'limit', quality: 'auto' }],
      public_id: `image-${timestamp}`,
    };
  },
});

// Storage para posts - videos
export const postVideoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const userId = (req as any).userId;
    const timestamp = Date.now();
    return {
      folder: `apapacho/posts/${userId}/videos`,
      allowed_formats: ['mp4', 'mov', 'avi', 'webm', 'mkv'],
      resource_type: 'video' as const,
      public_id: `video-${timestamp}`,
    };
  },
});

export { cloudinary };
