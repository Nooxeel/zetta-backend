# Apapacho - Production Readiness Checklist

## 🚀 Pre-Production Steps

### 1. Database Migration: RefreshToken Table

Ejecutar en Railway PostgreSQL (Data > Query):

```sql
-- Create RefreshToken table for secure session management
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_token_key" ON "RefreshToken"("token");
CREATE INDEX IF NOT EXISTS "RefreshToken_token_idx" ON "RefreshToken"("token");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- Add foreign key constraint
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" 
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Después de la migración, regenerar el cliente Prisma:
```bash
cd apapacho-backend
npx prisma generate
```

### 2. Environment Variables (Railway Backend)

```env
# Auth Security
JWT_SECRET=<strong-random-secret-32-chars>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=<different-strong-random-secret>
REFRESH_TOKEN_EXPIRES_DAYS=30

# Cookies
COOKIE_DOMAIN=apapacho.app
COOKIE_SECURE=true

# Cloudinary (for backups & signed URLs)
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx

# Optional: Backup webhook
BACKUP_WEBHOOK_URL=https://api.apapacho.app/internal/backup-status

# Jobs
ENABLE_JOBS=true
```

### 3. Environment Variables (Vercel Frontend)

```env
NEXT_PUBLIC_API_URL=https://api.apapacho.app/api
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=xxx
```

---

## 🔐 Security Features Implemented

### ✅ Signed URLs for Premium Content
- All premium content URLs expire after 1 hour
- Prevents direct link sharing
- Location: `/src/lib/signedUrl.ts`

### ✅ Refresh Tokens
- Access tokens: 15 minutes
- Refresh tokens: 30 days (httpOnly cookies)
- Automatic rotation on refresh
- "Logout all sessions" capability
- Location: `/src/lib/refreshToken.ts`

### ✅ Token Cleanup Job
- Runs daily at 4 AM
- Cleans expired refresh/password/email tokens
- Location: `/src/jobs/scheduler.ts`

---

## 📦 Backup System

### Manual Backup
```bash
npm run db:backup
```

### Automated Backups (Railway Cron)
Add a Railway Cron service with:
- Schedule: `0 3 * * *` (daily 3 AM)
- Command: `npm run db:backup`

### Backup Storage
Backups are compressed and uploaded to Cloudinary under `/apapacho-backups/`

---

## 📋 Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Outbox Publisher | `* * * * *` | Process pending events |
| Payout Calculation | `0 2 * * 0` | Sunday 2 AM - calculate creator payouts |
| Outbox Cleanup | `0 3 * * *` | Daily 3 AM - clean old events |
| Payout Retry | `0 * * * *` | Hourly - retry failed payouts |
| Subscription Renewal | `0 6 * * *` | Daily 6 AM - process renewals |
| Token Cleanup | `0 4 * * *` | Daily 4 AM - clean expired tokens |

---

## 📄 Legal Pages

- **Terms of Service**: `/terminos`
- **Privacy Policy**: `/privacidad`

Both pages are already implemented with complete legal content in Spanish.

---

## 🧪 Pre-Launch Testing

- [ ] Test login/logout flow
- [ ] Test refresh token rotation (wait 15+ min)
- [ ] Test "logout all sessions"
- [ ] Test premium content signed URLs
- [ ] Verify backup script works
- [ ] Verify all scheduled jobs start

---

## 🚨 Post-Migration Commands

```bash
# In apapacho-backend directory
npx prisma generate

# Restart Railway service
# (automatic on new deploy)
```

---

## 📊 Monitoring

### Health Check
- Endpoint: `GET /api/health`
- Returns server status, DB connection, jobs status

### Scheduler Status
- Endpoint: `GET /api/admin/scheduler` (admin only)
- Shows all jobs and their running state

---

## ⚡ Performance Optimizations

Already implemented:
- gzip compression
- Database connection pooling
- Indexed queries
- Rate limiting on auth endpoints
- Image optimization (Cloudinary transformations)
