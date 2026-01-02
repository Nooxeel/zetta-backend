-- ============================================
-- MIGRACIÓN: PERSONALIZACIÓN DE PERFILES DE FANS
-- Agregar campos de personalización a la tabla User
-- para que los fans puedan customizar sus perfiles
-- ============================================

-- Agregar nuevas columnas a la tabla User
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "bio" TEXT,
ADD COLUMN IF NOT EXISTS "coverImage" TEXT,
ADD COLUMN IF NOT EXISTS "backgroundColor" TEXT NOT NULL DEFAULT '#0f0f14',
ADD COLUMN IF NOT EXISTS "backgroundGradient" TEXT,
ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT '#d946ef';

-- Verificar que las columnas se agregaron correctamente
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'User'
AND column_name IN ('bio', 'coverImage', 'backgroundColor', 'backgroundGradient', 'accentColor')
ORDER BY column_name;
