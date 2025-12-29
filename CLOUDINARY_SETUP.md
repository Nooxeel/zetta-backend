# ☁️ Configuración de Cloudinary - Guía Paso a Paso

## 1. Crear cuenta en Cloudinary

1. Ve a https://cloudinary.com/users/register_free
2. Regístrate (gratis hasta 25GB de almacenamiento y 25GB de bandwidth)
3. Confirma tu email

## 2. Obtener credenciales

1. Una vez logueado, ve al **Dashboard**
2. Encontrarás tu información en la sección "Account Details":
   ```
   Cloud Name: your_cloud_name
   API Key: 123456789012345
   API Secret: abcdef123456789
   ```

## 3. Configurar variables de entorno

### Backend (Railway):
En Railway → Tu servicio → **Variables**, agrega:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Local (.env):
```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## 4. Estructura de carpetas en Cloudinary

El sistema creará automáticamente:
```
apapacho/
├── profiles/
│   └── {userId}/
│       ├── profile
│       └── cover
└── posts/
    └── {userId}/
        ├── images/
        │   └── image-{timestamp}
        └── videos/
            └── video-{timestamp}
```

## 5. Archivos actualizados

✅ **src/lib/cloudinary.ts** - Configuración y storage
✅ **src/routes/upload.ts** - Upload de perfil/portada con Cloudinary
✅ **src/routes/posts.ts** - Upload de posts con Cloudinary
✅ **package.json** - Dependencias agregadas

## 6. Dependencias instaladas

```json
{
  "cloudinary": "^2.x",
  "multer-storage-cloudinary": "^5.x"
}
```

## 7. Ventajas de Cloudinary

- ✅ **Almacenamiento ilimitado** (plan gratuito: 25GB)
- ✅ **CDN global** automático
- ✅ **Transformaciones** de imagen on-the-fly
- ✅ **Optimización automática** de calidad
- ✅ **URLs permanentes** y seguras
- ✅ **No requiere gestión** de archivos

## 8. URLs de ejemplo

Antes (local):
```
/uploads/user-id/images/image-123.png
```

Después (Cloudinary):
```
https://res.cloudinary.com/your-cloud-name/image/upload/v1234567890/apapacho/posts/user-id/images/image-123.png
```

## 9. Transformaciones disponibles

Cloudinary permite transformar imágenes en la URL:
```
// Redimensionar a 300x300
https://res.cloudinary.com/.../w_300,h_300/image.jpg

// Calidad automática
https://res.cloudinary.com/.../q_auto/image.jpg

// Formato automático (WebP para Chrome, etc)
https://res.cloudinary.com/.../f_auto/image.jpg
```

## 10. Monitoreo

- **Dashboard**: https://console.cloudinary.com
- **Media Library**: Ver todos los archivos subidos
- **Usage**: Monitorear uso de almacenamiento y bandwidth

## 11. Límites del plan gratuito

- ✅ 25 GB almacenamiento
- ✅ 25 GB bandwidth/mes
- ✅ 25,000 transformaciones/mes
- ✅ 10 GB video storage
- ✅ Sin límite de archivos

## 12. Next steps

Después de configurar Cloudinary en Railway:
1. Probar upload de perfil: `/api/upload/profile`
2. Probar upload de portada: `/api/upload/cover`
3. Probar posts con imágenes: `/api/posts/upload-image`
4. Probar posts con videos: `/api/posts/upload-video`

---

## 🔗 Enlaces útiles

- Dashboard: https://console.cloudinary.com
- Documentación: https://cloudinary.com/documentation
- Node.js SDK: https://cloudinary.com/documentation/node_integration
- Precios: https://cloudinary.com/pricing
