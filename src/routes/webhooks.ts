/**
 * Webhook para recibir eventos del procesador de pagos
 * Ej: Transbank, Khipu, Flow, etc.
 */

import { Router, Request, Response } from 'express';
import { createTransaction } from '../services/transactionService';
import { createChargeback } from '../services/chargebackService';
import { markPayoutSent, markPayoutFailed } from '../services/payoutService';
import prisma from '../lib/prisma';

const router = Router();

// Tipo de evento genérico (adaptar según procesador real)
interface WebhookEvent {
  type: string;
  id: string;
  data: Record<string, any>;
}

/**
 * POST /api/webhooks/payment-processor
 * Recibe eventos del procesador de pagos
 */
router.post('/payment-processor', async (req: Request, res: Response) => {
  // Verificar firma del webhook (ejemplo con header simple)
  const signature = req.headers['x-webhook-signature'];
  const expectedSignature = process.env.WEBHOOK_SECRET;

  // En desarrollo, permitir sin firma
  if (process.env.NODE_ENV !== 'development' && signature !== expectedSignature) {
    console.warn('[Webhook] Firma inválida');
    return res.status(401).json({ error: 'Firma inválida' });
  }

  const event = req.body as WebhookEvent;
  console.log(`[Webhook] Evento recibido: ${event.type}, id=${event.id}`);

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

        console.log(`[Webhook] Transacción creada: ${event.id}`);
        break;
      }

      case 'payment.refunded': {
        // Reembolso
        // TODO: Implementar servicio de refund similar a chargeback
        console.log(`[Webhook] Refund: ${event.id} - TODO: Implementar`);
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
          console.log(`[Webhook] Chargeback creado para tx ${transaction.id}`);
        } else {
          console.warn(`[Webhook] Transacción no encontrada: ${event.data.originalEventId}`);
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
          console.log(`[Webhook] Payout ${payoutId} marcado como enviado`);
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
          console.log(`[Webhook] Payout ${payoutId} marcado como fallido`);
        }
        break;
      }

      default:
        console.log(`[Webhook] Evento no manejado: ${event.type}`);
    }

    // Siempre responder 200 OK para que el procesador no reintente
    res.json({ received: true, eventId: event.id });
  } catch (error) {
    console.error('[Webhook] Error procesando evento:', error);
    // Responder 500 para que el procesador reintente
    res.status(500).json({ error: 'Error procesando evento' });
  }
});

/**
 * POST /api/webhooks/transbank
 * Webhook específico para Transbank Webpay (Chile)
 */
router.post('/transbank', async (req: Request, res: Response) => {
  console.log('[Webhook] Transbank payload:', req.body);

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
  console.log('[Webhook] Khipu payload:', req.body);

  // TODO: Implementar verificación de firma Khipu
  // TODO: Mapear payload de Khipu a formato genérico

  res.json({ received: true });
});

export default router;
