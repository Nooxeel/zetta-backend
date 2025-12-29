/**
 * LedgerService - Asientos contables de doble partida
 * 
 * INVARIANTE: Para cada transacción, sum(debit) = sum(credit)
 */

import prisma from '../lib/prisma';
import type { Prisma, LedgerAccount } from '@prisma/client';

// Códigos de cuentas contables
export const LEDGER_CODES = {
  CASH_PROCESSOR_CLEARING: 'CASH_PROCESSOR_CLEARING',
  CREATOR_PAYABLE: 'CREATOR_PAYABLE',
  PLATFORM_REVENUE: 'PLATFORM_REVENUE',
  PROCESSOR_FEE_EXPENSE: 'PROCESSOR_FEE_EXPENSE',
  CHARGEBACK_LOSS: 'CHARGEBACK_LOSS',
  PAYOUT_PENDING: 'PAYOUT_PENDING',
  REFUND_EXPENSE: 'REFUND_EXPENSE',
} as const;

type LedgerCode = typeof LEDGER_CODES[keyof typeof LEDGER_CODES];

// Cache de cuentas (se carga una vez)
let accountsCache: Map<string, string> | null = null;

/**
 * Obtiene el ID de una cuenta por su código
 */
async function getAccountId(code: LedgerCode): Promise<string> {
  if (!accountsCache) {
    const accounts = await prisma.ledgerAccount.findMany();
    accountsCache = new Map(accounts.map(a => [a.code, a.id]));
  }
  
  const id = accountsCache.get(code);
  if (!id) {
    throw new Error(`Cuenta contable ${code} no encontrada. Ejecuta el seed.`);
  }
  return id;
}

/**
 * Limpia el cache (útil para tests)
 */
export function clearAccountsCache(): void {
  accountsCache = null;
}

export interface LedgerEntryInput {
  accountCode: LedgerCode;
  creatorId?: string;
  debit?: bigint;
  credit?: bigint;
  description?: string;
}

/**
 * Crea asientos contables para una transacción exitosa
 * 
 * Asientos típicos:
 * - Debit CASH_PROCESSOR_CLEARING (entra dinero del procesador)
 * - Credit PLATFORM_REVENUE (nuestra comisión)
 * - Credit CREATOR_PAYABLE (lo que le debemos al creador)
 */
export async function createTransactionLedgerEntries(
  tx: Prisma.TransactionClient,
  transactionId: string,
  grossAmount: bigint,
  platformFeeAmount: bigint,
  creatorPayableAmount: bigint,
  creatorId: string,
  processorFeeAmount: bigint = 0n
): Promise<void> {
  const entries: LedgerEntryInput[] = [
    // Dinero que entra del procesador
    {
      accountCode: LEDGER_CODES.CASH_PROCESSOR_CLEARING,
      debit: grossAmount,
      description: 'Pago recibido del procesador'
    },
    // Nuestra comisión (revenue)
    {
      accountCode: LEDGER_CODES.PLATFORM_REVENUE,
      credit: platformFeeAmount,
      description: 'Comisión de plataforma'
    },
    // Lo que debemos al creador
    {
      accountCode: LEDGER_CODES.CREATOR_PAYABLE,
      creatorId,
      credit: creatorPayableAmount,
      description: 'Pendiente de pago al creador'
    }
  ];

  // Si hay fee del procesador, registrarlo
  if (processorFeeAmount > 0n) {
    entries.push({
      accountCode: LEDGER_CODES.PROCESSOR_FEE_EXPENSE,
      debit: processorFeeAmount,
      description: 'Comisión del procesador de pagos'
    });
  }

  // Validar que suma = 0
  const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0n), 0n);
  const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0n), 0n);
  
  if (totalDebit !== totalCredit) {
    throw new Error(
      `Ledger desbalanceado: debit=${totalDebit}, credit=${totalCredit}. ` +
      `Diferencia: ${totalDebit - totalCredit}`
    );
  }

  // Crear los asientos
  for (const entry of entries) {
    const accountId = await getAccountId(entry.accountCode);
    await tx.ledgerEntry.create({
      data: {
        transactionId,
        accountId,
        creatorId: entry.creatorId,
        debit: entry.debit || 0n,
        credit: entry.credit || 0n,
        description: entry.description,
        currency: 'CLP'
      }
    });
  }
}

/**
 * Crea asientos para un chargeback
 * Revierte el impacto de la transacción original
 */
export async function createChargebackLedgerEntries(
  tx: Prisma.TransactionClient,
  transactionId: string,
  chargebackAmount: bigint,
  creatorId: string
): Promise<void> {
  const entries: LedgerEntryInput[] = [
    // Sale dinero del clearing
    {
      accountCode: LEDGER_CODES.CASH_PROCESSOR_CLEARING,
      credit: chargebackAmount,
      description: 'Chargeback - dinero devuelto'
    },
    // Pérdida por chargeback (o podría venir del creador)
    {
      accountCode: LEDGER_CODES.CHARGEBACK_LOSS,
      debit: chargebackAmount,
      description: 'Pérdida por chargeback'
    }
  ];

  // Validar balance
  const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0n), 0n);
  const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0n), 0n);
  
  if (totalDebit !== totalCredit) {
    throw new Error(`Ledger chargeback desbalanceado`);
  }

  for (const entry of entries) {
    const accountId = await getAccountId(entry.accountCode);
    await tx.ledgerEntry.create({
      data: {
        transactionId,
        accountId,
        creatorId: entry.creatorId,
        debit: entry.debit || 0n,
        credit: entry.credit || 0n,
        description: entry.description,
        currency: 'CLP'
      }
    });
  }
}

/**
 * Obtiene el balance de una cuenta para un creador
 */
export async function getCreatorBalance(creatorId: string): Promise<{
  payable: bigint;
  paid: bigint;
  pending: bigint;
}> {
  const payableAccountId = await getAccountId(LEDGER_CODES.CREATOR_PAYABLE);
  
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      creatorId,
      accountId: payableAccountId
    }
  });

  // En CREATOR_PAYABLE: credit = lo que debemos, debit = lo que pagamos
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0n);
  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0n);
  
  return {
    payable: totalCredit - totalDebit, // Balance actual (lo que debemos)
    paid: totalDebit,                   // Total pagado históricamente
    pending: totalCredit                // Total acumulado históricamente
  };
}

/**
 * Verifica la integridad del ledger para una transacción
 */
export async function verifyTransactionLedger(transactionId: string): Promise<boolean> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { transactionId }
  });

  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0n);
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0n);
  
  return totalDebit === totalCredit;
}
