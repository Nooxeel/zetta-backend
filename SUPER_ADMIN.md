# Super Admin - Sistema de Moderación

## 🔐 Descripción

Sistema de super usuario administrador **secreto** para moderación de contenido. Este usuario tiene acceso completo a todos los contenidos de la plataforma sin ser visible públicamente.

## ✨ Características Implementadas

### 1. **Modelo de Base de Datos**
- ✅ Enum `UserRole` con valores: `USER`, `CREATOR`, `SUPER_ADMIN`
- ✅ Campo `role` agregado al modelo `User` (default: `USER`)

### 2. **Middleware de Autenticación**
- ✅ Middleware `requireSuperAdmin` para proteger rutas de moderación
- ✅ El rol se incluye en el token JWT automáticamente
- ✅ Verificación de permisos en cada request de moderación

### 3. **Endpoints de Moderación**
Todos bajo `/api/admin/moderation/*` (requieren JWT con role SUPER_ADMIN):

#### Usuarios
- `GET /api/admin/moderation/users` - Listar todos los usuarios (con filtros)
  - Query params: `page`, `limit`, `search`, `role`

#### Posts
- `GET /api/admin/moderation/posts` - Listar todos los posts
  - Query params: `page`, `limit`, `creatorId`, `contentType`, `requiresPurchase`
- `GET /api/admin/moderation/posts/:postId` - Ver detalles completos de un post
- `DELETE /api/admin/moderation/posts/:postId` - Eliminar post (con razón)
- `POST /api/admin/moderation/posts/:postId/flag` - Marcar post como peligroso
  - Body: `{ reason: string, severity: 'low'|'medium'|'high'|'critical' }`

#### Estadísticas
- `GET /api/admin/moderation/stats` - Estadísticas generales de la plataforma

### 4. **Ocultamiento en Listados Públicos**
- ✅ Los usuarios con `role: SUPER_ADMIN` NO aparecen en:
  - Discover creators (`/api/discover/creators`)
  - Recomendaciones (`/api/discover/recommended`)
  - Búsquedas públicas
  - Rankings y leaderboards

### 5. **Script de Creación**
Script seguro para crear super admins: `scripts/create-super-admin.ts`

## 🚀 Uso

### Crear el Super Admin

```bash
# En el directorio backend
SUPER_ADMIN_EMAIL="admin@secret.com" \
SUPER_ADMIN_PASSWORD="SuperSecretPass123!" \
SUPER_ADMIN_USERNAME="superadmin" \
SUPER_ADMIN_DISPLAY_NAME="System Admin" \
npm run create-admin
```

**Requisitos:**
- Email y password son obligatorios
- Password debe tener mínimo 12 caracteres
- El script verificará si ya existe un super admin

### Login como Super Admin

```bash
POST /api/auth/login
{
  "email": "admin@secret.com",
  "password": "SuperSecretPass123!"
}
```

Respuesta incluirá el token JWT con el role SUPER_ADMIN.

### Usar los Endpoints de Moderación

```bash
# Listar todos los posts
GET /api/admin/moderation/posts
Authorization: Bearer <JWT_TOKEN>

# Ver detalles de un post específico
GET /api/admin/moderation/posts/abc123
Authorization: Bearer <JWT_TOKEN>

# Marcar post como peligroso
POST /api/admin/moderation/posts/abc123/flag
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "reason": "Contenido potencialmente inapropiado",
  "severity": "high"
}

# Eliminar post
DELETE /api/admin/moderation/posts/abc123
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "reason": "Violación de términos de servicio"
}
```

## 📋 Migración de Base de Datos

Después de implementar estos cambios, ejecutar:

```bash
cd backend
npm run db:push
```

Esto:
1. Creará el enum `UserRole` en PostgreSQL
2. Agregará el campo `role` a la tabla `User`
3. Establecerá el default como `USER` para todos los usuarios existentes

## 🔒 Seguridad

### Características de Seguridad Implementadas:

1. **Token JWT Obligatorio**: Todas las rutas de moderación requieren autenticación
2. **Verificación de Role**: Middleware específico valida que `role === SUPER_ADMIN`
3. **Invisibilidad Pública**: Los super admins no aparecen en ningún listado público
4. **Logging de Auditoría**: Todas las acciones de moderación se registran con:
   - ID del admin
   - Acción realizada
   - Razón (cuando aplica)
   - Timestamp

5. **Password Seguro**: El script de creación requiere contraseñas de 12+ caracteres

### Logs de Auditoría

Todas las acciones se registran en los logs con el tag `[MODERATION]`:

```
[MODERATION] Post flagged { postId, adminId, reason, severity }
[MODERATION] Post deleted by admin { postId, creatorId, creatorUsername, adminId, reason }
```

## 🎯 Casos de Uso

### Moderación de Contenido Inapropiado
1. Admin revisa posts reportados
2. Usa `GET /posts/:postId` para ver detalles completos
3. Si es peligroso, usa `POST /posts/:postId/flag` para marcarlo
4. Si viola términos, usa `DELETE /posts/:postId` para eliminarlo

### Revisión de Usuario Sospechoso
1. Admin busca usuario con `GET /users?search=username`
2. Revisa todos sus posts con `GET /posts?creatorId=xxx`
3. Toma acciones según sea necesario

### Monitoreo de Plataforma
1. Admin revisa estadísticas con `GET /stats`
2. Ve usuarios recientes, posts totales, etc.
3. Detecta patrones anormales

## 📝 Notas Importantes

### Variables de Entorno
Asegúrate de tener configurado en `.env`:
```env
JWT_SECRET=tu_secreto_super_seguro
DATABASE_URL=postgresql://...
```

### Testing
Para testing, puedes crear un admin de prueba:
```bash
SUPER_ADMIN_EMAIL="test-admin@test.com" \
SUPER_ADMIN_PASSWORD="TestAdmin123!" \
npm run create-admin
```

### Múltiples Super Admins
El sistema permite crear múltiples super admins si es necesario. El script preguntará confirmación si ya existe uno.

## 🔄 Roadmap Futuro

Posibles mejoras:
- [ ] Tabla `Flag` o `Report` para trackear reportes
- [ ] Campo `suspended` en User para suspensiones
- [ ] Campo `flagged` en Post para marcar contenido
- [ ] Dashboard web para moderación
- [ ] Sistema de roles más granular (MODERATOR, ADMIN, SUPER_ADMIN)
- [ ] Historial de acciones de moderación por admin
- [ ] Notificaciones automáticas de contenido flaggeado
- [ ] Machine learning para detectar contenido peligroso automáticamente

## 📞 Soporte

Para cualquier duda sobre el sistema de moderación, revisar:
- `src/middleware/auth.ts` - Middleware de autenticación
- `src/routes/admin.ts` - Rutas de moderación
- `scripts/create-super-admin.ts` - Script de creación
