# 💰 Plan de Implementación: Sistema de Comisiones y Pagos

## Resumen Ejecutivo
Sistema de comisiones con modelo 10% estándar / 7% VIP, ledger de doble partida, y payouts semanales con 7 días de retención.

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLUJO DE DINERO                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   FAN PAGA $10.000 CLP                                         │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────┐    webhook    ┌──────────────────┐           │
│   │  TRANSBANK  │ ───────────▶  │  /webhooks/pay   │           │
│   └─────────────┘               └────────┬─────────┘           │
│                                          │                      │
│                                          ▼                      │
│   ┌─────────────────────────────────────────────────────┐      │
│   │              TRANSACCIÓN (en 1 TX de BD)            │      │
│   │  ┌─────────────────────────────────────────────┐    │      │
│   │  │ 1. Validar idempotencia (provider_event_id) │    │      │
│   │  │ 2. Obtener fee_schedule vigente             │    │      │
│   │  │ 3. Calcular: 10.000 * 1000 / 10000 = 1.000  │    │      │
│   │  │ 4. INSERT transactions (inmutable)          │    │      │
│   │  │ 5. INSERT ledger_entries (3 asientos)       │    │      │
│   │  │ 6. INSERT outbox_events                     │    │      │
│   │  └─────────────────────────────────────────────┘    │      │
│   └─────────────────────────────────────────────────────┘      │
│                                                                 │
│   LEDGER ENTRIES (suma = 0):                                   │
│   ┌────────────────────────────────┬────────┬─────────┐        │
│   │ Cuenta                         │ Débito │ Crédito │        │
│   ├────────────────────────────────┼────────┼─────────┤        │
│   │ CASH_PROCESSOR_CLEARING        │ 10.000 │    0    │        │
│   │ PLATFORM_REVENUE               │    0   │  1.000  │        │
│   │ CREATOR_PAYABLE                │    0   │  9.000  │        │
│   └────────────────────────────────┴────────┴─────────┘        │
│                                                                 │
│   7 DÍAS DESPUÉS (hold liberado)                               │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────┐    CRON JOB    ┌──────────────────┐          │
│   │ SALDO >= $20K│ ───────────▶  │  Crear PAYOUT    │          │
│   └─────────────┘                └────────┬─────────┘          │
│                                           │                     │
│                                           ▼                     │
│   ┌─────────────────────────────────────────────────────┐      │
│   │  TRANSFERENCIA A CUENTA BANCARIA DEL CREADOR        │      │
│   └─────────────────────────────────────────────────────┘      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Variables del Sistema

```typescript
const PAYMENT_CONFIG = {
  // Comisiones (en basis points: 100 bps = 1%)
  STANDARD_FEE_BPS: 1000,  // 10%
  VIP_FEE_BPS: 700,        // 7%
  
  // Retención y pagos
  HOLD_DAYS: 7,
  MIN_PAYOUT_CLP: 20000,
  PAYOUT_FREQUENCY: 'WEEKLY',
  
  // Moneda
  CURRENCY: 'CLP',
  
  // Requisitos VIP
  VIP_MIN_MONTHLY_REVENUE: 1500000,  // $1.500.000 CLP
  VIP_MIN_CONSECUTIVE_MONTHS: 3,
  VIP_MIN_SUBSCRIBERS: 500,
};
```

---

## 🗓️ Fases de Implementación

### FASE 0: Preparación ⏱️ 30 min
- [ ] Revisar schema Prisma actual
- [ ] Identificar conflictos con modelos existentes
- [ ] Backup de base de datos

### FASE 1: Modelos Base ⏱️ 2 horas
**Sin lógica de negocio, solo estructura**

```
Modelos a crear:
├── FeeSchedule (tarifas versionadas)
├── CreatorBankAccount (datos bancarios)
├── Product (suscripciones, PPV, tips)
└── CreatorTierHistory (auditoría de cambios VIP)
```

**Entregables:**
- schema.prisma actualizado
- Migración ejecutada
- Seed de fee_schedule inicial

### FASE 2: Sistema de Transacciones ⏱️ 3 horas
**Core del sistema financiero**

```
Modelos a crear:
├── Transaction (pagos exitosos)
├── LedgerAccount (catálogo de cuentas)
└── LedgerEntry (asientos contables)
```

**Entregables:**
- Modelos en Prisma
- Seed de LedgerAccounts
- Función de cálculo de fees
- Tests unitarios de cálculo

### FASE 3: Sistema de Payouts ⏱️ 2 horas
**Pagos a creadores**

```
Modelos a crear:
├── Payout (pagos programados)
├── PayoutItem (detalle por transacción)
└── Chargeback (contracargos)
```

**Entregables:**
- Modelos en Prisma
- Query de transacciones elegibles
- Lógica de hold de 7 días

### FASE 4: Outbox y Eventos ⏱️ 1.5 horas
**Consistencia eventual**

```
Modelos a crear:
└── OutboxEvent (cola de eventos)

Eventos:
├── TransactionCreated
├── PayoutCalculated
├── PayoutSent
├── PayoutFailed
└── ChargebackReceived
```

**Entregables:**
- Modelo OutboxEvent
- Tipos de eventos TypeScript
- Worker de publicación (básico)

### FASE 5: API y Servicios ⏱️ 4 horas
**Endpoints y lógica de negocio**

```
Servicios:
├── PaymentService (crear transacciones)
├── PayoutService (calcular y ejecutar payouts)
├── FeeService (obtener tarifa vigente)
└── LedgerService (crear asientos)

Rutas:
├── POST /api/webhooks/transbank
├── GET  /api/creator/balance
├── GET  /api/creator/transactions
├── GET  /api/creator/payouts
└── POST /api/admin/payouts/calculate (manual trigger)
```

### FASE 6: Jobs y Automatización ⏱️ 2 horas
**Procesos programados**

```
Jobs:
├── PayoutCalculationJob (semanal)
├── OutboxPublisherJob (cada minuto)
└── PayoutExecutionJob (post-cálculo)
```

---

## 🔐 Consideraciones de Seguridad

### Datos Sensibles (encriptar)
- `account_number` en CreatorBankAccount
- `account_holder_rut` en CreatorBankAccount

### Validaciones Críticas
- RUT chileno: formato `XX.XXX.XXX-X`
- Idempotencia: rechazar duplicados silenciosamente
- Firma webhook: validar HMAC de Transbank

### Rate Limiting
- Webhooks: 100 req/min por IP
- API creator: 60 req/min por usuario

---

## 📐 Fórmulas de Cálculo

```typescript
// Cálculo de comisión (SIEMPRE redondear hacia abajo)
function calculateFees(grossAmount: bigint, feeBps: number): {
  platformFee: bigint;
  creatorPayable: bigint;
} {
  // floor division para no pagar de más por redondeo
  const platformFee = (grossAmount * BigInt(feeBps)) / BigInt(10000);
  const creatorPayable = grossAmount - platformFee;
  
  return { platformFee, creatorPayable };
}

// Ejemplo: $10.000 CLP con 10% (1000 bps)
// platformFee = 10000 * 1000 / 10000 = 1000
// creatorPayable = 10000 - 1000 = 9000
```

---

## 🧪 Testing por Fase

### Fase 1-3: Unit Tests
```typescript
describe('FeeCalculation', () => {
  it('should calculate 10% for STANDARD tier', () => {
    const result = calculateFees(BigInt(10000), 1000);
    expect(result.platformFee).toBe(BigInt(1000));
    expect(result.creatorPayable).toBe(BigInt(9000));
  });
  
  it('should calculate 7% for VIP tier', () => {
    const result = calculateFees(BigInt(10000), 700);
    expect(result.platformFee).toBe(BigInt(700));
    expect(result.creatorPayable).toBe(BigInt(9300));
  });
  
  it('should floor on odd amounts', () => {
    // $9.999 * 10% = 999.9 → floor to 999
    const result = calculateFees(BigInt(9999), 1000);
    expect(result.platformFee).toBe(BigInt(999));
  });
});
```

### Fase 4-5: Integration Tests
```typescript
describe('TransactionCreation', () => {
  it('should create transaction with ledger entries atomically');
  it('should reject duplicate provider_event_id');
  it('should use correct fee_schedule for current date');
});
```

### Fase 6: E2E Tests
```typescript
describe('PayoutFlow', () => {
  it('should include only transactions with released hold');
  it('should skip payout if below minimum');
  it('should create correct ledger entries on payout');
});
```

---

## 🚦 Criterios de Éxito por Fase

| Fase | Criterio |
|------|----------|
| 1 | `prisma db push` exitoso, seed ejecutado |
| 2 | Test de cálculo de fees pasa |
| 3 | Query de elegibilidad funciona |
| 4 | Eventos se insertan en outbox |
| 5 | API devuelve balance correcto |
| 6 | Job de payout corre sin errores |

---

## ⚠️ Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| tsx watch se cuelga | Usar `npx tsx` directo, reiniciar limpio |
| Inconsistencia en ledger | Transacción atómica, validar suma = 0 |
| Doble procesamiento webhook | Idempotencia por provider_event_id |
| Chargeback post-payout | Saldo negativo permitido, ajuste en siguiente payout |

---

## 📝 Checklist Pre-Implementación

- [ ] Backend corriendo estable (`npx tsx src/index.ts`)
- [ ] PostgreSQL accesible
- [ ] Backup de base de datos actual
- [ ] Este documento revisado y aprobado

---

## 🎯 Orden de Ejecución

```
FASE 0 → FASE 1 → TEST → FASE 2 → TEST → FASE 3 → TEST → ...
         ↓
    Si falla: revisar, corregir, reintentar
         ↓
    Si pasa: commit + siguiente fase
```

**REGLA DE ORO:** Cada fase debe compilar y correr antes de pasar a la siguiente.
