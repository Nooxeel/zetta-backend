/**
 * Balance Routes - API para balance y transacciones del creador
 */

import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getCreatorBalance } from '../services/ledgerService';
import { getCreatorTransactions, getCreatorTransactionStats } from '../services/transactionService';
import { getActiveFeeSchedule } from '../services/feeScheduleService';

const router = Router();

/**
 * GET /api/creator/balance
 * Obtiene el balance actual del creador autenticado
 */
router.get('/balance', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;

    // Verificar que es creador
    const creator = await prisma.creator.findUnique({
      where: { userId }
    });

    if (!creator) {
      return res.status(403).json({ error: 'No eres un creador' });
    }

    // Obtener balance y configuración
    const [balance, feeSchedule] = await Promise.all([
      getCreatorBalance(creator.id),
      getActiveFeeSchedule()
    ]);

    // Calcular cuánto está disponible (hold liberado)
    const holdReleaseDate = new Date();
    holdReleaseDate.setDate(holdReleaseDate.getDate() - feeSchedule.holdDays);

    const availableTransactions = await prisma.transaction.aggregate({
      where: {
        creatorId: creator.id,
        status: 'SUCCEEDED',
        occurredAt: { lte: holdReleaseDate },
        payoutItems: { none: {} } // No incluido en ningún payout
      },
      _sum: { creatorPayableAmount: true }
    });

    const pendingTransactions = await prisma.transaction.aggregate({
      where: {
        creatorId: creator.id,
        status: 'SUCCEEDED',
        occurredAt: { gt: holdReleaseDate },
        payoutItems: { none: {} }
      },
      _sum: { creatorPayableAmount: true }
    });

    res.json({
      balance: {
        total: balance.payable.toString(),
        available: (availableTransactions._sum.creatorPayableAmount || 0n).toString(),
        pending: (pendingTransactions._sum.creatorPayableAmount || 0n).toString(),
        paid: balance.paid.toString()
      },
      config: {
        holdDays: feeSchedule.holdDays,
        minPayout: feeSchedule.minPayoutClp.toString(),
        payoutFrequency: feeSchedule.payoutFrequency
      },
      tier: creator.tier,
      tierEffectiveFrom: creator.tierEffectiveFrom
    });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ error: 'Error al obtener balance' });
  }
});

/**
 * GET /api/creator/transactions
 * Lista las transacciones del creador
 */
router.get('/transactions', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;
    const { limit = '50', offset = '0', status } = req.query;

    const creator = await prisma.creator.findUnique({
      where: { userId }
    });

    if (!creator) {
      return res.status(403).json({ error: 'No eres un creador' });
    }

    const transactions = await getCreatorTransactions(creator.id, {
      limit: Math.min(parseInt(limit as string), 100),
      offset: parseInt(offset as string),
      status: status as any
    });

    // Convertir BigInt a string para JSON
    const serialized = transactions.map(t => ({
      ...t,
      grossAmount: t.grossAmount.toString(),
      platformFeeAmount: t.platformFeeAmount.toString(),
      creatorPayableAmount: t.creatorPayableAmount.toString()
    }));

    res.json(serialized);
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ error: 'Error al obtener transacciones' });
  }
});

/**
 * GET /api/creator/transactions/stats
 * Estadísticas de transacciones del creador
 */
router.get('/transactions/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;

    const creator = await prisma.creator.findUnique({
      where: { userId }
    });

    if (!creator) {
      return res.status(403).json({ error: 'No eres un creador' });
    }

    const stats = await getCreatorTransactionStats(creator.id);

    res.json({
      totalTransactions: stats.totalTransactions,
      totalGross: stats.totalGross.toString(),
      totalFees: stats.totalFees.toString(),
      totalPayable: stats.totalPayable.toString(),
      byType: stats.byType.map(t => ({
        type: t.type,
        count: t.count,
        total: t.total.toString()
      }))
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

/**
 * GET /api/creator/payouts
 * Lista los pagos realizados al creador
 */
router.get('/payouts', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;

    const creator = await prisma.creator.findUnique({
      where: { userId }
    });

    if (!creator) {
      return res.status(403).json({ error: 'No eres un creador' });
    }

    const payouts = await prisma.payout.findMany({
      where: { creatorId: creator.id },
      orderBy: { periodEnd: 'desc' },
      take: 50,
      include: {
        _count: { select: { items: true } }
      }
    });

    const serialized = payouts.map(p => ({
      id: p.id,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      grossTotal: p.grossTotal.toString(),
      platformFeeTotal: p.platformFeeTotal.toString(),
      adjustmentsTotal: p.adjustmentsTotal.toString(),
      payoutAmount: p.payoutAmount.toString(),
      status: p.status,
      sentAt: p.sentAt,
      transactionCount: p._count.items
    }));

    res.json(serialized);
  } catch (error) {
    console.error('Error getting payouts:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

/**
 * GET /api/creator/fee-info
 * Información de tarifas y tier del creador
 */
router.get('/fee-info', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthRequest).userId;

    const creator = await prisma.creator.findUnique({
      where: { userId },
      include: {
        tierHistory: {
          orderBy: { effectiveFrom: 'desc' },
          take: 5
        }
      }
    });

    if (!creator) {
      return res.status(403).json({ error: 'No eres un creador' });
    }

    const feeSchedule = await getActiveFeeSchedule();
    const currentFeeBps = creator.tier === 'VIP' 
      ? feeSchedule.vipFeeBps 
      : feeSchedule.standardFeeBps;

    res.json({
      tier: creator.tier,
      tierEffectiveFrom: creator.tierEffectiveFrom,
      currentFeeBps,
      currentFeePercent: `${currentFeeBps / 100}%`,
      feeSchedule: {
        standardFeeBps: feeSchedule.standardFeeBps,
        vipFeeBps: feeSchedule.vipFeeBps,
        holdDays: feeSchedule.holdDays,
        minPayout: feeSchedule.minPayoutClp.toString(),
        payoutFrequency: feeSchedule.payoutFrequency
      },
      tierHistory: creator.tierHistory.map(h => ({
        previousTier: h.previousTier,
        newTier: h.newTier,
        reason: h.reason,
        effectiveFrom: h.effectiveFrom
      }))
    });
  } catch (error) {
    console.error('Error getting fee info:', error);
    res.status(500).json({ error: 'Error al obtener información de tarifas' });
  }
});

export default router;
