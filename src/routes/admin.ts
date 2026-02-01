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
import { createLogger } from '../lib/logger';

const router = Router();
const logger = createLogger('Admin');

// Middleware de autenticación admin
const adminAuth = (req: Request, res: Response, next: Function) => {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_KEY;
  
  // SECURITY: ALWAYS require ADMIN_KEY in all environments
  // Removed development bypass - admin access should always be protected
  if (!expectedKey) {
    logger.error('🚫 [Admin] CRITICAL: ADMIN_KEY not configured');
    return res.status(500).json({ error: 'Admin configuration incomplete' });
  }
  
  if (!adminKey) {
    return res.status(401).json({ error: 'API key requerida' });
  }
  
  // Comparación timing-safe para prevenir timing attacks
  const crypto = require('crypto');
  try {
    const keyBuffer = Buffer.from(adminKey as string, 'utf8');
    const expectedBuffer = Buffer.from(expectedKey, 'utf8');
    
    if (keyBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(keyBuffer, expectedBuffer)) {
      logger.warn(`🚫 [Admin] Intento de acceso con key inválida desde IP: ${req.ip}`);
      return res.status(401).json({ error: 'No autorizado' });
    }
  } catch (error) {
    logger.warn(`🚫 [Admin] Error verificando key desde IP: ${req.ip}`);
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
    logger.error('[Admin] Error getting outbox stats:', error);
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
    logger.error('[Admin] Error processing outbox:', error);
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
    logger.error('[Admin] Error retrying failed events:', error);
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
    logger.error('[Admin] Error cleaning up outbox:', error);
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
    logger.error('[Admin] Error listing outbox events:', error);
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
    logger.debug('[Admin] Iniciando cálculo de payouts...');
    const result = await calculateAllPayouts();
    res.json({
      message: 'Cálculo completado',
      ...result
    });
  } catch (error: any) {
    logger.error('[Admin] Error calculating payouts:', error);
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
    logger.error('[Admin] Error getting pending retry payouts:', error);
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
    logger.error('[Admin] Error listing payouts:', error);
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
    logger.error('[Admin] Error getting pending chargebacks:', error);
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
    logger.error('[Admin] Error getting dashboard:', error);
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
    logger.error('[Admin] Error getting jobs status:', error);
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
    
    logger.debug(`[Admin] Ejecutando job manual: ${jobName}`);
    await runJobManually(jobName);
    
    res.json({
      message: `Job '${jobName}' ejecutado exitosamente`
    });
  } catch (error: any) {
    logger.error('[Admin] Error running job:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===================== MODERACIÓN (requiere SUPER_ADMIN) =====================
// Estas rutas NO usan X-Admin-Key sino JWT con role SUPER_ADMIN

import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';

// Middleware específico para rutas de moderación
const moderationRouter = Router();
moderationRouter.use(authenticate, requireSuperAdmin);

/**
 * GET /api/admin/moderation/users
 * Listar todos los usuarios (incluyendo super admins)
 */
moderationRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 50, search, role } = req.query;

    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { username: { contains: search as string, mode: 'insensitive' } },
        { displayName: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    if (role) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          role: true,
          isCreator: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
          ageVerified: true,
          emailVerified: true
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.user.count({ where })
    ]);

    res.json({
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.error('[MODERATION] Error listing users:', error);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
});

/**
 * GET /api/admin/moderation/posts
 * Listar todos los posts de todos los creadores
 */
moderationRouter.get('/posts', async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 50, creatorId, contentType, requiresPurchase } = req.query;

    const where: any = {};

    if (creatorId) {
      where.creatorId = creatorId;
    }

    if (contentType) {
      where.contentType = contentType;
    }

    if (requiresPurchase !== undefined) {
      where.requiresPurchase = requiresPurchase === 'true';
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  username: true,
                  displayName: true,
                  avatar: true
                }
              }
            }
          },
          // Note: likes y comments son campos Int directos en Post, no relaciones
          // _count no es necesario aquí
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.post.count({ where })
    ]);

    res.json({
      posts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.error('[MODERATION] Error listing posts:', error);
    res.status(500).json({ error: 'Error al listar posts' });
  }
});

/**
 * GET /api/admin/moderation/posts/:postId
 * Ver detalles completos de un post (incluyendo si es PPV)
 */
moderationRouter.get('/posts/:postId', async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        creator: {
          select: {
            id: true,
            userId: true,
            user: {
              select: {
                username: true,
                displayName: true,
                avatar: true,
                email: true
              }
            }
          }
        },
        // likes y comments son contadores Int, no relaciones
        // Para ver interacciones reales, buscar en PostLike y PostComment por postId
        purchases: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }

    res.json(post);
  } catch (error) {
    logger.error('[MODERATION] Error getting post:', error);
    res.status(500).json({ error: 'Error al obtener post' });
  }
});

/**
 * DELETE /api/admin/moderation/posts/:postId
 * Eliminar un post (moderación)
 */
moderationRouter.delete('/posts/:postId', async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { reason } = req.body;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { creator: { include: { user: true } } }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post no encontrado' });
    }

    // Eliminar el post
    await prisma.post.delete({
      where: { id: postId }
    });

    logger.warn('[MODERATION] Post deleted by admin', {
      postId,
      creatorId: post.creatorId,
      creatorUsername: post.creator.user.username,
      adminId: (req as AuthRequest).userId,
      reason
    });

    res.json({ message: 'Post eliminado exitosamente' });
  } catch (error) {
    logger.error('[MODERATION] Error deleting post:', error);
    res.status(500).json({ error: 'Error al eliminar post' });
  }
});

/**
 * POST /api/admin/moderation/posts/:postId/flag
 * Marcar un post como peligroso/reportado
 */
moderationRouter.post('/posts/:postId/flag', async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { reason, severity } = req.body; // severity: 'low', 'medium', 'high', 'critical'

    const adminId = (req as AuthRequest).userId;

    logger.warn('[MODERATION] Post flagged', {
      postId,
      adminId,
      reason,
      severity
    });

    res.json({ message: 'Post marcado exitosamente' });
  } catch (error) {
    logger.error('[MODERATION] Error flagging post:', error);
    res.status(500).json({ error: 'Error al marcar post' });
  }
});

/**
 * GET /api/admin/moderation/stats
 * Estadísticas generales de la plataforma
 */
moderationRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const [
      totalUsers,
      totalCreators,
      totalPosts,
      totalSubscriptions,
      recentUsers
    ] = await Promise.all([
      prisma.user.count(),
      prisma.creator.count(),
      prisma.post.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.user.findMany({
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    res.json({
      totalUsers,
      totalCreators,
      totalPosts,
      totalSubscriptions,
      recentUsers
    });
  } catch (error) {
    logger.error('[MODERATION] Error getting stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// Montar el router de moderación
router.use('/moderation', moderationRouter);

export default router;
