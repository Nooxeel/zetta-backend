/**
 * Referral Commission Service
 * 
 * Handles referral commission processing when referred users make payments.
 * Commission is 5% of the platform's fee (not from creator's earnings).
 * Commission period: 90 days from signup.
 */

import { PrismaClient } from '@prisma/client'

// Commission configuration
const REFERRAL_COMMISSION_RATE = 0.05 // 5%
const COMMISSION_DURATION_DAYS = 90 // 3 months

interface ProcessReferralResult {
  processed: boolean
  referralId?: string
  commissionAmount?: number
  referrerId?: string
  reason?: string
}

/**
 * Process referral commission when a user makes a payment
 * The commission comes from the PLATFORM's fee, not the creator's earnings
 * 
 * @param tx - Prisma transaction client
 * @param payingUserId - User who made the payment
 * @param platformFeeAmount - The platform fee from the transaction (BigInt)
 * @param sourceType - Type of transaction ('subscription' | 'donation' | 'product')
 * @param sourceId - ID of the source transaction
 */
export async function processReferralCommission(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  payingUserId: string,
  platformFeeAmount: bigint,
  sourceType: 'subscription' | 'donation' | 'product',
  sourceId: string
): Promise<ProcessReferralResult> {
  try {
    // 1. Check if this user was referred
    const referral = await tx.referral.findUnique({
      where: { referredId: payingUserId }
    })

    if (!referral) {
      return { processed: false, reason: 'User was not referred' }
    }

    // 2. Check if referral is still active (within commission period)
    const now = new Date()
    if (referral.status === 'EXPIRED' || referral.status === 'CANCELLED') {
      return { processed: false, reason: `Referral status is ${referral.status}` }
    }

    if (referral.commissionEndDate < now) {
      // Mark as expired if past end date
      await tx.referral.update({
        where: { id: referral.id },
        data: { status: 'EXPIRED' }
      })
      return { processed: false, reason: 'Commission period has expired' }
    }

    // 3. Calculate commission (5% of platform fee)
    // Commission comes from platform's share, not creator's
    const commissionAmount = Number(platformFeeAmount) * REFERRAL_COMMISSION_RATE
    
    if (commissionAmount < 1) {
      return { processed: false, reason: 'Commission amount too small' }
    }

    // 4. If this is first purchase, mark referral as ACTIVE
    const isFirstPurchase = referral.status === 'PENDING'

    // 5. Create commission record and update referral
    await tx.referralCommission.create({
      data: {
        referralId: referral.id,
        amount: commissionAmount,
        sourceType,
        sourceId
      }
    })

    // 6. Update referral totals and status
    await tx.referral.update({
      where: { id: referral.id },
      data: {
        totalEarned: { increment: commissionAmount },
        ...(isFirstPurchase ? {
          status: 'ACTIVE',
          convertedAt: now
        } : {})
      }
    })

    console.log(`[Referral] Commission processed: $${commissionAmount} CLP for referrer ${referral.referrerId}`)
    console.log(`[Referral] Source: ${sourceType} (${sourceId})`)

    return {
      processed: true,
      referralId: referral.id,
      commissionAmount,
      referrerId: referral.referrerId
    }
  } catch (error) {
    console.error('[Referral] Error processing commission:', error)
    return { processed: false, reason: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Create a referral relationship when a new user signs up with a referral code
 * 
 * @param tx - Prisma transaction client (or regular prisma client)
 * @param newUserId - The newly registered user's ID
 * @param referralCode - The referral code used during signup
 */
export async function applyReferralOnSignup(
  prisma: PrismaClient,
  newUserId: string,
  referralCode: string
): Promise<{ success: boolean; referrerId?: string; error?: string }> {
  try {
    // Find the referrer by code
    const referrer = await prisma.user.findFirst({
      where: { referralCode: referralCode.toUpperCase() }
    })

    if (!referrer) {
      return { success: false, error: 'Invalid referral code' }
    }

    // Can't refer yourself
    if (referrer.id === newUserId) {
      return { success: false, error: 'Cannot use own referral code' }
    }

    // Check if already referred (shouldn't happen for new users but just in case)
    const existingReferral = await prisma.referral.findUnique({
      where: { referredId: newUserId }
    })

    if (existingReferral) {
      return { success: false, error: 'User already has a referral' }
    }

    // Calculate commission end date
    const commissionEndDate = new Date()
    commissionEndDate.setDate(commissionEndDate.getDate() + COMMISSION_DURATION_DAYS)

    // Create referral
    await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredId: newUserId,
        code: referralCode.toUpperCase(),
        commissionRate: REFERRAL_COMMISSION_RATE,
        commissionEndDate,
        status: 'PENDING' // Will become ACTIVE on first purchase
      }
    })

    console.log(`[Referral] New referral created: ${newUserId} referred by ${referrer.id}`)

    return { success: true, referrerId: referrer.id }
  } catch (error) {
    console.error('[Referral] Error applying referral on signup:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export const REFERRAL_CONFIG = {
  commissionRate: REFERRAL_COMMISSION_RATE,
  durationDays: COMMISSION_DURATION_DAYS
}
