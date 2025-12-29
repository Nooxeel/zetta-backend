/**
 * TransactionService - Crear y gestionar transacciones de pago
 * 
 * Este servicio es el núcleo del sistema de pagos.
 * Cada transacción:
 * 1. Calcula fees según tier del creador
 * 2. Crea asientos contables (doble partida)
 * 3. Emite evento al outbox
 */

import prisma from '../lib/prisma';
import { calculateFees } from './feeCalculator';
import { getFeeBpsForCreator, getActiveFeeSchedule } from './feeScheduleService';
import { createTransactionLedgerEntries } from './ledgerService';
import type { ProductType, TransactionStatus } from '@prisma/client';

export interface CreateTransactionInput {
  creatorId: string;
  fanUserId: string;
  productId?: string;
  productType: ProductType;
  grossAmount: bigint;
  provider: string;
  providerPaymentId: string;
  providerEventId: string;  // Para idempotencia
  processorFeeAmount?: bigint;
  metadata?: Record<string, unknown>;
}

export interface TransactionResult {
  id: string;
  grossAmount: bigint;
  platformFeeAmount: bigint;
  creatorPayableAmount: bigint;
  appliedPlatformFeeBps: number;
  status: TransactionStatus;
}

/**
 * Crea una transacción completa con ledger entries y evento outbox
 * 
 * IMPORTANTE: Esta operación es atómica (todo o nada)
 * 
 * @throws Error si providerEventId ya existe (idempotencia)
 */
export async function createTransaction(input: CreateTransactionInput): Promise<TransactionResult> {
  const {
    creatorId,
    fanUserId,
    productId,
    productType,
    grossAmount,
    provider,
    providerPaymentId,
    providerEventId,
    processorFeeAmount = 0n,
    metadata = {}
  } = input;

  // 1. Verificar idempotencia
  const existing = await prisma.transaction.findUnique({
    where: { providerEventId }
  });
  
  if (existing) {
    console.log(`[Transaction] Duplicado detectado: ${providerEventId}`);
    return {
      id: existing.id,
      grossAmount: existing.grossAmount,
      platformFeeAmount: existing.platformFeeAmount,
      creatorPayableAmount: existing.creatorPayableAmount,
      appliedPlatformFeeBps: existing.appliedPlatformFeeBps,
      status: existing.status
    };
  }

  // 2. Obtener fee del creador según su tier
  const { feeBps, feeScheduleId } = await getFeeBpsForCreator(creatorId);

  // 3. Calcular montos
  const fees = calculateFees({
    grossAmount,
    platformFeeBps: feeBps,
    processorFeeAmount
  });

  // 4. Crear todo en una transacción atómica
  const result = await prisma.$transaction(async (tx) => {
    // 4a. Crear la transacción
    const transaction = await tx.transaction.create({
      data: {
        creatorId,
        fanUserId,
        productId,
        productType,
        currency: 'CLP',
        grossAmount: fees.grossAmount,
        appliedFeeScheduleId: feeScheduleId,
        appliedPlatformFeeBps: fees.platformFeeBps,
        platformFeeAmount: fees.platformFeeAmount,
        processorFeeAmount: fees.processorFeeAmount,
        creatorPayableAmount: fees.creatorPayableAmount,
        status: 'SUCCEEDED',
        provider,
        providerPaymentId,
        providerEventId,
        metadata: metadata as object,
        occurredAt: new Date()
      }
    });

    // 4b. Crear asientos contables
    await createTransactionLedgerEntries(
      tx,
      transaction.id,
      fees.grossAmount,
      fees.platformFeeAmount,
      fees.creatorPayableAmount,
      creatorId,
      fees.processorFeeAmount
    );

    // 4c. Crear evento en outbox
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Transaction',
        aggregateId: transaction.id,
        eventType: 'TransactionCreated',
        payload: {
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          eventType: 'TransactionCreated',
          occurredAt: new Date().toISOString(),
          transaction: {
            id: transaction.id,
            creatorId,
            fanUserId,
            productId,
            productType,
            currency: 'CLP',
            grossAmount: Number(fees.grossAmount),
            appliedFeeScheduleId: feeScheduleId,
            appliedPlatformFeeBps: fees.platformFeeBps,
            platformFeeAmount: Number(fees.platformFeeAmount),
            processorFeeAmount: Number(fees.processorFeeAmount),
            creatorPayableAmount: Number(fees.creatorPayableAmount),
            provider,
            providerPaymentId,
            providerEventId
          }
        }
      }
    });

    return transaction;
  });

  console.log(`[Transaction] Creada: ${result.id}, fee=${feeBps}bps, creador recibe=${fees.creatorPayableAmount}`);

  return {
    id: result.id,
    grossAmount: result.grossAmount,
    platformFeeAmount: result.platformFeeAmount,
    creatorPayableAmount: result.creatorPayableAmount,
    appliedPlatformFeeBps: result.appliedPlatformFeeBps,
    status: result.status
  };
}

/**
 * Obtiene las transacciones de un creador
 */
export async function getCreatorTransactions(
  creatorId: string,
  options: {
    limit?: number;
    offset?: number;
    status?: TransactionStatus;
  } = {}
) {
  const { limit = 50, offset = 0, status } = options;

  const transactions = await prisma.transaction.findMany({
    where: {
      creatorId,
      ...(status && { status })
    },
    orderBy: { occurredAt: 'desc' },
    take: limit,
    skip: offset,
    include: {
      product: {
        select: { title: true, type: true }
      }
    }
  });

  return transactions.map(t => ({
    id: t.id,
    productType: t.productType,
    productTitle: t.product?.title || null,
    grossAmount: t.grossAmount,
    platformFeeAmount: t.platformFeeAmount,
    creatorPayableAmount: t.creatorPayableAmount,
    status: t.status,
    occurredAt: t.occurredAt,
    provider: t.provider
  }));
}

/**
 * Obtiene estadísticas de transacciones de un creador
 */
export async function getCreatorTransactionStats(creatorId: string) {
  const [totals, byType] = await Promise.all([
    prisma.transaction.aggregate({
      where: { creatorId, status: 'SUCCEEDED' },
      _sum: {
        grossAmount: true,
        platformFeeAmount: true,
        creatorPayableAmount: true
      },
      _count: true
    }),
    prisma.transaction.groupBy({
      by: ['productType'],
      where: { creatorId, status: 'SUCCEEDED' },
      _sum: { grossAmount: true },
      _count: true
    })
  ]);

  return {
    totalTransactions: totals._count,
    totalGross: totals._sum.grossAmount || 0n,
    totalFees: totals._sum.platformFeeAmount || 0n,
    totalPayable: totals._sum.creatorPayableAmount || 0n,
    byType: byType.map(t => ({
      type: t.productType,
      count: t._count,
      total: t._sum.grossAmount || 0n
    }))
  };
}

/**
 * Marca una transacción como reembolsada
 */
export async function refundTransaction(
  transactionId: string,
  reason: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.update({
      where: { id: transactionId },
      data: { status: 'REFUNDED' }
    });

    // Crear evento de refund
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Transaction',
        aggregateId: transactionId,
        eventType: 'TransactionRefunded',
        payload: {
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          eventType: 'TransactionRefunded',
          occurredAt: new Date().toISOString(),
          transactionId,
          refundAmount: Number(transaction.grossAmount),
          reason
        }
      }
    });
  });
}
