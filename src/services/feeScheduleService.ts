/**
 * FeeScheduleService - Obtener tarifas vigentes
 */

import prisma from '../lib/prisma';
import type { FeeSchedule, CreatorTier } from '@prisma/client';

export interface ActiveFeeSchedule {
  id: string;
  standardFeeBps: number;
  vipFeeBps: number;
  holdDays: number;
  minPayoutClp: bigint;
  payoutFrequency: string;
}

/**
 * Obtiene la tarifa vigente para una fecha dada
 * Busca la más reciente donde effectiveFrom <= fecha
 */
export async function getActiveFeeSchedule(asOf: Date = new Date()): Promise<ActiveFeeSchedule> {
  const schedule = await prisma.feeSchedule.findFirst({
    where: {
      effectiveFrom: { lte: asOf }
    },
    orderBy: {
      effectiveFrom: 'desc'
    }
  });

  if (!schedule) {
    throw new Error('No hay FeeSchedule configurado. Ejecuta el seed primero.');
  }

  return {
    id: schedule.id,
    standardFeeBps: schedule.standardPlatformFeeBps,
    vipFeeBps: schedule.vipPlatformFeeBps,
    holdDays: schedule.holdDays,
    minPayoutClp: schedule.minPayoutClp,
    payoutFrequency: schedule.payoutFrequency,
  };
}

/**
 * Obtiene el BPS correspondiente al tier del creador
 */
export async function getFeeBpsForCreator(creatorId: string): Promise<{
  feeBps: number;
  tier: CreatorTier;
  feeScheduleId: string;
}> {
  const [creator, schedule] = await Promise.all([
    prisma.creator.findUnique({
      where: { id: creatorId },
      select: { tier: true }
    }),
    getActiveFeeSchedule()
  ]);

  if (!creator) {
    throw new Error(`Creador ${creatorId} no encontrado`);
  }

  const feeBps = creator.tier === 'VIP' 
    ? schedule.vipFeeBps 
    : schedule.standardFeeBps;

  return {
    feeBps,
    tier: creator.tier,
    feeScheduleId: schedule.id
  };
}

/**
 * Calcula la fecha límite para que una transacción sea elegible para payout
 * (fecha actual - holdDays)
 */
export async function getHoldReleaseDate(): Promise<Date> {
  const schedule = await getActiveFeeSchedule();
  const releaseDate = new Date();
  releaseDate.setDate(releaseDate.getDate() - schedule.holdDays);
  return releaseDate;
}
