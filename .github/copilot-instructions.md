# Apapacho Backend - API Server

## Project Overview
Backend API para Apapacho - Plataforma de creadores de contenido.

## Tech Stack
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js 5
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **ORM**: Prisma 5
- **Auth**: JWT + bcryptjs

## Frontend
El frontend está en un proyecto separado: `apapacho`
- Frontend URL: `http://localhost:3000`

## Project Structure
```
├── prisma/
│   ├── schema.prisma    # Database models
│   └── dev.db           # SQLite database
├── src/
│   ├── index.ts         # Express server entry
│   ├── lib/
│   │   └── prisma.ts    # Prisma client singleton
│   └── routes/
│       ├── auth.ts      # Authentication (login/register)
│       ├── creator.ts   # Creator profile routes
│       ├── upload.ts    # File upload routes
│       ├── comments.ts  # Comments system
│       ├── favorites.ts # Favorites system
│       └── users.ts     # User/fan profile & payments
└── uploads/             # User uploaded files (by userId)
```

## Database Models
- **User**: Base user (fan or creator)
- **Creator**: Creator profile with customization
- **MusicTrack**: YouTube tracks for profiles
- **SocialLink**: Social media links
- **SubscriptionTier**: Subscription levels
- **Subscription**: Active subscriptions
- **Post**: Creator content
- **Donation**: Tips/donations
- **Comment**: Profile comments (need approval)
- **Favorite**: User's favorite creators
- **ProfileAuditLog**: Profile change history

## Main API Endpoints
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register
- `GET /api/creators` - List creators
- `GET /api/creators/username/:username` - Get creator by username
- `PUT /api/creators/profile` - Update creator profile (auth)
- `GET /api/favorites` - Get user's favorites (auth)
- `POST /api/favorites/:creatorId` - Add favorite (auth)
- `GET /api/users/me/payments` - Payment history (auth)
- `GET /api/users/me/stats` - User stats (auth)
- `GET /api/comments/:creatorId` - Get approved comments (public)
- `GET /api/comments/:creatorId/pending` - Get pending comments (creator auth)
- `POST /api/comments/:creatorId` - Create comment (auth)
- `PUT /api/comments/:commentId/approve` - Approve comment (creator auth)
- `DELETE /api/comments/:commentId` - Delete comment (auth)
- `GET /api/comments/user/my-comments` - Get user's sent comments (auth)

## IMPORTANTE: Modelo Donation
El campo del usuario que envía es `fromUserId`, NO `senderId`.

## Development Commands
- `npm run dev` - Start with hot reload (port 3001)
- `npm run build` - Compile TypeScript
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Sync schema with database
- `npm run db:studio` - Open Prisma Studio

## Test Users
- **Creador**: test@apapacho.com / test1234 (username: gatitaveve)
- **Fan**: fan@test.com / Test1234! (username: fantest)

## API Base URL
`http://localhost:3001/api`

## Documentation
Ver `DEVELOPMENT.md` para documentación completa de endpoints y modelos.
