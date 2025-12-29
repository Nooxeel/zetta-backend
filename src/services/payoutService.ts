/**
 * PayoutService - Cálculo y ejecución de pagos a creadores
 * 
 * Reglas:
 * - Solo transacciones con hold liberado (occurredAt <= now - holdDays)
 * - Mínimo $20.000 CLP para crear payout
 * - No incluir transacciones ya pagadas
 */

import prisma from '../lib/prisma';
import { getActiveFeeSchedule } from './feeScheduleService';
import type { PayoutStatus, Prisma } from '@prisma/client';

export interface PayoutCalculationResult {
  creatorId: string;
  eligibleTransactions: Array<{
    id: string;
    creatorPayableAmount: bigint;
    occurredAt: Date;
  }>;
  totals: {
    grossTotal: bigint;
    platformFeeTotal: bigint;
    creatorPayableTotal: bigint;
  };
  holdNotReleasedCount: number;
  canCreatePayout: boolean;
  reason?: string;
}

/**
 * Calcula las transacciones elegibles para payout de un creador
 */
export async function calculatePayoutEligibility(
  creatorId: string
): Promise<PayoutCalculationResult> {
  const feeSchedule = await getActiveFeeSchedule();
  
  // Fecha límite: transacciones más antiguas que holdDays
  const holdReleaseDate = new Date();
  holdReleaseDate.setDate(holdReleaseDate.getDate() - feeSchedule.holdDays);

  // Transacciones elegibles (hold liberado, no pagadas)
  const eligibleTransactions = await prisma.transaction.findMany({
    where: {
      creatorId,
      status: 'SUCCEEDED',
      occurredAt: { lte: holdReleaseDate },
      payoutItems: { none: {} } // No incluida en ningún payout
    },
    select: {
      id: true,
      grossAmount: true,
      platformFeeAmount: true,
      creatorPayableAmount: true,
      occurredAt: true
    },
    orderBy: { occurredAt: 'asc' }
  });

  // Transacciones pendientes de hold
  const pendingHoldCount = await prisma.transaction.count({
    where: {
      creatorId,
      status: 'SUCCEEDED',
      occurredAt: { gt: holdReleaseDate },
      payoutItems: { none: {} }
    }
  });

  // Calcular totales
  const totals = eligibleTransactions.reduce(
    (acc, t) => ({
      grossTotal: acc.grossTotal + t.grossAmount,
      platformFeeTotal: acc.platformFeeTotal + t.platformFeeAmount,
      creatorPayableTotal: acc.creatorPayableTotal + t.creatorPayableAmount
    }),
    { grossTotal: 0n, platformFeeTotal: 0n, creatorPayableTotal: 0n }
  );

  // Verificar mínimo
  const canCreatePayout = totals.creatorPayableTotal >= feeSchedule.minPayoutClp;
  let reason: string | undefined;
  
  if (!canCreatePayout) {
    if (eligibleTransactions.length === 0) {
      reason = 'No hay transacciones con hold liberado';
    } else {
      reason = `Monto ${totals.creatorPayableTotal} es menor al mínimo ${feeSchedule.minPayoutClp}`;
    }
  }

  return {
    creatorId,
    eligibleTransactions: eligibleTransactions.map(t => ({
      id: t.id,
      creatorPayableAmount: t.creatorPayableAmount,
      occurredAt: t.occurredAt
    })),
    totals,
    holdNotReleasedCount: pendingHoldCount,
    canCreatePayout,
    reason
  };
}

/**
 * Crea un payout para un creador (si es elegible)
 */
export async function createPayout(creatorId: string): Promise<{
  success: boolean;
  payoutId?: string;
  reason?: string;
}> {
  const eligibility = await calculatePayoutEligibility(creatorId);

  if (!eligibility.canCreatePayout) {
    return {
      success: false,
      reason: eligibility.reason
    };
  }

  const feeSchedule = await getActiveFeeSchedule();
  const now = new Date();
  
  // Período: desde la transacción más antigua hasta ahora
  const periodStart = eligibility.eligibleTransactions.length > 0
    ? eligibility.eligibleTransactions[0].occurredAt
    : now;

  const result = await prisma.$transaction(async (tx) => {
    // Crear payout
    const payout = await tx.payout.create({
      data: {
        creatorId,
        periodStart,
        periodEnd: now,
        currency: 'CLP',
        grossTotal: eligibility.totals.grossTotal,
        platformFeeTotal: eligibility.totals.platformFeeTotal,
        adjustmentsTotal: 0n,
        payoutAmount: eligibility.totals.creatorPayableTotal,
        status: 'CALCULATED'
      }
    });

    // Crear payout items
    for (const t of eligibility.eligibleTransactions) {
      await tx.payoutItem.create({
        data: {
          payoutId: payout.id,
          transactionId: t.id,
          amount: t.creatorPayableAmount
        }
      });
    }

    // Crear evento en outbox
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Payout',
        aggregateId: payout.id,
        eventType: 'PayoutCalculated',
        payload: {
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          eventType: 'PayoutCalculated',
          occurredAt: now.toISOString(),
          payout: {
            id: payout.id,
            creatorId,
            periodStart: periodStart.toISOString(),
            periodEnd: now.toISOString(),
            currency: 'CLP',
            grossTotal: Number(eligibility.totals.grossTotal),
            platformFeeTotal: Number(eligibility.totals.platformFeeTotal),
            adjustmentsTotal: 0,
            payoutAmount: Number(eligibility.totals.creatorPayableTotal)
          },
          config: {
            minPayoutClp: Number(feeSchedule.minPayoutClp),
            holdDays: feeSchedule.holdDays
          },
          includedTransactionIds: eligibility.eligibleTransactions.map(t => t.id),
          excludedReason: null
        }
      }
    });

    return payout;
  });

  console.log(`[Payout] Creado: ${result.id}, monto=${eligibility.totals.creatorPayableTotal}`);

  return {
    success: true,
    payoutId: result.id
  };
}

/**
 * Marca un payout como enviado
 */
export async function markPayoutSent(
  payoutId: string,
  providerTransferId: string
): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const payout = await tx.payout.update({
      where: { id: payoutId },
      data: {
        status: 'SENT',
        sentAt: now,
        providerTransferId
      }
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Payout',
        aggregateId: payoutId,
        eventType: 'PayoutSent',
        payload: {
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          eventType: 'PayoutSent',
          occurredAt: now.toISOString(),
          payoutId,
          creatorId: payout.creatorId,
          amount: Number(payout.payoutAmount),
          providerTransferId,
          sentAt: now.toISOString()
        }
      }
    });
  });
}

/**
 * Marca un payout como fallido
 */
export async function markPayoutFailed(
  payoutId: string,
  failureReason: string
): Promise<void> {
  const now = new Date();
  const MAX_RETRIES = 3;

  await prisma.$transaction(async (tx) => {
    const current = await tx.payout.findUnique({
      where: { id: payoutId }
    });

    if (!current) throw new Error(`Payout ${payoutId} no encontrado`);

    const newRetryCount = current.retryCount + 1;
    const nextRetryAt = newRetryCount < MAX_RETRIES
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000) // Retry en 24h
      : null;

    const payout = await tx.payout.update({
      where: { id: payoutId },
      data: {
        status: newRetryCount >= MAX_RETRIES ? 'FAILED' : 'PENDING',
        failedAt: now,
        failureReason,
        retryCount: newRetryCount,
        nextRetryAt
      }
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Payout',
        aggregateId: payoutId,
        eventType: 'PayoutFailed',
        payload: {
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          eventType: 'PayoutFailed',
          occurredAt: now.toISOString(),
          payoutId,
          creatorId: payout.creatorId,
          amount: Number(payout.payoutAmount),
          failureReason,
          retryCount: newRetryCount,
          nextRetryAt: nextRetryAt?.toISOString() || null
        }
      }
    });
  });
}

/**
 * Obtiene los payouts pendientes de retry
 */
export async function getPayoutsPendingRetry(): Promise<Array<{
  id: string;
  creatorId: string;
  payoutAmount: bigint;
  retryCount: number;
}>> {
  const now = new Date();

  return prisma.payout.findMany({
    where: {
      status: 'PENDING',
      nextRetryAt: { lte: now }
    },
    select: {
      id: true,
      creatorId: true,
      payoutAmount: true,
      retryCount: true
    }
  });
}

/**
 * Calcula payouts para todos los creadores elegibles
 */
export async function calculateAllPayouts(): Promise<{
  created: number;
  skipped: number;
  errors: number;
}> {
  // Obtener creadores con transacciones no pagadas
  const creatorsWithPending = await prisma.transaction.groupBy({
    by: ['creatorId'],
    where: {
      status: 'SUCCEEDED',
      payoutItems: { none: {} }
    }
  });

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const { creatorId } of creatorsWithPending) {
    try {
      const result = await createPayout(creatorId);
      if (result.success) {
        created++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`[Payout] Error para creador ${creatorId}:`, error);
      errors++;
    }
  }

  return { created, skipped, errors };
}
