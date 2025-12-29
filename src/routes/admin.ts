/**
 * Rutas Admin para gestión del sistema de pagos
 * 
 * Estas rutas son para uso interno/operaciones
 * Protegidas por X-Admin-Key header
 */

import { Router, Request, Response } from 'express';
import {
  createPublisher,
  processOutboxEvents,
  getOutboxStats,
  cleanupPublishedEvents,
  retryFailedEvents
} from '../services/outboxPublisher';
import { calculateAllPayouts, getPayoutsPendingRetry } from '../services/payoutService';
import { getPendingChargebacks, getChargebackStats } from '../services/chargebackService';
import { runJobManually, getSchedulerStatus } from '../jobs/scheduler';
import prisma from '../lib/prisma';

const router = Router();

// Middleware de autenticación admin
const adminAuth = (req: Request, res: Response, next: Function) => {
  const adminKey = req.headers['x-admin-key'];
  const nodeEnv = process.env.NODE_ENV;
  
  // En desarrollo permitir sin key (o si no hay ADMIN_KEY configurado)
  if (nodeEnv === 'development' || !process.env.ADMIN_KEY) {
    return next();
  }
  
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  
  next();
};

router.use(adminAuth);

// ===================== OUTBOX =====================

/**
 * GET /api/admin/outbox/stats
 * Estadísticas del outbox
 */
router.get('/outbox/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getOutboxStats();
    res.json(stats);
  } catch (error: any) {
    console.error('[Admin] Error getting outbox stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/outbox/process
 * Procesar eventos pendientes
 */
router.post('/outbox/process', async (req: Request, res: Response) => {
  try {
    const batchSize = req.body?.batchSize || 100;
    
    const publisherType = (process.env.OUTBOX_PUBLISHER_TYPE || 'console') as 'console' | 'webhook';
    const publisher = createPublisher({
      type: publisherType,
      webhookUrl: process.env.OUTBOX_WEBHOOK_URL,
      webhookSecret: process.env.OUTBOX_WEBHOOK_SECRET
    });

    const result = await processOutboxEvents(publisher, { batchSize });
    
    res.json({
      message: 'Procesamiento completado',
      ...result
    });
  } catch (error: any) {
    console.error('[Admin] Error processing outbox:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/outbox/retry-failed
 * Reintentar eventos fallidos
 */
router.post('/outbox/retry-failed', async (req: Request, res: Response) => {
  try {
    const count = await retryFailedEvents();
    res.json({
      message: `${count} eventos reseteados para reintento`
    });
  } catch (error: any) {
    console.error('[Admin] Error retrying failed events:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/outbox/cleanup
 * Limpiar eventos antiguos
 */
router.post('/outbox/cleanup', async (req: Request, res: Response) => {
  try {
    const olderThanDays = req.body?.olderThanDays || 30;
    const count = await cleanupPublishedEvents(olderThanDays);
    res.json({
      message: `${count} eventos limpiados`
    });
  } catch (error: any) {
    console.error('[Admin] Error cleaning up outbox:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/outbox/events
 * Listar eventos del outbox
 */
router.get('/outbox/events', async (req: Request, res: Response) => {
  try {
    const {
      status = 'pending', // 'pending' | 'published' | 'failed' | 'all'
      limit = '50',
      offset = '0'
    } = req.query;

    let where = {};
    switch (status) {
      case 'pending':
        where = { publishedAt: null, retryCount: { lt: 5 } };
        break;
      case 'published':
        where = { publishedAt: { not: null } };
        break;
      case 'failed':
        where = { publishedAt: null, retryCount: { gte: 5 } };
        break;
    }

    const events = await prisma.outboxEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string)
    });

    res.json({
      events: events.map(e => ({
        id: e.id,
        aggregateType: e.aggregateType,
        aggregateId: e.aggregateId,
        eventType: e.eventType,
        retryCount: e.retryCount,
        lastError: e.lastError,
        createdAt: e.createdAt,
        publishedAt: e.publishedAt
      })),
      count: events.length
    });
  } catch (error: any) {
    console.error('[Admin] Error listing outbox events:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== PAYOUTS =====================

/**
 * POST /api/admin/payouts/calculate-all
 * Calcular payouts para todos los creadores elegibles
 */
router.post('/payouts/calculate-all', async (req: Request, res: Response) => {
  try {
    console.log('[Admin] Iniciando cálculo de payouts...');
    const result = await calculateAllPayouts();
    res.json({
      message: 'Cálculo completado',
      ...result
    });
  } catch (error: any) {
    console.error('[Admin] Error calculating payouts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/payouts/pending-retry
 * Payouts pendientes de reintento
 */
router.get('/payouts/pending-retry', async (req: Request, res: Response) => {
  try {
    const payouts = await getPayoutsPendingRetry();
    res.json({
      count: payouts.length,
      payouts: payouts.map(p => ({
        id: p.id,
        creatorId: p.creatorId,
        payoutAmount: p.payoutAmount.toString(),
        retryCount: p.retryCount
      }))
    });
  } catch (error: any) {
    console.error('[Admin] Error getting pending retry payouts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/payouts/list
 * Lista todos los payouts
 */
router.get('/payouts/list', async (req: Request, res: Response) => {
  try {
    const {
      status,
      limit = '50',
      offset = '0'
    } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const payouts = await prisma.payout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      include: {
        creator: {
          include: {
            user: {
              select: { username: true, email: true }
            }
          }
        },
        _count: { select: { items: true } }
      }
    });

    res.json({
      payouts: payouts.map(p => ({
        id: p.id,
        creatorId: p.creatorId,
        creatorUsername: p.creator.user.username,
        status: p.status,
        payoutAmount: p.payoutAmount.toString(),
        transactionsCount: p._count.items,
        sentAt: p.sentAt,
        failedAt: p.failedAt,
        failureReason: p.failureReason,
        createdAt: p.createdAt
      })),
      count: payouts.length
    });
  } catch (error: any) {
    console.error('[Admin] Error listing payouts:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== CHARGEBACKS =====================

/**
 * GET /api/admin/chargebacks/pending
 * Chargebacks pendientes
 */
router.get('/chargebacks/pending', async (req: Request, res: Response) => {
  try {
    const chargebacks = await getPendingChargebacks();
    res.json({
      count: chargebacks.length,
      chargebacks: chargebacks.map(cb => ({
        id: cb.id,
        transactionId: cb.transactionId,
        creatorId: cb.creatorId,
        amount: cb.amount.toString(),
        createdAt: cb.createdAt
      }))
    });
  } catch (error: any) {
    console.error('[Admin] Error getting pending chargebacks:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== DASHBOARD =====================

/**
 * GET /api/admin/dashboard
 * Dashboard general del sistema de pagos
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const [
      outboxStats,
      totalTransactions,
      totalPayouts,
      totalChargebacks,
      recentTransactions
    ] = await Promise.all([
      getOutboxStats(),
      prisma.transaction.aggregate({
        _sum: { grossAmount: true, platformFeeAmount: true, creatorPayableAmount: true },
        _count: true
      }),
      prisma.payout.aggregate({
        _sum: { payoutAmount: true },
        _count: true,
        where: { status: 'SENT' }
      }),
      prisma.chargeback.aggregate({
        _sum: { amount: true },
        _count: true
      }),
      prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          productType: true,
          grossAmount: true,
          status: true,
          createdAt: true
        }
      })
    ]);

    res.json({
      outbox: outboxStats,
      transactions: {
        count: totalTransactions._count,
        grossTotal: totalTransactions._sum.grossAmount?.toString() || '0',
        platformFeeTotal: totalTransactions._sum.platformFeeAmount?.toString() || '0',
        creatorPayableTotal: totalTransactions._sum.creatorPayableAmount?.toString() || '0'
      },
      payouts: {
        sentCount: totalPayouts._count,
        sentTotal: totalPayouts._sum.payoutAmount?.toString() || '0'
      },
      chargebacks: {
        count: totalChargebacks._count,
        total: totalChargebacks._sum.amount?.toString() || '0'
      },
      recentTransactions: recentTransactions.map(t => ({
        id: t.id,
        productType: t.productType,
        grossAmount: t.grossAmount.toString(),
        status: t.status,
        createdAt: t.createdAt
      }))
    });
  } catch (error: any) {
    console.error('[Admin] Error getting dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== JOBS =====================

/**
 * GET /api/admin/jobs/status
 * Estado del scheduler
 */
router.get('/jobs/status', async (req: Request, res: Response) => {
  try {
    const status = getSchedulerStatus();
    res.json(status);
  } catch (error: any) {
    console.error('[Admin] Error getting jobs status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/jobs/run/:jobName
 * Ejecutar un job manualmente
 */
router.post('/jobs/run/:jobName', async (req: Request, res: Response) => {
  try {
    const { jobName } = req.params;
    
    console.log(`[Admin] Ejecutando job manual: ${jobName}`);
    await runJobManually(jobName);
    
    res.json({
      message: `Job '${jobName}' ejecutado exitosamente`
    });
  } catch (error: any) {
    console.error('[Admin] Error running job:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
