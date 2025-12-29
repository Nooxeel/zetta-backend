# Apapacho Backend - Guía de Desarrollo

## Resumen del Proyecto
API REST para la plataforma Apapacho. Maneja autenticación, perfiles de creadores, suscripciones, favoritos, comentarios y pagos.

## Stack Tecnológico
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js 5
- **Base de Datos**: SQLite (dev) / PostgreSQL (prod)
- **ORM**: Prisma 5
- **Auth**: JWT + bcryptjs
- **Uploads**: Multer

## Estructura del Proyecto
```
├── prisma/
│   ├── schema.prisma      # Modelos de base de datos
│   └── dev.db             # SQLite (desarrollo)
├── src/
│   ├── index.ts           # Entry point, Express config
│   ├── lib/
│   │   └── prisma.ts      # Cliente Prisma singleton
│   └── routes/
│       ├── auth.ts        # Autenticación (login/register)
│       ├── creator.ts     # Perfiles de creadores
│       ├── upload.ts      # Subida de archivos
│       ├── comments.ts    # Sistema de comentarios
│       ├── favorites.ts   # Sistema de favoritos
│       └── users.ts       # Perfil de usuarios/fans
└── uploads/               # Archivos subidos (por userId)
```

## Modelos de Base de Datos (Prisma)

### User
```prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  username      String    @unique
  password      String    # Hash bcrypt
  displayName   String
  avatar        String?
  isCreator     Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  creatorProfile Creator?
  subscriptions  Subscription[]
  donationsSent  Donation[]
  comments       Comment[]
  favorites      Favorite[]
}
```

### Creator
```prisma
model Creator {
  id                String   @id @default(uuid())
  userId            String   @unique
  bio               String?
  profileImage      String?
  coverImage        String?
  
  # Personalización estilo MySpace
  backgroundColor   String   @default("#0f0f14")
  backgroundGradient String?
  backgroundImage   String?
  accentColor       String   @default("#d946ef")
  textColor         String   @default("#ffffff")
  fontFamily        String   @default("Inter")
  
  # Relaciones
  musicTracks       MusicTrack[]
  socialLinks       SocialLink[]
  posts             Post[]
  subscriptionTiers SubscriptionTier[]
  subscribers       Subscription[]
  donationsReceived Donation[]
  auditLogs         ProfileAuditLog[]
  comments          Comment[]
  favoritedBy       Favorite[]
  
  # Stats
  totalViews        Int      @default(0)
  totalLikes        Int      @default(0)
  isVerified        Boolean  @default(false)
}
```

### Otros Modelos
- **MusicTrack**: Tracks de YouTube para perfil (máx 3)
- **SocialLink**: Links a redes sociales
- **SubscriptionTier**: Niveles de suscripción con precios
- **Subscription**: Suscripciones activas usuario-creador
- **Donation**: Propinas/donaciones
- **Comment**: Comentarios en perfiles (requieren aprobación)
- **Favorite**: Creadores favoritos de un usuario
- **ProfileAuditLog**: Historial de cambios en perfiles
- **Post**: Contenido publicado por creadores

## Endpoints de la API

### Autenticación (`/api/auth`)
| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| POST | `/register` | Crear cuenta | No |
| POST | `/login` | Iniciar sesión | No |
| GET | `/me` | Obtener usuario actual | Sí |

### Creadores (`/api/creators`)
| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| GET | `/` | Listar creadores | No |
| GET | `/username/:username` | Obtener por username | No |
| GET | `/:id` | Obtener por ID | No |
| PUT | `/profile` | Actualizar perfil | Sí (creador) |
| POST | `/music` | Agregar track | Sí (creador) |
| DELETE | `/music/:trackId` | Eliminar track | Sí (creador) |
| GET | `/audit-logs` | Ver historial cambios | Sí (creador) |

### Usuarios/Fans (`/api/users`)
| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| GET | `/me` | Perfil del usuario | Sí |
| PUT | `/me` | Actualizar perfil | Sí |
| GET | `/me/subscriptions` | Suscripciones activas | Sí |
| GET | `/me/stats` | Estadísticas del usuario | Sí |
| GET | `/me/payments` | Historial de pagos | Sí |

### Favoritos (`/api/favorites`)
| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| GET | `/` | Mis favoritos | Sí |
| GET | `/check/:creatorId` | ¿Es favorito? | Sí |
| POST | `/:creatorId` | Agregar favorito | Sí |
| DELETE | `/:creatorId` | Quitar favorito | Sí |

### Comentarios (`/api/comments`)
| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| GET | `/creator/:creatorId` | Comentarios de creador | No |
| POST | `/creator/:creatorId` | Crear comentario | Sí |
| PUT | `/:commentId/approve` | Aprobar comentario | Sí (creador) |
| DELETE | `/:commentId` | Eliminar comentario | Sí |
| GET | `/pending` | Comentarios pendientes | Sí (creador) |

### Upload (`/api/upload`)
| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| POST | `/:userId` | Subir archivo | Sí |

### Health Check
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servidor |

## Autenticación JWT

### Estructura del Token
```javascript
{
  userId: "uuid",
  isCreator: boolean,
  iat: timestamp,
  exp: timestamp // 7 días
}
```

### Middleware de Autenticación
```typescript
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = { userId: decoded.userId };
  next();
};
```

## Variables de Entorno (.env)
```env
DATABASE_URL="file:./dev.db"  # SQLite para desarrollo
JWT_SECRET="tu-secret-seguro"
PORT=3001
```

## Comandos de Desarrollo
```bash
npm run dev          # Servidor con hot reload (tsx watch)
npm run build        # Compilar TypeScript
npm run start        # Ejecutar build
npm run db:generate  # Generar cliente Prisma
npm run db:push      # Sincronizar schema con DB
npm run db:studio    # Abrir Prisma Studio
```

## Usuarios de Prueba en DB
| Email | Password | Tipo | Username |
|-------|----------|------|----------|
| test@apapacho.com | test1234 | Creador | gatitaveve |
| fan@test.com | Test1234! | Fan | fantest |
| zippy (otro creador existente) | - | Creador | zippy |

## Respuestas de API

### Éxito
```json
{
  "message": "Operación exitosa",
  "data": { ... }
}
```

### Error
```json
{
  "error": "Descripción del error"
}
```

### Paginación (donde aplique)
```json
{
  "data": [...],
  "total": 100,
  "limit": 20,
  "offset": 0
}
```

## Notas Importantes

1. **CORS**: Configurado para `http://localhost:3000` (frontend)

2. **Uploads**: Los archivos se guardan en `uploads/{userId}/`. Los tipos permitidos son:
   - `profile`: Imagen de perfil
   - `cover`: Imagen de portada
   - `avatar`: Avatar de usuario

3. **Comentarios**: Requieren aprobación del creador antes de ser públicos.

4. **Favoritos**: Usa `creatorId` (no `userId`) para las operaciones. El endpoint `/api/creators/username/:username` retorna el `creatorProfile.id`.

5. **Historial de Pagos**: El endpoint `/me/payments` combina donaciones y suscripciones ordenadas por fecha.

6. **Prisma Client**: Siempre importar desde `lib/prisma.ts` para usar singleton.

7. **Campo `fromUserId`**: En el modelo Donation, el campo del remitente es `fromUserId`, NO `senderId`.

## Ejemplo de Flujo de Autenticación

```bash
# 1. Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fan@test.com","password":"Test1234!"}'

# Respuesta:
{
  "message": "Login successful",
  "user": { "id": "...", "username": "fantest", ... },
  "token": "eyJhbG..."
}

# 2. Usar token en requests
curl http://localhost:3001/api/favorites \
  -H "Authorization: Bearer eyJhbG..."
```

## Testing con cURL

```bash
# Health check
curl http://localhost:3001/api/health

# Login y obtener token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fan@test.com","password":"Test1234!"}' | jq -r '.token')

# Usar token
curl -s http://localhost:3001/api/favorites \
  -H "Authorization: Bearer $TOKEN" | jq

# Obtener creador por username
curl -s http://localhost:3001/api/creators/username/gatitaveve | jq
```
