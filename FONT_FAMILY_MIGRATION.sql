-- ============================================
-- MIGRACIÓN: SELECTOR DE FUENTES
-- Agregar campo fontFamily a la tabla User
-- para que usuarios y creadores puedan personalizar la fuente
-- ============================================

-- Agregar columna fontFamily a User
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "fontFamily" TEXT NOT NULL DEFAULT 'Inter';

-- Verificar que la columna se agregó correctamente
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'User'
AND column_name = 'fontFamily';

-- Resultado esperado: 1 fila con fontFamily
