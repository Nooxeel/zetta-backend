/**
 * Seed para LedgerAccounts (catálogo de cuentas contables)
 * Ejecutar: npx tsx prisma/seeds/ledger-accounts-seed.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LEDGER_ACCOUNTS = [
  {
    code: 'CASH_PROCESSOR_CLEARING',
    name: 'Efectivo en Procesador (Clearing)',
    type: 'ASSET',
  },
  {
    code: 'CREATOR_PAYABLE',
    name: 'Por Pagar a Creadores',
    type: 'LIABILITY',
  },
  {
    code: 'PLATFORM_REVENUE',
    name: 'Ingresos de Plataforma (Comisiones)',
    type: 'REVENUE',
  },
  {
    code: 'PROCESSOR_FEE_EXPENSE',
    name: 'Gastos por Comisión de Procesador',
    type: 'EXPENSE',
  },
  {
    code: 'CHARGEBACK_LOSS',
    name: 'Pérdidas por Contracargos',
    type: 'EXPENSE',
  },
  {
    code: 'PAYOUT_PENDING',
    name: 'Pagos Pendientes de Envío',
    type: 'LIABILITY',
  },
  {
    code: 'REFUND_EXPENSE',
    name: 'Gastos por Reembolsos',
    type: 'EXPENSE',
  },
];

async function main() {
  console.log('🌱 Seeding LedgerAccounts...');

  for (const account of LEDGER_ACCOUNTS) {
    const created = await prisma.ledgerAccount.upsert({
      where: { code: account.code },
      update: { name: account.name, type: account.type },
      create: {
        code: account.code,
        name: account.name,
        type: account.type,
      },
    });
    console.log(`  ✅ ${created.code} - ${created.name}`);
  }

  console.log(`\n✅ ${LEDGER_ACCOUNTS.length} cuentas contables creadas`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
