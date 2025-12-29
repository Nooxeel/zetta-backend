/**
 * ChargebackService - Manejo de contracargos y reversiones
 * 
 * Un chargeback revierte una transacción existente:
 * - Registra el chargeback
 * - Actualiza el estado de la transacción original
 * - Crea entradas de ledger para revertir el ingreso
 * - Si ya se pagó, marca como deuda pendiente del creador
 */

import prisma from '../lib/prisma';
import type { ChargebackStatus, TransactionStatus } from '@prisma/client';
import { LEDGER_CODES } from './ledgerService';

export interface ChargebackInput {
  transactionId: string;
  providerCaseId: string;  // providerCaseId según schema
  provider: string;
  reason?: string;
}

export interface ChargebackResult {
  success: boolean;
  chargebackId?: string;
  error?: string;
  wasAlreadyPaid: boolean;
}

/**
 * Crea un chargeback para una transacción
 */
export async function createChargeback(
  input: ChargebackInput
): Promise<ChargebackResult> {
  const now = new Date();

  // Verificar si ya existe chargeback por providerCaseId (idempotencia)
  const existing = await prisma.chargeback.findUnique({
    where: { providerCaseId: input.providerCaseId }
  });

  if (existing) {
    return {
      success: false,
      error: `Ya existe chargeback ${existing.id} para case ${input.providerCaseId}`,
      wasAlreadyPaid: false
    };
  }

  // Obtener la transacción original
  const transaction = await prisma.transaction.findUnique({
    where: { id: input.transactionId },
    include: {
      payoutItems: {
        include: {
          payout: true
        }
      }
    }
  });

  if (!transaction) {
    return {
      success: false,
      error: `Transacción ${input.transactionId} no encontrada`,
      wasAlreadyPaid: false
    };
  }

  // ¿Ya fue pagada al creador?
  const wasAlreadyPaid = transaction.payoutItems.some(
    item => item.payout.status === 'SENT'
  );

  // Obtener cuentas de ledger
  const [chargebackLoss, creatorPayable, platformRevenue] = await Promise.all([
    prisma.ledgerAccount.findUnique({ where: { code: LEDGER_CODES.CHARGEBACK_LOSS }}),
    prisma.ledgerAccount.findUnique({ where: { code: LEDGER_CODES.CREATOR_PAYABLE }}),
    prisma.ledgerAccount.findUnique({ where: { code: LEDGER_CODES.PLATFORM_REVENUE }})
  ]);

  if (!chargebackLoss || !creatorPayable || !platformRevenue) {
    throw new Error('Cuentas de ledger no encontradas');
  }

  // Status: RECEIVED si pendiente de resolución, LOST si ya se pagó y hay deuda
  const chargebackStatus: ChargebackStatus = 'RECEIVED';

  const result = await prisma.$transaction(async (tx) => {
    // 1. Crear el chargeback
    const chargeback = await tx.chargeback.create({
      data: {
        transactionId: input.transactionId,
        provider: input.provider,
        providerCaseId: input.providerCaseId,
        reason: input.reason || 'Chargeback del procesador',
        status: chargebackStatus,
        amount: transaction.grossAmount,
        occurredAt: now,
        resolvedAt: null
      }
    });

    // 2. Actualizar transacción original (CHARGEDBACK según schema)
    await tx.transaction.update({
      where: { id: input.transactionId },
      data: { status: 'CHARGEDBACK' }
    });

    // 3. Crear entradas de ledger para revertir
    // Debitar CHARGEBACK_LOSS (gasto)
    await tx.ledgerEntry.create({
      data: {
        transactionId: input.transactionId,
        accountId: chargebackLoss.id,
        debit: transaction.grossAmount,
        credit: 0n,
        currency: 'CLP',
        description: `Chargeback: ${input.providerCaseId}`
      }
    });

    // Debitar CREATOR_PAYABLE (reducir lo que debemos al creador)
    await tx.ledgerEntry.create({
      data: {
        transactionId: input.transactionId,
        accountId: creatorPayable.id,
        creatorId: transaction.creatorId,
        debit: transaction.creatorPayableAmount,
        credit: 0n,
        currency: 'CLP',
        description: `Chargeback reverso creador: ${input.providerCaseId}`
      }
    });

    // Debitar PLATFORM_REVENUE (reducir ingreso plataforma)
    await tx.ledgerEntry.create({
      data: {
        transactionId: input.transactionId,
        accountId: platformRevenue.id,
        debit: transaction.platformFeeAmount,
        credit: 0n,
        currency: 'CLP',
        description: `Chargeback reverso comisión: ${input.providerCaseId}`
      }
    });

    // 4. Crear evento en outbox
    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Chargeback',
        aggregateId: chargeback.id,
        eventType: 'ChargebackCreated',
        payload: {
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          eventType: 'ChargebackCreated',
          occurredAt: now.toISOString(),
          chargeback: {
            id: chargeback.id,
            transactionId: input.transactionId,
            providerCaseId: input.providerCaseId,
            provider: input.provider,
            reason: input.reason,
            status: chargeback.status,
            amount: Number(transaction.grossAmount),
            wasAlreadyPaid
          },
          originalTransaction: {
            id: transaction.id,
            creatorId: transaction.creatorId,
            productType: transaction.productType,
            grossAmount: Number(transaction.grossAmount),
            creatorPayableAmount: Number(transaction.creatorPayableAmount)
          }
        }
      }
    });

    return chargeback;
  });

  console.log(
    `[Chargeback] Creado: ${result.id}, tx=${input.transactionId}, ` +
    `monto=${transaction.grossAmount}, pagado=${wasAlreadyPaid}`
  );

  return {
    success: true,
    chargebackId: result.id,
    wasAlreadyPaid
  };
}

/**
 * Marca un chargeback como ganado (a favor de la plataforma)
 */
export async function resolveChargebackWon(
  chargebackId: string
): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const chargeback = await tx.chargeback.update({
      where: { id: chargebackId },
      data: {
        status: 'WON',
        resolvedAt: now
      }
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Chargeback',
        aggregateId: chargebackId,
        eventType: 'ChargebackWon',
        payload: {
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          eventType: 'ChargebackWon',
          occurredAt: now.toISOString(),
          chargebackId,
          transactionId: chargeback.transactionId,
          resolvedAt: now.toISOString()
        }
      }
    });
  });

  console.log(`[Chargeback] Ganado: ${chargebackId}`);
}

/**
 * Marca un chargeback como perdido
 */
export async function resolveChargebackLost(
  chargebackId: string
): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const chargeback = await tx.chargeback.update({
      where: { id: chargebackId },
      data: {
        status: 'LOST',
        resolvedAt: now
      }
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: 'Chargeback',
        aggregateId: chargebackId,
        eventType: 'ChargebackLost',
        payload: {
          eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          eventType: 'ChargebackLost',
          occurredAt: now.toISOString(),
          chargebackId,
          transactionId: chargeback.transactionId,
          resolvedAt: now.toISOString()
        }
      }
    });
  });

  console.log(`[Chargeback] Perdido: ${chargebackId}`);
}

/**
 * Obtiene chargebacks pendientes de resolución
 */
export async function getPendingChargebacks(): Promise<Array<{
  id: string;
  transactionId: string;
  creatorId: string;
  amount: bigint;
  createdAt: Date;
}>> {
  const chargebacks = await prisma.chargeback.findMany({
    where: {
      status: 'RECEIVED'
    },
    include: {
      transaction: {
        select: {
          creatorId: true
        }
      }
    }
  });

  return chargebacks.map(cb => ({
    id: cb.id,
    transactionId: cb.transactionId,
    creatorId: cb.transaction.creatorId,
    amount: cb.amount,
    createdAt: cb.createdAt
  }));
}

/**
 * Estadísticas de chargebacks por creador
 */
export async function getChargebackStats(creatorId: string): Promise<{
  totalCount: number;
  totalAmount: bigint;
  pendingCount: number;
  pendingAmount: bigint;
}> {
  const chargebacks = await prisma.chargeback.findMany({
    where: {
      transaction: { creatorId }
    },
    select: {
      amount: true,
      status: true
    }
  });

  const stats = chargebacks.reduce(
    (acc, cb) => {
      acc.totalCount++;
      acc.totalAmount += cb.amount;
      if (cb.status === 'RECEIVED') {
        acc.pendingCount++;
        acc.pendingAmount += cb.amount;
      }
      return acc;
    },
    {
      totalCount: 0,
      totalAmount: 0n,
      pendingCount: 0,
      pendingAmount: 0n
    }
  );

  return stats;
}
