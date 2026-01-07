# 🔧 Cuenta Demo SERVITPLUS

Cuenta de demostración para **Servitplus - Gasfitería Integral**

## 📋 Información del Cliente

- **Empresa**: SERVITPLUS
- **Servicio**: Gasfitería Integral - Servicio Técnico
- **Técnico Certificado SEC**: Juan Carlos Pulido
- **Teléfono**: +56 9 9507 7828
- **Email**: contacto@servitplus.cl

## 🎯 Propósito

Perfil de demostración SIN suscripción, solo con información de contacto para que el cliente pueda mostrar sus servicios.

## 🚀 Instalación en Producción (Railway)

### Opción 1: SQL Directo (RECOMENDADO)

1. Ve a Railway Dashboard → PostgreSQL → Data/Query
2. Ejecuta el archivo: `migrations/create_servitplus_demo.sql`
3. Verifica con la query al final del archivo

### Opción 2: Usando el Seed Script

Si tienes acceso a la base de datos:

```bash
npx tsx prisma/seeds/servitplus-demo.ts
```

## 🔑 Credenciales

```
Email: contacto@servitplus.cl
Username: servitplus
Password: Servitplus2026!
```

## 📱 Perfil URL

```
https://apapacho.com/servitplus
```

## 📝 Servicios Incluidos en la Bio

- ✅ Técnico Certificado SEC
- 👨‍🔧 Juan Carlos Pulido
- 🏠 Atención Domiciliaria

**Servicios:**
- Mantención y Reparación
- Instalación de Sistemas de Gas
- Calefont Ionizado, Forzado y Natural
- Grifería baños y Cocinas
- Detección de Fugas de Gas
- Soldaduras Plata y Estaño
- Limpieza de Cañerías (Sarro)
- Instalación Filtro AntiSarro
- Informe Técnico T6

**Marcas Autorizadas:**
Ursus Trotter • Splendid • Mademsa • Neckar • Junkers

## 🔗 Links Sociales Configurados

1. **Teléfono/WhatsApp**: +56 9 9507 7828
2. **WhatsApp Web**: https://wa.me/56995077828
3. **Email**: mailto:contacto@servitplus.cl

## 🎨 Personalización del Perfil

- **Color de Fondo**: Azul oscuro (`#1a2744`)
- **Gradiente**: `from-[#1a2744] to-[#0d1520]`
- **Color de Acento**: Azul (`#3b82f6`)

## 📸 Próximos Pasos

1. **Subir Imagen de Perfil**: 
   - Usar el flyer como foto de perfil
   - Desde: `/creator/edit` → Click en avatar circular

2. **Subir Imagen de Portada** (opcional):
   - Imagen de trabajos realizados
   - Desde: `/creator/edit` → Click en área de portada

3. **Agregar Fotos de Servicios** (opcional):
   - Subir fotos de trabajos
   - Desde: `/creator/posts` o `/creator/upload-image`

## ⚠️ Notas Importantes

- **NO crear planes de suscripción** - Esta es una cuenta demo solo para mostrar servicios
- La cuenta está configurada como CREATOR pero sin monetización
- Los usuarios pueden ver la información de contacto sin suscribirse
- El cliente puede iniciar sesión y editar su perfil cuando quiera

## 🧪 Verificación

Después de crear la cuenta, verifica:

```sql
SELECT 
  u.username,
  u."displayName",
  u.email,
  u.role,
  c.bio IS NOT NULL as "hasProfile",
  COUNT(sl.id) as "socialLinksCount"
FROM "User" u
LEFT JOIN "Creator" c ON c.id = u.id
LEFT JOIN "SocialLink" sl ON sl."creatorId" = u.id
WHERE u.username = 'servitplus'
GROUP BY u.id, u.username, u."displayName", u.email, u.role, c.bio;
```

Debe mostrar:
- ✅ username: servitplus
- ✅ displayName: SERVITPLUS
- ✅ role: CREATOR
- ✅ hasProfile: true
- ✅ socialLinksCount: 3

## 📞 Contacto del Cliente

Para entregar la cuenta al cliente, proporciónale:

1. **URL del perfil**: https://apapacho.com/servitplus
2. **Credenciales de acceso**: 
   - Email: contacto@servitplus.cl
   - Contraseña: Servitplus2026!
3. **Instrucciones**: Puede editar su perfil, subir fotos, pero NO debe crear planes de suscripción

## 🔄 Actualización del Perfil

Si necesitas actualizar la información, el cliente puede:
1. Iniciar sesión en https://apapacho.com/login
2. Ir a "Editar Perfil"
3. Modificar biografía, colores, imágenes
4. **NO** ir a "Planes de Suscripción" (cuenta demo)
