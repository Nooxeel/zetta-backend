# Apapacho Backend API

Backend API para la plataforma Apapacho - Plataforma de creadores de contenido.

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: SQLite (desarrollo) / PostgreSQL (producción)
- **ORM**: Prisma
- **Auth**: JWT + bcrypt

## Instalación

```bash
# Instalar dependencias
npm install

# Generar cliente Prisma
npm run db:generate

# Crear/sincronizar base de datos
npm run db:push

# Iniciar en desarrollo
npm run dev
```

## Scripts

```bash
npm run dev        # Desarrollo con hot reload
npm run build      # Build de producción
npm run start      # Iniciar producción
npm run db:generate # Generar Prisma Client
npm run db:push    # Sincronizar schema con DB
npm run db:migrate # Crear migraciones
npm run db:studio  # Abrir Prisma Studio
```

## API Endpoints

### Auth
- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/me` - Usuario actual (requiere token)

### Creators
- `GET /api/creators` - Listar creadores
- `GET /api/creators/:id` - Obtener creador por ID
- `GET /api/creators/username/:username` - Obtener por username
- `PUT /api/creators/profile` - Actualizar perfil (requiere token)
- `POST /api/creators/music` - Agregar música (máx 3)
- `DELETE /api/creators/music/:trackId` - Eliminar música

### Upload
- `POST /api/upload/avatar` - Subir foto de perfil
- `POST /api/upload/cover` - Subir imagen de portada
- `POST /api/upload/content` - Subir contenido (múltiples archivos)

## Variables de Entorno

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="tu-secreto-super-seguro"
PORT=3001
PLATFORM_COMMISSION=0.15
```

## Estructura

```
├── prisma/
│   ├── schema.prisma    # Modelos de datos
│   └── dev.db           # SQLite (desarrollo)
├── src/
│   ├── index.ts         # Entry point
│   ├── lib/
│   │   └── prisma.ts    # Cliente Prisma
│   └── routes/
│       ├── auth.ts      # Rutas de autenticación
│       ├── creator.ts   # Rutas de creadores
│       └── upload.ts    # Rutas de upload
└── uploads/             # Archivos subidos (por userId)
```

## Modelos de Datos

- **User** - Usuarios (fans y creadores)
- **Creator** - Perfiles de creadores + personalización
- **MusicTrack** - Canciones de YouTube (máx 3 por perfil)
- **SocialLink** - Links a redes sociales
- **SubscriptionTier** - Niveles de suscripción
- **Subscription** - Suscripciones activas
- **Post** - Contenido publicado
- **Donation** - Donaciones/tips

## Puerto

El backend corre en `http://localhost:3001`

---

Hecho con 💜 para Apapacho
