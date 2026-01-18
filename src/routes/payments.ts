/**
 * Webpay Payment Routes
 * 
 * Handles Webpay Plus payment flow:
 * 1. POST /api/payments/webpay/create - Create a new payment
 * 2. GET /api/payments/webpay/return - Return URL after payment (handles all cases)
 * 3. GET /api/payments/webpay/status/:buyOrder - Check payment status
 * 4. POST /api/payments/webpay/refund - Refund a payment (admin only)
 */

import { Router, Request, Response } from 'express';
import { webpayService } from '../services/webpay.service';
import prisma from '../lib/prisma';
import jwt from 'jsonwebtoken';
import { paymentLimiter, sanitizePagination } from '../middleware/rateLimiter';

const router = Router();

// JWT Secret - MUST be set in environment
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET environment variable is required');
}

// Frontend URLs
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Auth middleware
interface AuthRequest extends Request {
  user?: { userId: string; email: string };
}

const authMiddleware = async (req: AuthRequest, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// ==================== CREATE PAYMENT ====================

/**
 * POST /api/payments/webpay/create
 * Create a new payment and get redirect URL
 */
router.post('/create', paymentLimiter, authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { amount, paymentType, subscriptionTierId, creatorId, donationMessage } = req.body;

    // Validate required fields
    if (!amount || !paymentType) {
      return res.status(400).json({ error: 'Monto y tipo de pago son requeridos' });
    }

    // Validate amount is positive integer
    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ error: 'El monto debe ser un número entero positivo' });
    }

    // Validate payment type
    const validTypes = ['SUBSCRIPTION', 'DONATION', 'TIP', 'CONTENT', 'TOKENS'];
    if (!validTypes.includes(paymentType)) {
      return res.status(400).json({ error: 'Tipo de pago inválido' });
    }

    // For subscriptions, validate tier exists
    if (paymentType === 'SUBSCRIPTION') {
      if (!subscriptionTierId || !creatorId) {
        return res.status(400).json({ 
          error: 'Para suscripciones se requiere subscriptionTierId y creatorId' 
        });
      }

      const tier = await prisma.subscriptionTier.findUnique({
        where: { id: subscriptionTierId },
      });

      if (!tier) {
        return res.status(404).json({ error: 'Plan de suscripción no encontrado' });
      }

      // Validate amount matches tier price
      if (tier.price !== amount) {
        return res.status(400).json({ 
          error: `El monto (${amount}) no coincide con el precio del plan (${tier.price})` 
        });
      }
    }

    // For donations/tips, validate creator exists
    if ((paymentType === 'DONATION' || paymentType === 'TIP') && creatorId) {
      const creator = await prisma.creator.findUnique({
        where: { id: creatorId },
      });

      if (!creator) {
        return res.status(404).json({ error: 'Creador no encontrado' });
      }
    }

    // Build return URL (frontend will handle the result)
    const returnUrl = `${FRONTEND_URL}/payments/result`;

    // Create payment
    const result = await webpayService.createPayment({
      userId,
      amount,
      paymentType,
      returnUrl,
      subscriptionTierId,
      creatorId,
      donationMessage,
    });

    res.json({
      success: true,
      token: result.token,
      url: result.url,
      buyOrder: result.buyOrder,
      transactionId: result.transactionId,
      // Frontend should redirect user to: result.url with POST form containing token_ws
      formHtml: `
        <form id="webpay-form" method="POST" action="${result.url}">
          <input type="hidden" name="token_ws" value="${result.token}" />
        </form>
        <script>document.getElementById('webpay-form').submit();</script>
      `,
    });
  } catch (error) {
    console.error('[Webpay] Error creating payment:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Error al crear pago' 
    });
  }
});

// ==================== RETURN URL (handles all cases) ====================

/**
 * GET /api/payments/webpay/return
 * Webpay redirects here after payment (or abort/timeout)
 * 
 * Possible scenarios:
 * 1. Success/Reject: receives token_ws
 * 2. Abort (user clicked cancel): receives TBK_TOKEN, TBK_ORDEN_COMPRA, TBK_ID_SESION
 * 3. Timeout: receives TBK_ID_SESION, TBK_ORDEN_COMPRA (no token)
 * 4. Error + volver: receives token_ws, TBK_TOKEN, TBK_ID_SESION, TBK_ORDEN_COMPRA
 * 
 * If called with Accept: application/json header, returns JSON instead of redirect
 */
router.get('/return', async (req: Request, res: Response) => {
  try {
    const { 
      token_ws, 
      TBK_TOKEN, 
      TBK_ORDEN_COMPRA, 
      TBK_ID_SESION 
    } = req.query as Record<string, string | undefined>;

    console.log('[Webpay] Return received:', { token_ws, TBK_TOKEN, TBK_ORDEN_COMPRA, TBK_ID_SESION });

    // Check if this is an API call (from frontend fetch) or browser redirect
    const isApiCall = req.headers.accept?.includes('application/json') || 
                      req.headers['x-requested-with'] === 'XMLHttpRequest';

    let result;

    // Case 1: Normal flow (success or reject) - only token_ws present
    if (token_ws && !TBK_TOKEN) {
      result = await webpayService.confirmPayment(token_ws);
    }
    // Case 2: User aborted - TBK_TOKEN present
    else if (TBK_TOKEN && TBK_ORDEN_COMPRA) {
      result = await webpayService.handleCancelledPayment(TBK_TOKEN, TBK_ORDEN_COMPRA);
    }
    // Case 3: Timeout - no tokens, only order and session
    else if (!token_ws && !TBK_TOKEN && TBK_ORDEN_COMPRA && TBK_ID_SESION) {
      result = await webpayService.handleTimeout(TBK_ORDEN_COMPRA, TBK_ID_SESION);
    }
    // Case 4: Error recovery - both tokens present
    else if (token_ws && TBK_TOKEN) {
      // This is a weird state, treat as cancelled
      result = await webpayService.handleCancelledPayment(TBK_TOKEN, TBK_ORDEN_COMPRA!);
    }
    else {
      // Unknown state
      if (isApiCall) {
        return res.status(400).json({ error: 'Estado de pago desconocido', success: false });
      }
      return res.redirect(`${FRONTEND_URL}/payments/result?error=unknown_state`);
    }

    // If API call, return JSON
    if (isApiCall) {
      return res.json({
        success: result.success,
        status: result.status,
        buyOrder: result.buyOrder,
        amount: result.amount,
        transactionId: result.transactionId,
        authorizationCode: result.authorizationCode,
        cardNumber: result.cardNumber,
        error: result.errorMessage,
      });
    }

    // Otherwise redirect to frontend with result
    const params = new URLSearchParams({
      status: result.status,
      success: String(result.success),
      buyOrder: result.buyOrder,
      amount: String(result.amount),
      transactionId: result.transactionId,
    });

    if (result.authorizationCode) {
      params.set('authorizationCode', result.authorizationCode);
    }
    if (result.cardNumber) {
      params.set('cardNumber', result.cardNumber);
    }
    if (result.errorMessage) {
      params.set('error', result.errorMessage);
    }

    res.redirect(`${FRONTEND_URL}/payments/result?${params.toString()}`);
  } catch (error) {
    console.error('[Webpay] Error in return handler:', error);
    res.redirect(`${FRONTEND_URL}/payments/result?error=${encodeURIComponent(
      error instanceof Error ? error.message : 'Error al procesar pago'
    )}`);
  }
});

// Also handle POST for older API versions
router.post('/return', async (req: Request, res: Response) => {
  // Merge body and query params
  const params = { ...req.query, ...req.body };
  
  // Redirect to GET handler
  const queryString = new URLSearchParams(params).toString();
  res.redirect(`/api/payments/webpay/return?${queryString}`);
});

// ==================== CHECK STATUS ====================

/**
 * GET /api/payments/webpay/status/:buyOrder
 * Check payment status by buyOrder
 */
router.get('/status/:buyOrder', async (req: Request, res: Response) => {
  try {
    const { buyOrder } = req.params;

    const result = await webpayService.getTransactionStatus(buyOrder);

    if (!result) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }

    res.json(result);
  } catch (error) {
    console.error('[Webpay] Error getting status:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Error al obtener estado' 
    });
  }
});

// ==================== USER TRANSACTIONS ====================

/**
 * GET /api/payments/webpay/my-transactions
 * Get user's payment history
 */
router.get('/my-transactions', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { limit = '20', offset = '0' } = req.query;

    const transactions = await prisma.webpayTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      select: {
        id: true,
        buyOrder: true,
        amount: true,
        paymentType: true,
        status: true,
        cardNumber: true,
        paymentTypeCode: true,
        createdAt: true,
        completedAt: true,
        creatorId: true,
      },
    });

    const total = await prisma.webpayTransaction.count({
      where: { userId },
    });

    res.json({
      transactions,
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('[Webpay] Error getting transactions:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Error al obtener transacciones' 
    });
  }
});

// ==================== REFUND (Admin only) ====================

/**
 * POST /api/payments/webpay/refund
 * Refund a payment (requires admin)
 */
router.post('/refund', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { buyOrder, amount } = req.body;

    if (!buyOrder || !amount) {
      return res.status(400).json({ error: 'buyOrder y amount son requeridos' });
    }

    // Get transaction
    const tx = await prisma.webpayTransaction.findUnique({
      where: { buyOrder },
    });

    if (!tx) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }

    if (!tx.token) {
      return res.status(400).json({ error: 'Transacción sin token' });
    }

    // TODO: Add admin check here
    // For now, only allow refund of own transactions
    if (tx.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const result = await webpayService.refundPayment(tx.token, amount);

    res.json(result);
  } catch (error) {
    console.error('[Webpay] Error refunding:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Error al procesar reembolso' 
    });
  }
});

export default router;
