# Migration: Performance Indexes

## Descripción
Agregar índices de performance críticos para optimizar queries de suscripciones y posts.

## Problema
Las consultas de subscripciones por status y posts por creatorId no tienen índices, causando full table scans en queries frecuentes.

## SQL para ejecutar en Railway → PostgreSQL → Query

```sql
-- ==================== CREAR ÍNDICES DE SUBSCRIPTION ====================

-- Index para queries de suscripciones de usuario por status
CREATE INDEX IF NOT EXISTS "Subscription_userId_status_idx"
ON "Subscription"("userId", "status");

-- Index para queries de suscriptores de creador por status
CREATE INDEX IF NOT EXISTS "Subscription_creatorId_status_idx"
ON "Subscription"("creatorId", "status");

-- Index para queries generales por status
CREATE INDEX IF NOT EXISTS "Subscription_status_idx"
ON "Subscription"("status");

-- ==================== CREAR ÍNDICES DE POST ====================

-- Index para feed de posts de creador ordenados por fecha
CREATE INDEX IF NOT EXISTS "Post_creatorId_createdAt_idx"
ON "Post"("creatorId", "createdAt" DESC);

-- Index para filtrar posts por creador y visibilidad
CREATE INDEX IF NOT EXISTS "Post_creatorId_visibility_idx"
ON "Post"("creatorId", "visibility");

-- ==================== VERIFICACIÓN ====================

-- Verificar índices de Subscription
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'Subscription'
ORDER BY indexname;

-- Verificar índices de Post
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'Post'
ORDER BY indexname;

-- ==================== ANALIZAR PERFORMANCE ====================

-- Analizar tabla Subscription para actualizar estadísticas
ANALYZE "Subscription";

-- Analizar tabla Post para actualizar estadísticas
ANALYZE "Post";
```

## Resultado Esperado

### Índices de Subscription:
- ✅ Subscription_userId_status_idx
- ✅ Subscription_creatorId_status_idx
- ✅ Subscription_status_idx

### Índices de Post:
- ✅ Post_creatorId_createdAt_idx
- ✅ Post_creatorId_visibility_idx

## Impacto de Performance

### Subscription queries:
- `WHERE userId = ? AND status = 'active'` → 10-100x más rápido
- `WHERE creatorId = ? AND status = 'active'` → 10-100x más rápido
- Crítico para endpoint `/api/subscriptions/check/:creatorId`

### Post queries:
- `WHERE creatorId = ? ORDER BY createdAt DESC` → 5-50x más rápido
- `WHERE creatorId = ? AND visibility = 'public'` → 5-50x más rápido
- Crítico para perfiles de creadores y feeds

## Siguiente Paso

Después de ejecutar el SQL en Railway, hacer un redeploy del backend para que Prisma reconozca los nuevos índices.
