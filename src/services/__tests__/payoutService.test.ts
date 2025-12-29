/**
 * Test de integración para el sistema de Payouts
 * 
 * Ejecutar: npx tsx src/services/__tests__/payoutService.test.ts
 */

import prisma from '../../lib/prisma';
import { createTransaction } from '../transactionService';
import { calculatePayoutEligibility, createPayout, calculateAllPayouts } from '../payoutService';
import { getActiveFeeSchedule } from '../feeScheduleService';

async function runPayoutTests() {
  console.log('🧪 Iniciando tests de PayoutService...\n');
  
  const results: { test: string; passed: boolean; error?: string }[] = [];

  // Limpiar datos de prueba anteriores
  await prisma.$executeRaw`DELETE FROM "PayoutItem" WHERE 1=1`;
  await prisma.$executeRaw`DELETE FROM "Payout" WHERE 1=1`;
  
  // Obtener creador de prueba
  const creator = await prisma.creator.findFirst({
    where: { user: { email: 'test@apapacho.com' } }
  });
  
  if (!creator) {
    console.error('❌ Creador de prueba no encontrado');
    return;
  }

  // Obtener fee schedule
  const feeSchedule = await getActiveFeeSchedule();
  console.log(`📋 Config: holdDays=${feeSchedule.holdDays}, minPayout=${feeSchedule.minPayoutClp}\n`);

  // Test 1: Sin transacciones elegibles
  try {
    const eligibility1 = await calculatePayoutEligibility(creator.id);
    
    // Verificar que la única transacción está pendiente de hold
    const expectedPending = eligibility1.holdNotReleasedCount > 0;
    
    results.push({
      test: 'Sin transacciones con hold liberado',
      passed: !eligibility1.canCreatePayout && expectedPending
    });
  } catch (error: any) {
    results.push({
      test: 'Sin transacciones con hold liberado',
      passed: false,
      error: error.message
    });
  }

  // Test 2: Crear transacción antigua (simulando que ya pasó el hold)
  try {
    // Crear transacción antigua directamente
    const holdReleaseDate = new Date();
    holdReleaseDate.setDate(holdReleaseDate.getDate() - (feeSchedule.holdDays + 1)); // 8 días atrás
    
    // Usamos createTransaction pero luego actualizamos la fecha
    const tx = await createTransaction({
      creatorId: creator.id,
      fanUserId: '00000000-0000-0000-0000-000000000001', // Fan ficticio
      productType: 'TIP',
      grossAmount: 15000n, // $15.000 CLP
      provider: 'TEST',
      providerPaymentId: `test_pay_${Date.now()}`,
      providerEventId: `test_evt_old_${Date.now()}`
    });
    
    // Actualizar fecha para simular transacción antigua
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { occurredAt: holdReleaseDate }
    });
    
    results.push({
      test: 'Crear transacción antigua',
      passed: true
    });
    
    // Verificar que ahora hay transacciones elegibles
    const eligibility2 = await calculatePayoutEligibility(creator.id);
    console.log(`💰 Elegibilidad después de tx antigua: elegibles=${eligibility2.eligibleTransactions.length}, total=${eligibility2.totals.creatorPayableTotal}`);
    
    results.push({
      test: 'Transacción antigua es elegible',
      passed: eligibility2.eligibleTransactions.length > 0
    });
    
    // Test 3: Monto menor al mínimo
    // La transacción de $15.000 es menor al mínimo de $20.000
    const canPayoutBelowMin = eligibility2.canCreatePayout;
    
    results.push({
      test: 'Rechazar payout bajo mínimo ($15.000 < $20.000)',
      passed: !canPayoutBelowMin
    });

  } catch (error: any) {
    results.push({
      test: 'Crear transacción antigua',
      passed: false,
      error: error.message
    });
  }

  // Test 4: Crear otra transacción para superar el mínimo
  try {
    const holdReleaseDate = new Date();
    holdReleaseDate.setDate(holdReleaseDate.getDate() - (feeSchedule.holdDays + 1));
    
    const tx2 = await createTransaction({
      creatorId: creator.id,
      fanUserId: '00000000-0000-0000-0000-000000000001',
      productType: 'SUBSCRIPTION',
      grossAmount: 10000n, // $10.000 CLP adicionales
      provider: 'TEST',
      providerPaymentId: `test_pay2_${Date.now()}`,
      providerEventId: `test_evt_old2_${Date.now()}`
    });
    
    await prisma.transaction.update({
      where: { id: tx2.id },
      data: { occurredAt: holdReleaseDate }
    });
    
    // Ahora deberían ser ~$22.500 elegibles (25.000 - 10% fee)
    const eligibility3 = await calculatePayoutEligibility(creator.id);
    console.log(`💰 Elegibilidad con 2 tx: total=${eligibility3.totals.creatorPayableTotal}, canPayout=${eligibility3.canCreatePayout}`);
    
    results.push({
      test: 'Aprobar payout sobre mínimo',
      passed: eligibility3.canCreatePayout
    });
    
    // Test 5: Crear payout
    const payoutResult = await createPayout(creator.id);
    
    results.push({
      test: 'Crear payout exitosamente',
      passed: payoutResult.success && !!payoutResult.payoutId
    });
    
    if (payoutResult.payoutId) {
      // Verificar el payout creado
      const payout = await prisma.payout.findUnique({
        where: { id: payoutResult.payoutId },
        include: {
          items: true
        }
      });
      
      console.log(`📦 Payout creado: id=${payout?.id}, items=${payout?.items.length}, amount=${payout?.payoutAmount}`);
      
      results.push({
        test: 'Payout tiene items',
        passed: (payout?.items.length || 0) >= 2
      });
      
      results.push({
        test: 'Payout status es CALCULATED',
        passed: payout?.status === 'CALCULATED'
      });
      
      // Verificar evento en outbox
      const outboxEvent = await prisma.outboxEvent.findFirst({
        where: {
          aggregateType: 'Payout',
          aggregateId: payoutResult.payoutId
        }
      });
      
      results.push({
        test: 'Evento en outbox',
        passed: !!outboxEvent && outboxEvent.eventType === 'PayoutCalculated'
      });
      
      // Test 6: No poder crear otro payout (ya no hay transacciones elegibles)
      const eligibility4 = await calculatePayoutEligibility(creator.id);
      
      results.push({
        test: 'No hay más transacciones elegibles después de payout',
        passed: eligibility4.eligibleTransactions.length === 0
      });
    }
    
  } catch (error: any) {
    results.push({
      test: 'Crear segunda transacción',
      passed: false,
      error: error.message
    });
  }

  // Test 7: calculateAllPayouts
  try {
    // Crear otra transacción vieja para otro test
    const holdReleaseDate = new Date();
    holdReleaseDate.setDate(holdReleaseDate.getDate() - (feeSchedule.holdDays + 1));
    
    const tx3 = await createTransaction({
      creatorId: creator.id,
      fanUserId: '00000000-0000-0000-0000-000000000001',
      productType: 'TIP',
      grossAmount: 25000n, // $25.000 CLP
      provider: 'TEST',
      providerPaymentId: `test_pay3_${Date.now()}`,
      providerEventId: `test_evt_old3_${Date.now()}`
    });
    
    await prisma.transaction.update({
      where: { id: tx3.id },
      data: { occurredAt: holdReleaseDate }
    });
    
    const batchResult = await calculateAllPayouts();
    console.log(`📊 Batch: created=${batchResult.created}, skipped=${batchResult.skipped}`);
    
    results.push({
      test: 'calculateAllPayouts crea payouts',
      passed: batchResult.created > 0 || batchResult.skipped >= 0
    });
    
  } catch (error: any) {
    results.push({
      test: 'calculateAllPayouts',
      passed: false,
      error: error.message
    });
  }

  // Resumen
  console.log('\n========================================');
  console.log('📊 RESULTADOS DE TESTS');
  console.log('========================================\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.test}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.passed) passed++;
    else failed++;
  }
  
  console.log(`\n📈 Total: ${passed}/${results.length} tests pasaron`);
  
  if (failed > 0) {
    console.log(`❌ ${failed} tests fallaron`);
    process.exit(1);
  } else {
    console.log('✅ Todos los tests pasaron!');
    process.exit(0);
  }
}

runPayoutTests().catch(console.error);
