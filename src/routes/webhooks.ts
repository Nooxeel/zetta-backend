/**
 * Webhook para recibir eventos del procesador de pagos
 * Ej: Transbank, Khipu, Flow, etc.
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { createTransaction } from '../services/transactionService';
import { createChargeback } from '../services/chargebackService';
import { markPayoutSent, markPayoutFailed } from '../services/payoutService';
import prisma from '../lib/prisma';
import { createLogger } from '../lib/logger';

const router = Router();
const logger = createLogger('Webhooks');

// Tipo de evento genérico (adaptar según procesador real)
interface WebhookEvent {
  type: string;
  id: string;
  data: Record<string, any>;
}

/**
 * Verifica la firma del webhook usando HMAC y comparación timing-safe
 * Previene timing attacks al comparar firmas
 */
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    // Usar timing-safe comparison para prevenir timing attacks
    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    
    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * POST /api/webhooks/payment-processor
 * Recibe eventos del procesador de pagos
 */
router.post('/payment-processor', async (req: Request, res: Response) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  // En desarrollo sin WEBHOOK_SECRET, permitir (con advertencia)
  if (process.env.NODE_ENV === 'development' && !webhookSecret) {
    logger.warn('[Webhook] ⚠️ WEBHOOK_SECRET no configurado - verificación deshabilitada en desarrollo');
  } else if (!webhookSecret) {
    logger.error('[Webhook] CRITICAL: WEBHOOK_SECRET no configurado en producción');
    return res.status(500).json({ error: 'Webhook no configurado correctamente' });
  } else if (!signature) {
    logger.warn('[Webhook] Firma no proporcionada');
    return res.status(401).json({ error: 'Firma requerida' });
  } else {
    // Verificar firma con HMAC timing-safe
    const payload = JSON.stringify(req.body);
    if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
      logger.warn('[Webhook] Firma inválida - posible intento de falsificación');
      return res.status(401).json({ error: 'Firma inválida' });
    }
  }

  const event = req.body as WebhookEvent;
  logger.debug(`[Webhook] Evento recibido: ${event.type}, id=${event.id}`);

  try {
    switch (event.type) {
      case 'payment.succeeded': {
        // Nuevo pago exitoso
        const { 
          creatorId, 
          productType, 
          productId, 
          amount, 
          fanUserId,
          provider,
          providerPaymentId
        } = event.data;

        await createTransaction({
          providerEventId: event.id,
          creatorId,
          fanUserId,
          productType: productType || 'TIP',
          productId: productId || null,
          grossAmount: BigInt(amount),
          provider: provider || 'UNKNOWN',
          providerPaymentId: providerPaymentId || event.id
        });

        logger.debug(`[Webhook] Transacción creada: ${event.id}`);
        break;
      }

      case 'payment.refunded': {
        // Reembolso
        // TODO: Implementar servicio de refund similar a chargeback
        logger.debug(`[Webhook] Refund: ${event.id} - TODO: Implementar`);
        break;
      }

      case 'payment.charged_back': {
        // Chargeback del banco
        const { chargebackId, reason, provider } = event.data;

        // Buscar transacción por providerEventId
        const transaction = await prisma.transaction.findUnique({
          where: { providerEventId: event.data.originalEventId }
        });

        if (transaction) {
          await createChargeback({
            transactionId: transaction.id,
            providerCaseId: chargebackId || event.id,
            provider: provider || 'UNKNOWN',
            reason
          });
          logger.debug(`[Webhook] Chargeback creado para tx ${transaction.id}`);
        } else {
          logger.warn(`[Webhook] Transacción no encontrada: ${event.data.originalEventId}`);
        }
        break;
      }

      case 'transfer.succeeded': {
        // Transferencia de payout exitosa
        const { payoutId, transferId } = event.data;

        const payout = await prisma.payout.findFirst({
          where: { id: payoutId }
        });

        if (payout) {
          await markPayoutSent(payoutId, transferId || event.id);
          logger.debug(`[Webhook] Payout ${payoutId} marcado como enviado`);
        }
        break;
      }

      case 'transfer.failed': {
        // Transferencia de payout fallida
        const { payoutId, reason } = event.data;

        const payout = await prisma.payout.findFirst({
          where: { id: payoutId }
        });

        if (payout) {
          await markPayoutFailed(payoutId, reason || 'Error en transferencia');
          logger.debug(`[Webhook] Payout ${payoutId} marcado como fallido`);
        }
        break;
      }

      default:
        logger.debug(`[Webhook] Evento no manejado: ${event.type}`);
    }

    // Siempre responder 200 OK para que el procesador no reintente
    res.json({ received: true, eventId: event.id });
  } catch (error) {
    logger.error('[Webhook] Error procesando evento:', error);
    // Responder 500 para que el procesador reintente
    res.status(500).json({ error: 'Error procesando evento' });
  }
});

/**
 * POST /api/webhooks/transbank
 * Webhook específico para Transbank Webpay (Chile)
 */
router.post('/transbank', async (req: Request, res: Response) => {
  logger.debug('[Webhook] Transbank payload:', req.body);

  // TODO: Implementar verificación de firma Transbank
  // TODO: Mapear payload de Transbank a formato genérico

  // Por ahora, responder ACK
  res.json({ received: true });
});

/**
 * POST /api/webhooks/khipu
 * Webhook para Khipu (Chile)
 */
router.post('/khipu', async (req: Request, res: Response) => {
  logger.debug('[Webhook] Khipu payload:', req.body);

  // TODO: Implementar verificación de firma Khipu
  // TODO: Mapear payload de Khipu a formato genérico

  res.json({ received: true });
});

export default router;
