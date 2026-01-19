-- Migration: Add Real Prizes to Roulette System
-- Date: 2025-01-XX
-- Description: Adds subscription and discount prizes to the roulette

-- 1. Create PrizeType enum
DO $$ BEGIN
    CREATE TYPE "PrizeType" AS ENUM ('POINTS', 'SUBSCRIPTION', 'DISCOUNT', 'RETRY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add new columns to RouletteSpin table
ALTER TABLE "RouletteSpin" 
ADD COLUMN IF NOT EXISTS "prizeType" "PrizeType" NOT NULL DEFAULT 'POINTS';

ALTER TABLE "RouletteSpin" 
ADD COLUMN IF NOT EXISTS "targetCreatorUsername" TEXT;

ALTER TABLE "RouletteSpin" 
ADD COLUMN IF NOT EXISTS "discountPercent" INTEGER;

ALTER TABLE "RouletteSpin" 
ADD COLUMN IF NOT EXISTS "prizeRedeemed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "RouletteSpin" 
ADD COLUMN IF NOT EXISTS "redeemedAt" TIMESTAMP(3);

ALTER TABLE "RouletteSpin" 
ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- 3. Create index for finding unredeemed prizes
CREATE INDEX IF NOT EXISTS "RouletteSpin_prizeType_prizeRedeemed_idx" 
ON "RouletteSpin"("prizeType", "prizeRedeemed");

-- 4. Update existing spins to have correct prizeType based on prizeId
UPDATE "RouletteSpin" 
SET "prizeType" = 'RETRY', "prizeRedeemed" = true 
WHERE "prizeId" = 6 AND "prizeType" = 'POINTS';

-- Done! New prizes (id 8, 9, 10) will be created with correct prizeType from the app
