-- ============================================
-- MIGRACIÓN: SISTEMA DE ENLACES SOCIALES
-- Actualiza la tabla SocialLink para soportar reordenamiento y visibilidad
-- ============================================

-- Agregar nuevas columnas a SocialLink
ALTER TABLE "SocialLink"
ADD COLUMN IF NOT EXISTS "icon" TEXT,
ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "isVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Crear índices para optimizar queries
CREATE INDEX IF NOT EXISTS "SocialLink_creatorId_order_idx" ON "SocialLink"("creatorId", "order");
CREATE INDEX IF NOT EXISTS "SocialLink_creatorId_isVisible_idx" ON "SocialLink"("creatorId", "isVisible");

-- Actualizar columna updatedAt para que se actualice automáticamente
-- Nota: PostgreSQL no tiene ON UPDATE automático, se maneja desde la aplicación

-- Verificar que las columnas se agregaron correctamente
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'SocialLink'
AND column_name IN ('icon', 'order', 'isVisible', 'updatedAt')
ORDER BY column_name;

-- Verificar índices creados
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'SocialLink'
AND indexname LIKE '%creatorId%';
