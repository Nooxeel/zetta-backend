# Migration: Post Likes y Comments

## Descripción
Agregar soporte completo para likes y comentarios en posts con tracking de usuarios, prevención de duplicados, y contadores denormalizados para performance.

## SQL para ejecutar en Railway → PostgreSQL → Query

```sql
-- ==================== CREAR TABLAS ====================

-- Tabla para tracking de likes en posts
CREATE TABLE IF NOT EXISTS "PostLike" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Tabla para comentarios en posts
CREATE TABLE IF NOT EXISTS "PostComment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ==================== CREAR ÍNDICES ====================

-- PostLike indexes
CREATE UNIQUE INDEX IF NOT EXISTS "PostLike_postId_userId_key" ON "PostLike"("postId", "userId");
CREATE INDEX IF NOT EXISTS "PostLike_postId_idx" ON "PostLike"("postId");
CREATE INDEX IF NOT EXISTS "PostLike_userId_idx" ON "PostLike"("userId");
CREATE INDEX IF NOT EXISTS "PostLike_createdAt_idx" ON "PostLike"("createdAt");

-- PostComment indexes
CREATE INDEX IF NOT EXISTS "PostComment_postId_idx" ON "PostComment"("postId");
CREATE INDEX IF NOT EXISTS "PostComment_userId_idx" ON "PostComment"("userId");
CREATE INDEX IF NOT EXISTS "PostComment_createdAt_idx" ON "PostComment"("createdAt");
CREATE INDEX IF NOT EXISTS "PostComment_deletedAt_idx" ON "PostComment"("deletedAt");

-- ==================== VERIFICACIÓN ====================

-- Verificar que las tablas se crearon correctamente
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('PostLike', 'PostComment')
ORDER BY table_name;

-- Verificar estructura de PostLike
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'PostLike'
ORDER BY ordinal_position;

-- Verificar estructura de PostComment
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'PostComment'
ORDER BY ordinal_position;

-- Verificar índices de PostLike
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'PostLike'
ORDER BY indexname;

-- Verificar índices de PostComment
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'PostComment'
ORDER BY indexname;
```

## Resultado Esperado

Después de ejecutar el SQL, deberías ver:

### Tablas creadas:
- ✅ PostLike
- ✅ PostComment

### Columnas de PostLike:
- id (text, NOT NULL)
- postId (text, NOT NULL)
- userId (text, NOT NULL)
- createdAt (timestamp, NOT NULL, default: CURRENT_TIMESTAMP)

### Columnas de PostComment:
- id (text, NOT NULL)
- postId (text, NOT NULL)
- userId (text, NOT NULL)
- content (text, NOT NULL)
- createdAt (timestamp, NOT NULL, default: CURRENT_TIMESTAMP)
- updatedAt (timestamp, NOT NULL, default: CURRENT_TIMESTAMP)
- deletedAt (timestamp, NULL)

### Índices creados:
- PostLike_postId_userId_key (UNIQUE)
- PostLike_postId_idx
- PostLike_userId_idx
- PostLike_createdAt_idx
- PostComment_postId_idx
- PostComment_userId_idx
- PostComment_createdAt_idx
- PostComment_deletedAt_idx

## Siguiente Paso

Después de ejecutar el SQL en Railway, hacer un redeploy del backend para regenerar el Prisma Client con los nuevos modelos.
