# 🚀 Ejecución Fase por Fase - Sistema de Pagos

## ⚠️ REGLAS ANTI-CUELGUE

1. **NUNCA usar `npm run dev`** - tsx watch se cuelga
2. **SIEMPRE usar `npx tsx src/index.ts`** directamente
3. **Matar procesos antes de iniciar:**
   ```bash
   pkill -f "tsx" 2>/dev/null; sleep 2
   ```
4. **Un cambio = un test = un commit**

---

## FASE 0: Preparación (5 min)

### 0.1 Limpiar procesos
```bash
cd /Users/zippy/Desktop/apapacho-backend
pkill -f "tsx" 2>/dev/null
pkill -f "node.*index" 2>/dev/null
sleep 2
echo "✅ Procesos limpiados"
```

### 0.2 Verificar PostgreSQL
```bash
docker ps | grep postgres
# Si no está corriendo:
# docker start apapacho-postgres
```

### 0.3 Backup de BD
```bash
docker exec apapacho-postgres pg_dump -U postgres apapacho > backup_$(date +%Y%m%d_%H%M%S).sql
echo "✅ Backup creado"
```

---

## FASE 1: Modelos Base (30 min)

### 1.1 Agregar Enums al schema.prisma
Copiar los enums de `schema-payments.prisma` al inicio del `schema.prisma`.

### 1.2 Modificar modelo Creator existente
Agregar campos:
```prisma
// En el modelo Creator existente, agregar:
tier              CreatorTier    @default(STANDARD)
tierEffectiveFrom DateTime       @default(now())
status            CreatorStatus  @default(ACTIVE)
```

### 1.3 Agregar modelos nuevos (en orden)
1. `FeeSchedule`
2. `CreatorBankAccount`
3. `CreatorTierHistory`
4. `Product`

### 1.4 Aplicar migración
```bash
cd /Users/zippy/Desktop/apapacho-backend
npx prisma db push --accept-data-loss
# O si prefieres migración formal:
# npx prisma migrate dev --name add_payment_models_phase1
```

### 1.5 Verificar
```bash
npx prisma studio
# Verificar que las tablas existen
```

### 1.6 Seed FeeSchedule inicial
```bash
npx tsx prisma/seeds/fee-schedule-seed.ts
```

### ✅ Checkpoint Fase 1
- [ ] Enums creados
- [ ] Creator tiene tier/status
- [ ] FeeSchedule, CreatorBankAccount, Product existen
- [ ] FeeSchedule tiene registro inicial

---

## FASE 2: Sistema de Transacciones (45 min)

### 2.1 Agregar modelos
1. `LedgerAccount`
2. `LedgerEntry`
3. `Transaction`

### 2.2 Aplicar migración
```bash
npx prisma db push
```

### 2.3 Seed LedgerAccounts
```bash
npx tsx prisma/seeds/ledger-accounts-seed.ts
```

### 2.4 Crear servicio de cálculo
Crear `src/services/feeCalculator.ts`

### 2.5 Test unitario
```bash
npx tsx src/services/__tests__/feeCalculator.test.ts
```

### ✅ Checkpoint Fase 2
- [ ] Transaction, LedgerAccount, LedgerEntry existen
- [ ] LedgerAccounts tiene datos seed
- [ ] feeCalculator.ts funciona
- [ ] Test pasa

---

## FASE 3: Sistema de Payouts (30 min)

### 3.1 Agregar modelos
1. `Payout`
2. `PayoutItem`
3. `Chargeback`

### 3.2 Aplicar migración
```bash
npx prisma db push
```

### 3.3 Crear servicio de elegibilidad
Crear `src/services/payoutEligibility.ts`

### ✅ Checkpoint Fase 3
- [ ] Payout, PayoutItem, Chargeback existen
- [ ] Query de elegibilidad funciona

---

## FASE 4: Outbox (20 min)

### 4.1 Agregar modelo
1. `OutboxEvent`

### 4.2 Crear tipos de eventos
Crear `src/types/events.ts`

### ✅ Checkpoint Fase 4
- [ ] OutboxEvent existe
- [ ] Tipos TypeScript definidos

---

## FASE 5: API (1 hora)

### 5.1 Crear rutas
- `src/routes/payments.ts` - Webhooks
- `src/routes/balance.ts` - Balance de creador

### 5.2 Crear servicios
- `src/services/transactionService.ts`
- `src/services/ledgerService.ts`

### 5.3 Probar con curl
```bash
# Iniciar servidor (sin watch)
npx tsx src/index.ts &
sleep 3

# Test balance
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@apapacho.com","password":"test1234"}' | jq -r '.token')

curl -s http://localhost:3001/api/creator/balance \
  -H "Authorization: Bearer $TOKEN" | jq

# Matar servidor
pkill -f "tsx"
```

### ✅ Checkpoint Fase 5
- [ ] Endpoint balance funciona
- [ ] Endpoint transactions funciona

---

## FASE 6: Jobs (30 min)

### 6.1 Crear job de cálculo de payout
`src/jobs/calculatePayouts.ts`

### 6.2 Test manual
```bash
npx tsx src/jobs/calculatePayouts.ts
```

### ✅ Checkpoint Fase 6
- [ ] Job ejecuta sin errores
- [ ] Payout se crea correctamente

---

## 📋 Checklist Final

### Base de Datos
- [ ] Todos los modelos creados
- [ ] Índices aplicados
- [ ] Seeds ejecutados

### Servicios
- [ ] FeeCalculator
- [ ] TransactionService
- [ ] LedgerService
- [ ] PayoutService

### API
- [ ] GET /api/creator/balance
- [ ] GET /api/creator/transactions
- [ ] GET /api/creator/payouts
- [ ] POST /api/webhooks/payment

### Jobs
- [ ] Payout calculation
- [ ] Outbox publisher

---

## 🆘 Troubleshooting

### Si tsx se cuelga
```bash
pkill -9 -f "tsx"
pkill -9 -f "node"
sleep 3
```

### Si Prisma falla
```bash
npx prisma generate
npx prisma db push --force-reset  # ⚠️ BORRA DATOS
```

### Si hay error de tipos
```bash
npx prisma generate
# Reiniciar TypeScript server en VSCode: Cmd+Shift+P > "Restart TS Server"
```
