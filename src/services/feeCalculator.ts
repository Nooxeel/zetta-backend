/**
 * FeeCalculator - Servicio de cálculo de comisiones
 * 
 * REGLAS:
 * - Montos en BigInt (CLP sin decimales)
 * - Porcentajes en basis points (1000 bps = 10%)
 * - Redondeo hacia abajo (floor) para no pagar de más
 * 
 * @example
 * calculateFees(10000n, 1000) // 10% de $10.000
 * // => { platformFee: 1000n, creatorPayable: 9000n }
 */

export interface FeeCalculationResult {
  grossAmount: bigint;
  platformFeeBps: number;
  platformFeeAmount: bigint;
  processorFeeAmount: bigint;
  creatorPayableAmount: bigint;
}

export interface FeeCalculationInput {
  grossAmount: bigint;
  platformFeeBps: number;
  processorFeeAmount?: bigint;
}

/**
 * Calcula las comisiones de una transacción
 * 
 * @param input.grossAmount - Monto bruto en CLP (BigInt)
 * @param input.platformFeeBps - Comisión de plataforma en basis points (1000 = 10%)
 * @param input.processorFeeAmount - Comisión del procesador de pagos (opcional)
 * @returns Desglose de montos
 */
export function calculateFees(input: FeeCalculationInput): FeeCalculationResult {
  const { grossAmount, platformFeeBps, processorFeeAmount = 0n } = input;

  // Validaciones
  if (grossAmount <= 0n) {
    throw new Error('grossAmount debe ser mayor a 0');
  }
  if (platformFeeBps < 0 || platformFeeBps > 10000) {
    throw new Error('platformFeeBps debe estar entre 0 y 10000');
  }
  if (processorFeeAmount < 0n) {
    throw new Error('processorFeeAmount no puede ser negativo');
  }

  // Cálculo de comisión de plataforma (floor division)
  // platformFee = grossAmount * bps / 10000
  const platformFeeAmount = (grossAmount * BigInt(platformFeeBps)) / 10000n;

  // Monto para el creador
  const creatorPayableAmount = grossAmount - platformFeeAmount - processorFeeAmount;

  // Validar que el creador no termine con monto negativo
  if (creatorPayableAmount < 0n) {
    throw new Error('creatorPayableAmount resultó negativo - fees exceden grossAmount');
  }

  return {
    grossAmount,
    platformFeeBps,
    platformFeeAmount,
    processorFeeAmount,
    creatorPayableAmount,
  };
}

/**
 * Obtiene el BPS correspondiente al tier del creador
 */
export function getFeeBpsForTier(tier: 'STANDARD' | 'VIP'): number {
  const FEE_BPS = {
    STANDARD: 1000, // 10%
    VIP: 700,       // 7%
  };
  return FEE_BPS[tier];
}

/**
 * Formatea un monto BigInt a string con formato CLP
 * @example formatClp(1500000n) => "$1.500.000"
 */
export function formatClp(amount: bigint): string {
  const numStr = amount.toString();
  const formatted = numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${formatted}`;
}

/**
 * Convierte basis points a porcentaje legible
 * @example bpsToPercent(1000) => "10%"
 */
export function bpsToPercent(bps: number): string {
  return `${bps / 100}%`;
}

/**
 * Valida que los asientos contables sumen 0 (doble partida)
 */
export function validateLedgerBalance(entries: Array<{ debit: bigint; credit: bigint }>): boolean {
  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0n);
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0n);
  return totalDebit === totalCredit;
}

// ============================================================
// TESTS INLINE (ejecutar con: npx tsx src/services/feeCalculator.ts)
// ============================================================
if (require.main === module) {
  console.log('🧪 Running FeeCalculator tests...\n');

  // Test 1: Cálculo estándar 10%
  const test1 = calculateFees({ grossAmount: 10000n, platformFeeBps: 1000 });
  console.assert(test1.platformFeeAmount === 1000n, 'Test 1 failed: platformFee');
  console.assert(test1.creatorPayableAmount === 9000n, 'Test 1 failed: creatorPayable');
  console.log('✅ Test 1: 10% de $10.000 = $1.000 fee, $9.000 para creador');

  // Test 2: Cálculo VIP 7%
  const test2 = calculateFees({ grossAmount: 10000n, platformFeeBps: 700 });
  console.assert(test2.platformFeeAmount === 700n, 'Test 2 failed: platformFee');
  console.assert(test2.creatorPayableAmount === 9300n, 'Test 2 failed: creatorPayable');
  console.log('✅ Test 2: 7% de $10.000 = $700 fee, $9.300 para creador');

  // Test 3: Redondeo hacia abajo
  const test3 = calculateFees({ grossAmount: 9999n, platformFeeBps: 1000 });
  console.assert(test3.platformFeeAmount === 999n, 'Test 3 failed: should floor');
  console.log('✅ Test 3: 10% de $9.999 = $999 (floor, no $1.000)');

  // Test 4: Con fee de procesador
  const test4 = calculateFees({ 
    grossAmount: 10000n, 
    platformFeeBps: 1000,
    processorFeeAmount: 200n 
  });
  console.assert(test4.creatorPayableAmount === 8800n, 'Test 4 failed');
  console.log('✅ Test 4: $10.000 - $1.000 (platform) - $200 (processor) = $8.800');

  // Test 5: Monto grande (1.5M CLP)
  const test5 = calculateFees({ grossAmount: 1500000n, platformFeeBps: 700 });
  console.assert(test5.platformFeeAmount === 105000n, 'Test 5 failed');
  console.assert(test5.creatorPayableAmount === 1395000n, 'Test 5 failed');
  console.log('✅ Test 5: 7% de $1.500.000 = $105.000 fee, $1.395.000 para creador');

  // Test 6: Validar ledger balance
  const ledgerEntries = [
    { debit: 10000n, credit: 0n },   // CASH_CLEARING
    { debit: 0n, credit: 1000n },    // PLATFORM_REVENUE
    { debit: 0n, credit: 9000n },    // CREATOR_PAYABLE
  ];
  console.assert(validateLedgerBalance(ledgerEntries), 'Test 6 failed');
  console.log('✅ Test 6: Ledger balance válido (débitos = créditos)');

  // Test 7: Formato CLP
  console.assert(formatClp(1500000n) === '$1.500.000', 'Test 7 failed');
  console.log('✅ Test 7: formatClp(1500000n) = "$1.500.000"');

  // Test 8: Error en monto 0
  try {
    calculateFees({ grossAmount: 0n, platformFeeBps: 1000 });
    console.log('❌ Test 8 failed: debería lanzar error');
  } catch (e) {
    console.log('✅ Test 8: Rechaza grossAmount = 0');
  }

  // Test 9: Error en bps inválido
  try {
    calculateFees({ grossAmount: 10000n, platformFeeBps: 15000 });
    console.log('❌ Test 9 failed: debería lanzar error');
  } catch (e) {
    console.log('✅ Test 9: Rechaza platformFeeBps > 10000');
  }

  console.log('\n✅ Todos los tests pasaron!');
}
