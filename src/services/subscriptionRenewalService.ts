/**
 * Subscription Renewal Service
 * 
 * Handles automatic subscription renewals:
 * 1. Find subscriptions expiring soon (within 24h)
 * 2. Send reminder emails
 * 3. Process renewals for subscriptions with autoRenew=true
 * 4. Expire subscriptions that are past endDate
 */

import prisma from '../lib/prisma'
import { createLogger } from '../lib/logger'
import { sendSubscriptionRenewalEmail, sendSubscriptionExpiredEmail, isEmailConfigured } from './emailService'
import { chargeCard, getDefaultCard, isOneclickConfigured } from './oneclick.service'

const logger = createLogger('SubscriptionRenewal')

interface RenewalResult {
  processed: number
  renewed: number
  expired: number
  reminded: number
  errors: string[]
}

/**
 * Process all subscription renewals and expirations
 * Should run daily (recommended: early morning)
 */
export async function processSubscriptionRenewals(): Promise<RenewalResult> {
  const result: RenewalResult = {
    processed: 0,
    renewed: 0,
    expired: 0,
    reminded: 0,
    errors: []
  }

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  try {
    // 1. Expire subscriptions that are past endDate
    const expiredSubs = await expireEndedSubscriptions(now)
    result.expired = expiredSubs.length

    // 2. Process auto-renewals for subscriptions expiring today
    const renewedSubs = await processAutoRenewals(now)
    result.renewed = renewedSubs.length

    // 3. Send reminder emails for subscriptions expiring tomorrow
    if (isEmailConfigured()) {
      const reminders = await sendExpirationReminders(tomorrow)
      result.reminded = reminders
    }

    result.processed = result.expired + result.renewed + result.reminded

    logger.info(
      `Subscription renewal job completed: ` +
      `${result.renewed} renewed, ${result.expired} expired, ${result.reminded} reminded`
    )
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    result.errors.push(errorMsg)
    logger.error('Error in subscription renewal job:', error)
  }

  return result
}

/**
 * Expire subscriptions that have passed their endDate
 * OPTIMIZED: Use batch updateMany + parallel email sending
 */
async function expireEndedSubscriptions(now: Date): Promise<string[]> {
  // Find active subscriptions with endDate in the past
  const subscriptionsToExpire = await prisma.subscription.findMany({
    where: {
      status: 'active',
      endDate: {
        lt: now
      },
      autoRenew: false // Only expire non-renewing subscriptions
    },
    include: {
      user: {
        select: { email: true, username: true }
      },
      creator: {
        include: {
          user: { select: { displayName: true } }
        }
      },
      tier: {
        select: { name: true }
      }
    }
  })

  if (subscriptionsToExpire.length === 0) {
    return []
  }

  const expiredIds = subscriptionsToExpire.map(sub => sub.id)

  // OPTIMIZED: Batch update all expired subscriptions at once
  await prisma.subscription.updateMany({
    where: { id: { in: expiredIds } },
    data: {
      status: 'expired',
      updatedAt: now
    }
  })

  // OPTIMIZED: Send expiration emails in parallel
  if (isEmailConfigured()) {
    await Promise.allSettled(
      subscriptionsToExpire.map(sub =>
        sendSubscriptionExpiredEmail(
          sub.user.email,
          sub.user.username,
          sub.creator.user.displayName,
          sub.tier.name
        ).catch(err => logger.error(`Failed to send expiration email for ${sub.id}: ${err.message}`))
      )
    )
  }

  logger.info(`Expired ${expiredIds.length} subscriptions`)
  return expiredIds
}

/**
 * Process auto-renewals for subscriptions expiring soon
 * Uses Oneclick to charge the user's saved card automatically
 */
async function processAutoRenewals(now: Date): Promise<string[]> {
  const renewedIds: string[] = []

  // Find subscriptions with autoRenew=true expiring in the next hour
  const nextHour = new Date(now.getTime() + 60 * 60 * 1000)
  
  const subscriptionsToRenew = await prisma.subscription.findMany({
    where: {
      status: 'active',
      autoRenew: true,
      endDate: {
        gte: now,
        lte: nextHour
      }
    },
    include: {
      tier: true,
      user: {
        select: { id: true, email: true, username: true }
      },
      creator: {
        include: {
          user: { select: { displayName: true, username: true } }
        }
      }
    }
  })

  for (const sub of subscriptionsToRenew) {
    try {
      // Calculate new end date based on tier duration
      const newEndDate = new Date(sub.endDate!)
      newEndDate.setDate(newEndDate.getDate() + sub.tier.durationDays)
      
      const amount = Math.round(sub.tier.price) // Oneclick requires integer amounts
      
      // Check if Oneclick is configured for real payments
      if (isOneclickConfigured()) {
        // Get the saved card for this subscription or user's default card
        let savedCardId = sub.savedCardId
        
        if (!savedCardId) {
          // Try to get user's default card
          const defaultCard = await getDefaultCard(sub.userId)
          if (defaultCard) {
            savedCardId = defaultCard.id
          }
        }
        
        if (!savedCardId) {
          logger.warn(`No saved card for subscription ${sub.id}, disabling auto-renew`)
          
          // Disable auto-renew since no card is available
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { autoRenew: false }
          })
          
          continue // Skip this subscription
        }
        
        // Generate buy order for this renewal
        const buyOrder = `RENEW_${sub.id}_${Date.now()}`
        
        // Charge the card
        const chargeResult = await chargeCard(savedCardId, amount, buyOrder, sub.id)
        
        if (!chargeResult.success) {
          logger.error(`Charge failed for subscription ${sub.id}: ${chargeResult.error}`)
          
          // Mark subscription as payment_failed instead of expiring immediately
          await prisma.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'payment_failed',
              updatedAt: now
            }
          })
          
          // TODO: Send payment failed email and allow retry
          continue // Skip to next subscription
        }
        
        logger.info(`Charged ${amount} CLP for subscription ${sub.id}, auth: ${chargeResult.authorizationCode}`)
      } else {
        // Oneclick not configured - log warning in production
        if (process.env.NODE_ENV === 'production') {
          logger.warn(`Oneclick not configured - subscription ${sub.id} extended without charging`)
        }
      }
      
      // Payment successful (or test mode) - extend the subscription
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          endDate: newEndDate,
          updatedAt: now
        }
      })

      renewedIds.push(sub.id)

      // Send renewal confirmation email
      if (isEmailConfigured()) {
        await sendSubscriptionRenewalEmail(
          sub.user.email,
          sub.user.username,
          sub.creator.user.displayName,
          sub.tier.name,
          sub.tier.price,
          newEndDate
        ).catch(err => logger.error(`Failed to send renewal email: ${err.message}`))
      }

      logger.info(
        `Subscription ${sub.id} renewed for user ${sub.userId}, ` +
        `new end date: ${newEndDate.toISOString()}`
      )
    } catch (error) {
      logger.error(`Failed to renew subscription ${sub.id}:`, error)
    }
  }

  return renewedIds
}

/**
 * Send reminder emails for subscriptions expiring soon
 */
async function sendExpirationReminders(expirationDate: Date): Promise<number> {
  let remindersSent = 0

  // Find subscriptions expiring within the next 24 hours that haven't been reminded
  const startOfDay = new Date(expirationDate)
  startOfDay.setHours(0, 0, 0, 0)
  
  const endOfDay = new Date(expirationDate)
  endOfDay.setHours(23, 59, 59, 999)

  const subscriptionsExpiringSoon = await prisma.subscription.findMany({
    where: {
      status: 'active',
      autoRenew: false, // Only remind those who won't auto-renew
      endDate: {
        gte: startOfDay,
        lte: endOfDay
      }
    },
    include: {
      user: {
        select: { email: true, username: true }
      },
      creator: {
        include: {
          user: { select: { displayName: true, username: true } }
        }
      },
      tier: {
        select: { name: true, price: true }
      }
    }
  })

  for (const sub of subscriptionsExpiringSoon) {
    try {
      // In a more complete implementation, we'd track if reminder was sent
      // For now, we just send it
      
      // TODO: Add a `reminderSentAt` field to Subscription model
      // to avoid sending duplicate reminders
      
      logger.info(`Would send reminder to ${sub.user.email} for subscription ${sub.id}`)
      remindersSent++
    } catch (error) {
      logger.error(`Failed to send reminder for subscription ${sub.id}:`, error)
    }
  }

  return remindersSent
}

/**
 * Get subscriptions expiring in the next N days
 * Useful for admin dashboard
 */
export async function getExpiringSubscriptions(days: number = 7) {
  const now = new Date()
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  return prisma.subscription.findMany({
    where: {
      status: 'active',
      endDate: {
        gte: now,
        lte: futureDate
      }
    },
    include: {
      user: {
        select: { id: true, username: true, email: true }
      },
      creator: {
        include: {
          user: { select: { displayName: true, username: true } }
        }
      },
      tier: {
        select: { name: true, price: true, durationDays: true }
      }
    },
    orderBy: {
      endDate: 'asc'
    }
  })
}

/**
 * Cancel a subscription (set autoRenew to false)
 */
export async function cancelSubscription(subscriptionId: string, userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      id: subscriptionId,
      userId: userId
    }
  })

  if (!subscription) {
    throw new Error('Subscription not found')
  }

  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      autoRenew: false,
      status: 'cancelled' // Keep access until endDate
    }
  })
}
