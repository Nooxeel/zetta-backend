-- Migration: Add bioTitle to Creator table
-- Date: 2026-01-07
-- Description: Adds bioTitle column to allow creators to customize the "About Me" section title

-- Add the column with default value
ALTER TABLE "Creator" 
ADD COLUMN IF NOT EXISTS "bioTitle" TEXT NOT NULL DEFAULT 'Acerca de mí';

-- Optional: Add a comment
COMMENT ON COLUMN "Creator"."bioTitle" IS 'Customizable title for the bio section (default: Acerca de mí)';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'Creator' 
AND column_name = 'bioTitle';
