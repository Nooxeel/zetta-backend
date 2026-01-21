import { Router, Request, Response } from 'express'
import { authenticate, getUser } from '../middleware/auth'
import prisma from '../lib/prisma'
import { createLogger } from '../lib/logger'

const router = Router()
const logger = createLogger('Transactions')

// All routes require authentication
router.use(authenticate)

/**
 * Transaction types for display
 */
type TransactionType = 
  | 'subscription_payment'  // Fan paid for subscription
  | 'subscription_income'   // Creator received subscription
  | 'donation_sent'         // Fan sent donation
  | 'donation_received'     // Creator received donation
  | 'ppv_purchase'          // Fan bought PPV content
  | 'ppv_income'            // Creator sold PPV content
  | 'tip_sent'              // Fan sent tip
  | 'tip_received'          // Creator received tip
  | 'payout'                // Creator withdrew funds
  | 'refund'                // Refund issued

interface TransactionItem {
  id: string
  type: TransactionType
  amount: number           // Always positive, direction determined by type
  currency: string
  description: string
  status: string
  createdAt: Date
  // Related entity info
  counterparty?: {         // The other party in the transaction
    id: string
    username: string
    displayName: string
    avatar?: string | null
  }
  // For PPV purchases
  post?: {
    id: string
    title: string | null
  }
  // For subscriptions
  tier?: {
    id: string
    name: string
  }
  // Platform fees (for creators)
  platformFee?: number
  netAmount?: number       // Amount after fees (for creators)
}

/**
 * GET /transactions/history
 * Get transaction history for the current user
 * For fans: only outgoing (payments made)
 * For creators: both incoming and outgoing
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).userId
    const { 
      type,         // Filter by type: 'incoming', 'outgoing', 'all'
      limit = '20',
      offset = '0',
      startDate,
      endDate 
    } = req.query

    // Get user info to determine if creator
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { creatorProfile: true }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const isCreator = !!user.creatorProfile
    const creatorId = user.creatorProfile?.id
    const transactions: TransactionItem[] = []

    // Date filters
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (startDate) dateFilter.gte = new Date(startDate as string)
    if (endDate) dateFilter.lte = new Date(endDate as string)
    const hasDateFilter = Object.keys(dateFilter).length > 0

    // Determine which types to fetch
    const showIncoming = type === 'incoming' || type === 'all' || !type
    const showOutgoing = type === 'outgoing' || type === 'all' || !type

    // ==================== OUTGOING TRANSACTIONS (All users) ====================
    if (showOutgoing) {
      // 1. Webpay transactions (subscriptions, donations, PPV, tips)
      const webpayTxs = await prisma.webpayTransaction.findMany({
        where: {
          userId,
          status: 'AUTHORIZED',
          ...(hasDateFilter && { completedAt: dateFilter })
        },
        orderBy: { completedAt: 'desc' },
        take: parseInt(limit as string),
      })

      // Get creator info for each transaction
      const creatorIds = webpayTxs.map(tx => tx.creatorId).filter(Boolean) as string[]
      const creators = await prisma.creator.findMany({
        where: { id: { in: creatorIds } },
        include: { user: { select: { id: true, username: true, displayName: true, avatar: true } } }
      })
      const creatorMap = new Map(creators.map(c => [c.id, c]))

      // Get tier info for subscription transactions
      const tierIds = webpayTxs.map(tx => tx.subscriptionTierId).filter(Boolean) as string[]
      const tiers = await prisma.subscriptionTier.findMany({
        where: { id: { in: tierIds } }
      })
      const tierMap = new Map(tiers.map(t => [t.id, t]))

      // Get post info for PPV transactions
      const postIds = webpayTxs.map(tx => tx.postId).filter(Boolean) as string[]
      const posts = await prisma.post.findMany({
        where: { id: { in: postIds } }
      })
      const postMap = new Map(posts.map(p => [p.id, p]))

      for (const tx of webpayTxs) {
        const creator = tx.creatorId ? creatorMap.get(tx.creatorId) : null
        const tier = tx.subscriptionTierId ? tierMap.get(tx.subscriptionTierId) : null
        const post = tx.postId ? postMap.get(tx.postId) : null

        let txType: TransactionType
        let description: string

        switch (tx.paymentType) {
          case 'SUBSCRIPTION':
            txType = 'subscription_payment'
            description = `Suscripción ${tier?.name || ''} a @${creator?.user?.username || 'creador'}`
            break
          case 'DONATION':
            txType = 'donation_sent'
            description = `Donación a @${creator?.user?.username || 'creador'}`
            break
          case 'TIP':
            txType = 'tip_sent'
            description = `Propina a @${creator?.user?.username || 'creador'}`
            break
          case 'CONTENT':
            txType = 'ppv_purchase'
            description = `Compra de contenido: ${post?.title || 'Post'}`
            break
          default:
            txType = 'donation_sent'
            description = 'Transacción'
        }

        transactions.push({
          id: tx.id,
          type: txType,
          amount: tx.amount,
          currency: 'CLP',
          description,
          status: tx.status,
          createdAt: tx.completedAt || tx.createdAt,
          counterparty: creator?.user ? {
            id: creator.user.id,
            username: creator.user.username,
            displayName: creator.user.displayName,
            avatar: creator.user.avatar
          } : undefined,
          tier: tier ? { id: tier.id, name: tier.name } : undefined,
          post: post ? { id: post.id, title: post.title } : undefined
        })
      }
    }

    // ==================== INCOMING TRANSACTIONS (Creators only) ====================
    if (isCreator && creatorId && showIncoming) {
      // 1. Subscription income - from Transaction model or Webpay
      const subscriptionIncome = await prisma.webpayTransaction.findMany({
        where: {
          creatorId,
          status: 'AUTHORIZED',
          paymentType: 'SUBSCRIPTION',
          ...(hasDateFilter && { completedAt: dateFilter })
        },
        orderBy: { completedAt: 'desc' },
        take: parseInt(limit as string),
      })

      // Get subscriber info
      const subscriberIds = subscriptionIncome.map(tx => tx.userId)
      const subscribers = await prisma.user.findMany({
        where: { id: { in: subscriberIds } },
        select: { id: true, username: true, displayName: true, avatar: true }
      })
      const subscriberMap = new Map(subscribers.map(u => [u.id, u]))

      // Get tier info
      const tierIds = subscriptionIncome.map(tx => tx.subscriptionTierId).filter(Boolean) as string[]
      const tiers = await prisma.subscriptionTier.findMany({
        where: { id: { in: tierIds } }
      })
      const tierMap = new Map(tiers.map(t => [t.id, t]))

      for (const tx of subscriptionIncome) {
        const subscriber = subscriberMap.get(tx.userId)
        const tier = tx.subscriptionTierId ? tierMap.get(tx.subscriptionTierId) : null
        const platformFee = Math.round(tx.amount * 0.15) // 15% fee
        const netAmount = tx.amount - platformFee

        transactions.push({
          id: `sub-in-${tx.id}`,
          type: 'subscription_income',
          amount: tx.amount,
          currency: 'CLP',
          description: `Suscripción de @${subscriber?.username || 'fan'}`,
          status: 'completed',
          createdAt: tx.completedAt || tx.createdAt,
          counterparty: subscriber ? {
            id: subscriber.id,
            username: subscriber.username,
            displayName: subscriber.displayName,
            avatar: subscriber.avatar
          } : undefined,
          tier: tier ? { id: tier.id, name: tier.name } : undefined,
          platformFee,
          netAmount
        })
      }

      // 2. Donations received
      const donations = await prisma.donation.findMany({
        where: {
          toCreatorId: creatorId,
          status: 'completed',
          ...(hasDateFilter && { createdAt: dateFilter })
        },
        include: {
          fromUser: { select: { id: true, username: true, displayName: true, avatar: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
      })

      for (const donation of donations) {
        transactions.push({
          id: donation.id,
          type: 'donation_received',
          amount: donation.amount,
          currency: donation.currency,
          description: donation.isAnonymous 
            ? 'Donación anónima' 
            : `Donación de @${donation.fromUser.username}`,
          status: donation.status,
          createdAt: donation.createdAt,
          counterparty: donation.isAnonymous ? undefined : {
            id: donation.fromUser.id,
            username: donation.fromUser.username,
            displayName: donation.fromUser.displayName,
            avatar: donation.fromUser.avatar
          },
          platformFee: donation.platformFee,
          netAmount: donation.creatorEarnings
        })
      }

      // 3. PPV content sales
      const ppvSales = await prisma.contentPurchase.findMany({
        where: {
          post: { creatorId },
          status: 'completed',
          ...(hasDateFilter && { createdAt: dateFilter })
        },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatar: true } },
          post: { select: { id: true, title: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
      })

      for (const sale of ppvSales) {
        transactions.push({
          id: sale.id,
          type: 'ppv_income',
          amount: sale.amount,
          currency: sale.currency,
          description: `Venta de: ${sale.post.title || 'Contenido PPV'}`,
          status: sale.status,
          createdAt: sale.createdAt,
          counterparty: {
            id: sale.user.id,
            username: sale.user.username,
            displayName: sale.user.displayName,
            avatar: sale.user.avatar
          },
          post: { id: sale.post.id, title: sale.post.title },
          platformFee: sale.platformFee,
          netAmount: sale.creatorEarnings
        })
      }

      // 4. Tips received (from Webpay TIP transactions)
      const tips = await prisma.webpayTransaction.findMany({
        where: {
          creatorId,
          status: 'AUTHORIZED',
          paymentType: 'TIP',
          ...(hasDateFilter && { completedAt: dateFilter })
        },
        orderBy: { completedAt: 'desc' },
        take: parseInt(limit as string),
      })

      const tipperIds = tips.map(t => t.userId)
      const tippers = await prisma.user.findMany({
        where: { id: { in: tipperIds } },
        select: { id: true, username: true, displayName: true, avatar: true }
      })
      const tipperMap = new Map(tippers.map(u => [u.id, u]))

      for (const tip of tips) {
        const tipper = tipperMap.get(tip.userId)
        const platformFee = Math.round(tip.amount * 0.15)
        const netAmount = tip.amount - platformFee

        transactions.push({
          id: `tip-in-${tip.id}`,
          type: 'tip_received',
          amount: tip.amount,
          currency: 'CLP',
          description: `Propina de @${tipper?.username || 'fan'}`,
          status: 'completed',
          createdAt: tip.completedAt || tip.createdAt,
          counterparty: tipper ? {
            id: tipper.id,
            username: tipper.username,
            displayName: tipper.displayName,
            avatar: tipper.avatar
          } : undefined,
          platformFee,
          netAmount
        })
      }

      // 5. Payouts (money withdrawn)
      const payouts = await prisma.payout.findMany({
        where: {
          creatorId,
          ...(hasDateFilter && { createdAt: dateFilter })
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
      })

      for (const payout of payouts) {
        transactions.push({
          id: payout.id,
          type: 'payout',
          amount: Number(payout.payoutAmount),
          currency: payout.currency,
          description: `Retiro a cuenta bancaria`,
          status: payout.status,
          createdAt: payout.createdAt,
        })
      }
    }

    // Sort all transactions by date descending
    transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Apply pagination
    const paginatedTransactions = transactions.slice(
      parseInt(offset as string),
      parseInt(offset as string) + parseInt(limit as string)
    )

    res.json({
      transactions: paginatedTransactions,
      total: transactions.length,
      hasMore: transactions.length > parseInt(offset as string) + parseInt(limit as string),
      isCreator
    })
  } catch (error) {
    logger.error('Error fetching transaction history:', error)
    res.status(500).json({ error: 'Failed to fetch transaction history' })
  }
})

/**
 * GET /transactions/summary
 * Get transaction summary (totals) for the current user
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).userId
    const { period = '30' } = req.query // days

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { creatorProfile: true }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const isCreator = !!user.creatorProfile
    const creatorId = user.creatorProfile?.id
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - parseInt(period as string))

    // Outgoing totals (all users)
    const outgoingWebpay = await prisma.webpayTransaction.aggregate({
      where: {
        userId,
        status: 'AUTHORIZED',
        completedAt: { gte: periodStart }
      },
      _sum: { amount: true },
      _count: true
    })

    const summary: any = {
      period: parseInt(period as string),
      outgoing: {
        total: outgoingWebpay._sum.amount || 0,
        count: outgoingWebpay._count
      }
    }

    // Incoming totals (creators only)
    if (isCreator && creatorId) {
      // Subscription income
      const subIncome = await prisma.webpayTransaction.aggregate({
        where: {
          creatorId,
          status: 'AUTHORIZED',
          paymentType: 'SUBSCRIPTION',
          completedAt: { gte: periodStart }
        },
        _sum: { amount: true }
      })

      // Donation income
      const donationIncome = await prisma.donation.aggregate({
        where: {
          toCreatorId: creatorId,
          status: 'completed',
          createdAt: { gte: periodStart }
        },
        _sum: { creatorEarnings: true }
      })

      // PPV income
      const ppvIncome = await prisma.contentPurchase.aggregate({
        where: {
          post: { creatorId },
          status: 'completed',
          createdAt: { gte: periodStart }
        },
        _sum: { creatorEarnings: true }
      })

      // Tips income
      const tipIncome = await prisma.webpayTransaction.aggregate({
        where: {
          creatorId,
          status: 'AUTHORIZED',
          paymentType: 'TIP',
          completedAt: { gte: periodStart }
        },
        _sum: { amount: true }
      })

      const grossIncoming = 
        (subIncome._sum.amount || 0) +
        (donationIncome._sum.creatorEarnings || 0) +
        (ppvIncome._sum.creatorEarnings || 0) +
        (tipIncome._sum.amount || 0) * 0.85 // After 15% fee

      summary.incoming = {
        gross: grossIncoming,
        subscriptions: subIncome._sum.amount || 0,
        donations: donationIncome._sum.creatorEarnings || 0,
        ppv: ppvIncome._sum.creatorEarnings || 0,
        tips: Math.round((tipIncome._sum.amount || 0) * 0.85)
      }
    }

    res.json(summary)
  } catch (error) {
    logger.error('Error fetching transaction summary:', error)
    res.status(500).json({ error: 'Failed to fetch summary' })
  }
})

export default router
