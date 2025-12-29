/**
 * Seed para FeeSchedule inicial
 * Ejecutar: npx tsx prisma/seeds/fee-schedule-seed.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding FeeSchedule...');

  // Crear tarifa inicial vigente desde ahora
  const feeSchedule = await prisma.feeSchedule.upsert({
    where: { id: 'initial-fee-schedule-2024' },
    update: {},
    create: {
      id: 'initial-fee-schedule-2024',
      effectiveFrom: new Date('2024-01-01T00:00:00Z'),
      standardPlatformFeeBps: 1000, // 10%
      vipPlatformFeeBps: 700,       // 7%
      holdDays: 7,
      minPayoutClp: BigInt(20000),  // $20.000 CLP
      payoutFrequency: 'WEEKLY',
      description: 'Tarifa inicial de lanzamiento',
      createdBy: 'SYSTEM',
    },
  });

  console.log('✅ FeeSchedule creado:', {
    id: feeSchedule.id,
    standardFee: `${feeSchedule.standardPlatformFeeBps / 100}%`,
    vipFee: `${feeSchedule.vipPlatformFeeBps / 100}%`,
    holdDays: feeSchedule.holdDays,
    minPayout: `$${feeSchedule.minPayoutClp.toString()} CLP`,
  });
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
