/**
 * Rutas de Payouts - API para creadores y admin
 */

import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { 
  calculatePayoutEligibility, 
  createPayout, 
  calculateAllPayouts,
  getPayoutsPendingRetry
} from '../services/payoutService';

const router = Router();

/**
 * GET /api/payouts/eligibility
 * Calcula elegibilidad de payout para el creador autenticado
 */
router.get('/eligibility', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Obtener el creador asociado al usuario
    const creator = await prisma.creator.findUnique({
      where: { userId }
    });

    if (!creator) {
      return res.status(404).json({ error: 'Perfil de creador no encontrado' });
    }

    const eligibility = await calculatePayoutEligibility(creator.id);

    res.json({
      canCreatePayout: eligibility.canCreatePayout,
      reason: eligibility.reason,
      totals: {
        grossTotal: eligibility.totals.grossTotal.toString(),
        platformFeeTotal: eligibility.totals.platformFeeTotal.toString(),
        creatorPayableTotal: eligibility.totals.creatorPayableTotal.toString()
      },
      eligibleTransactionsCount: eligibility.eligibleTransactions.length,
      pendingHoldCount: eligibility.holdNotReleasedCount
    });
  } catch (error) {
    console.error('[Payouts] Error calculating eligibility:', error);
    res.status(500).json({ error: 'Error calculando elegibilidad' });
  }
});

/**
 * POST /api/payouts/request
 * Solicita un nuevo payout (si es elegible)
 */
router.post('/request', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const creator = await prisma.creator.findUnique({
      where: { userId }
    });

    if (!creator) {
      return res.status(404).json({ error: 'Perfil de creador no encontrado' });
    }

    // Verificar que tenga cuenta bancaria registrada
    const bankAccount = await prisma.creatorBankAccount.findFirst({
      where: { creatorId: creator.id }
    });

    if (!bankAccount) {
      return res.status(400).json({ 
        error: 'Debes registrar una cuenta bancaria antes de solicitar payout',
        code: 'NO_BANK_ACCOUNT'
      });
    }

    const result = await createPayout(creator.id);

    if (!result.success) {
      return res.status(400).json({
        error: result.reason,
        code: 'NOT_ELIGIBLE'
      });
    }

    // Obtener el payout creado
    const payout = await prisma.payout.findUnique({
      where: { id: result.payoutId! },
      include: {
        _count: { select: { items: true } }
      }
    });

    res.status(201).json({
      message: 'Payout creado exitosamente',
      payout: {
        id: payout!.id,
        status: payout!.status,
        payoutAmount: payout!.payoutAmount.toString(),
        periodStart: payout!.periodStart,
        periodEnd: payout!.periodEnd,
        transactionsIncluded: payout!._count.items
      }
    });
  } catch (error) {
    console.error('[Payouts] Error creating payout:', error);
    res.status(500).json({ error: 'Error creando payout' });
  }
});

/**
 * GET /api/payouts/history
 * Historial de payouts del creador
 */
router.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const creator = await prisma.creator.findUnique({
      where: { userId }
    });

    if (!creator) {
      return res.status(404).json({ error: 'Perfil de creador no encontrado' });
    }

    const [payouts, total] = await Promise.all([
      prisma.payout.findMany({
        where: { creatorId: creator.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { items: true } }
        }
      }),
      prisma.payout.count({ where: { creatorId: creator.id } })
    ]);

    res.json({
      payouts: payouts.map(p => ({
        id: p.id,
        status: p.status,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        grossTotal: p.grossTotal.toString(),
        platformFeeTotal: p.platformFeeTotal.toString(),
        payoutAmount: p.payoutAmount.toString(),
        transactionsIncluded: p._count.items,
        sentAt: p.sentAt,
        failedAt: p.failedAt,
        failureReason: p.failureReason,
        createdAt: p.createdAt
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Payouts] Error fetching history:', error);
    res.status(500).json({ error: 'Error obteniendo historial' });
  }
});

/**
 * GET /api/payouts/:id
 * Detalle de un payout específico
 */
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const payoutId = req.params.id;

    const creator = await prisma.creator.findUnique({
      where: { userId }
    });

    if (!creator) {
      return res.status(404).json({ error: 'Perfil de creador no encontrado' });
    }

    const payout = await prisma.payout.findFirst({
      where: { 
        id: payoutId,
        creatorId: creator.id
      },
      include: {
        items: {
          include: {
            transaction: {
              select: {
                id: true,
                productType: true,
                grossAmount: true,
                platformFeeAmount: true,
                creatorPayableAmount: true,
                occurredAt: true
              }
            }
          }
        }
      }
    });

    if (!payout) {
      return res.status(404).json({ error: 'Payout no encontrado' });
    }

    res.json({
      id: payout.id,
      status: payout.status,
      periodStart: payout.periodStart,
      periodEnd: payout.periodEnd,
      currency: payout.currency,
      grossTotal: payout.grossTotal.toString(),
      platformFeeTotal: payout.platformFeeTotal.toString(),
      adjustmentsTotal: payout.adjustmentsTotal.toString(),
      payoutAmount: payout.payoutAmount.toString(),
      providerTransferId: payout.providerTransferId,
      sentAt: payout.sentAt,
      failedAt: payout.failedAt,
      failureReason: payout.failureReason,
      retryCount: payout.retryCount,
      createdAt: payout.createdAt,
      transactions: payout.items.map(item => ({
        id: item.transaction.id,
        productType: item.transaction.productType,
        grossAmount: item.transaction.grossAmount.toString(),
        platformFeeAmount: item.transaction.platformFeeAmount.toString(),
        creatorPayableAmount: item.transaction.creatorPayableAmount.toString(),
        occurredAt: item.transaction.occurredAt,
        itemAmount: item.amount.toString()
      }))
    });
  } catch (error) {
    console.error('[Payouts] Error fetching payout:', error);
    res.status(500).json({ error: 'Error obteniendo payout' });
  }
});

// ============ Rutas Admin (para uso interno/jobs) ============

/**
 * POST /api/payouts/admin/calculate-all
 * Trigger manual para calcular payouts de todos los creadores elegibles
 * En producción esto se llamaría desde un cron job
 */
router.post('/admin/calculate-all', async (req: Request, res: Response) => {
  // TODO: Agregar autenticación admin
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY && process.env.NODE_ENV !== 'development') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    console.log('[Admin] Iniciando cálculo de payouts para todos los creadores...');
    const result = await calculateAllPayouts();
    
    res.json({
      message: 'Cálculo de payouts completado',
      created: result.created,
      skipped: result.skipped,
      errors: result.errors
    });
  } catch (error) {
    console.error('[Admin] Error calculating all payouts:', error);
    res.status(500).json({ error: 'Error calculando payouts' });
  }
});

/**
 * GET /api/payouts/admin/pending-retry
 * Lista payouts que fallaron y están pendientes de reintento
 */
router.get('/admin/pending-retry', async (req: Request, res: Response) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY && process.env.NODE_ENV !== 'development') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const pendingRetry = await getPayoutsPendingRetry();

    res.json({
      count: pendingRetry.length,
      payouts: pendingRetry.map(p => ({
        id: p.id,
        creatorId: p.creatorId,
        payoutAmount: p.payoutAmount.toString(),
        retryCount: p.retryCount
      }))
    });
  } catch (error) {
    console.error('[Admin] Error fetching pending retry:', error);
    res.status(500).json({ error: 'Error obteniendo payouts pendientes' });
  }
});

export default router;
