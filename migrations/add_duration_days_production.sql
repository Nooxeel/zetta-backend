-- Migration: Add durationDays to SubscriptionTier
-- Date: 2026-01-07
-- Description: Adds durationDays column to support monthly/quarterly/annual subscriptions

-- Add the column with default value
ALTER TABLE "SubscriptionTier" 
ADD COLUMN IF NOT EXISTS "durationDays" INTEGER NOT NULL DEFAULT 30;

-- Optional: Add a comment
COMMENT ON COLUMN "SubscriptionTier"."durationDays" IS 'Duration in days: 30 (monthly), 90 (quarterly), 365 (annual)';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'SubscriptionTier' 
AND column_name = 'durationDays';
