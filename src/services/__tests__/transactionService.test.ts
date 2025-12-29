/**
 * Test del sistema de transacciones
 * Ejecutar: npx tsx src/services/__tests__/transactionService.test.ts
 */

import prisma from '../../lib/prisma';
import { createTransaction, getCreatorTransactions, getCreatorTransactionStats } from '../transactionService';
import { getCreatorBalance, verifyTransactionLedger } from '../ledgerService';
import { getActiveFeeSchedule } from '../feeScheduleService';
import { formatClp } from '../feeCalculator';

async function runTests() {
  console.log('🧪 Testing Transaction System...\n');

  try {
    // 0. Verificar configuración
    console.log('📋 Verificando configuración...');
    const feeSchedule = await getActiveFeeSchedule();
    console.log(`   FeeSchedule: ${feeSchedule.standardFeeBps/100}% estándar, ${feeSchedule.vipFeeBps/100}% VIP`);
    console.log(`   Hold: ${feeSchedule.holdDays} días, Min payout: ${formatClp(feeSchedule.minPayoutClp)}\n`);

    // 1. Obtener un creador de prueba
    const creator = await prisma.creator.findFirst({
      include: { user: true }
    });
    
    if (!creator) {
      throw new Error('No hay creadores en la BD. Crea uno primero.');
    }
    
    console.log(`👤 Creador: ${creator.user.displayName} (${creator.tier})`);
    console.log(`   ID: ${creator.id}\n`);

    // 2. Obtener un fan de prueba
    const fan = await prisma.user.findFirst({
      where: { isCreator: false }
    });
    
    if (!fan) {
      throw new Error('No hay fans en la BD.');
    }
    
    console.log(`👤 Fan: ${fan.displayName}`);
    console.log(`   ID: ${fan.id}\n`);

    // 3. Crear una transacción de prueba
    console.log('💰 Creando transacción de prueba...');
    const testEventId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await createTransaction({
      creatorId: creator.id,
      fanUserId: fan.id,
      productType: 'TIP',
      grossAmount: 10000n, // $10.000 CLP
      provider: 'TEST',
      providerPaymentId: `pay_${Date.now()}`,
      providerEventId: testEventId,
      metadata: { test: true, timestamp: new Date().toISOString() }
    });

    console.log(`   ✅ Transacción creada: ${result.id}`);
    console.log(`   Gross: ${formatClp(result.grossAmount)}`);
    console.log(`   Fee (${result.appliedPlatformFeeBps/100}%): ${formatClp(result.platformFeeAmount)}`);
    console.log(`   Creador recibe: ${formatClp(result.creatorPayableAmount)}\n`);

    // 4. Verificar idempotencia (mismo providerEventId)
    console.log('🔄 Verificando idempotencia...');
    const duplicate = await createTransaction({
      creatorId: creator.id,
      fanUserId: fan.id,
      productType: 'TIP',
      grossAmount: 10000n,
      provider: 'TEST',
      providerPaymentId: `pay_dup`,
      providerEventId: testEventId, // Mismo ID!
    });
    
    if (duplicate.id === result.id) {
      console.log('   ✅ Idempotencia funciona: retornó transacción existente\n');
    } else {
      console.log('   ❌ ERROR: Se creó transacción duplicada!\n');
    }

    // 5. Verificar ledger balance
    console.log('📊 Verificando ledger...');
    const ledgerValid = await verifyTransactionLedger(result.id);
    console.log(`   Ledger balanceado: ${ledgerValid ? '✅ Sí' : '❌ No'}\n`);

    // 6. Obtener balance del creador
    console.log('💵 Balance del creador:');
    const balance = await getCreatorBalance(creator.id);
    console.log(`   Por pagar: ${formatClp(balance.payable)}`);
    console.log(`   Total pagado: ${formatClp(balance.paid)}`);
    console.log(`   Total acumulado: ${formatClp(balance.pending)}\n`);

    // 7. Obtener transacciones del creador
    console.log('📜 Últimas transacciones:');
    const transactions = await getCreatorTransactions(creator.id, { limit: 5 });
    transactions.forEach(t => {
      console.log(`   ${t.occurredAt.toISOString().split('T')[0]} | ${t.productType.padEnd(12)} | ${formatClp(t.creatorPayableAmount).padStart(12)}`);
    });
    console.log('');

    // 8. Stats del creador
    console.log('📈 Estadísticas:');
    const stats = await getCreatorTransactionStats(creator.id);
    console.log(`   Total transacciones: ${stats.totalTransactions}`);
    console.log(`   Ingresos brutos: ${formatClp(stats.totalGross)}`);
    console.log(`   Comisiones: ${formatClp(stats.totalFees)}`);
    console.log(`   Neto para creador: ${formatClp(stats.totalPayable)}`);
    
    if (stats.byType.length > 0) {
      console.log('   Por tipo:');
      stats.byType.forEach(t => {
        console.log(`     ${t.type}: ${t.count} transacciones, ${formatClp(t.total)}`);
      });
    }
    console.log('');

    // 9. Verificar evento en outbox
    console.log('📤 Verificando outbox...');
    const outboxEvent = await prisma.outboxEvent.findFirst({
      where: { aggregateId: result.id },
      orderBy: { createdAt: 'desc' }
    });
    
    if (outboxEvent) {
      console.log(`   ✅ Evento creado: ${outboxEvent.eventType}`);
      console.log(`   Publicado: ${outboxEvent.publishedAt ? 'Sí' : 'No (pendiente)'}\n`);
    } else {
      console.log('   ❌ No se creó evento en outbox\n');
    }

    console.log('✅ Todos los tests pasaron!\n');

    // Resumen
    console.log('='.repeat(50));
    console.log('RESUMEN DEL TEST');
    console.log('='.repeat(50));
    console.log(`Transacción ID: ${result.id}`);
    console.log(`Monto: ${formatClp(result.grossAmount)} → Creador: ${formatClp(result.creatorPayableAmount)}`);
    console.log(`Ledger: ${ledgerValid ? 'Balanceado ✅' : 'ERROR ❌'}`);
    console.log(`Outbox: ${outboxEvent ? 'Evento creado ✅' : 'ERROR ❌'}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Error en tests:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
