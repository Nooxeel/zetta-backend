-- Migration: Add age verification fields to User table
-- Run this on production database

-- Add birthdate column
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthdate" TIMESTAMP(3);

-- Add ageVerified column with default false
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ageVerified" BOOLEAN NOT NULL DEFAULT false;

-- Add ageVerifiedAt column
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ageVerifiedAt" TIMESTAMP(3);

-- Add ageVerificationIp column for audit
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ageVerificationIp" TEXT;

-- Add referralCode column if not exists
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;

-- Create index on referralCode for faster lookups
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");
