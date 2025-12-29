# Sistema de Jobs y Scheduler

Sistema automatizado de tareas programadas para el backend de Apapacho.

## Jobs Disponibles

### 1. Outbox Publisher
- **Frecuencia**: Cada minuto (configurable)
- **Función**: Procesa eventos del outbox y los publica
- **Cron**: `* * * * *`
- **Configurable via**: `OUTBOX_CRON`

### 2. Payout Calculation
- **Frecuencia**: Semanal (domingos 2am)
- **Función**: Calcula payouts para todos los creadores elegibles
- **Cron**: `0 2 * * 0`
- **Configurable via**: `PAYOUT_CRON`

### 3. Outbox Cleanup
- **Frecuencia**: Diario (3am)
- **Función**: Limpia eventos del outbox publicados hace >30 días
- **Cron**: `0 3 * * *`
- **Configurable via**: `CLEANUP_CRON`

### 4. Payout Retry
- **Frecuencia**: Cada hora
- **Función**: Identifica payouts fallidos pendientes de reintento
- **Cron**: `0 * * * *`
- **Configurable via**: `RETRY_CRON`

## Variables de Entorno

```bash
# Habilitar/deshabilitar jobs
ENABLE_JOBS=true

# Configuración de cron jobs (sintaxis cron)
OUTBOX_CRON="* * * * *"         # Cada minuto
PAYOUT_CRON="0 2 * * 0"         # Domingos 2am
CLEANUP_CRON="0 3 * * *"        # Diario 3am
RETRY_CRON="0 * * * *"          # Cada hora

# Publisher config
OUTBOX_PUBLISHER_TYPE=console   # 'console' | 'webhook'
OUTBOX_WEBHOOK_URL=             # URL si type=webhook
OUTBOX_WEBHOOK_SECRET=          # Secret para firmar eventos
```

## Sintaxis Cron

```
┌───────────── minuto (0-59)
│ ┌───────────── hora (0-23)
│ │ ┌───────────── día del mes (1-31)
│ │ │ ┌───────────── mes (1-12)
│ │ │ │ ┌───────────── día de la semana (0-6, 0=domingo)
│ │ │ │ │
* * * * *
```

### Ejemplos:
- `* * * * *` - Cada minuto
- `*/5 * * * *` - Cada 5 minutos
- `0 * * * *` - Cada hora
- `0 0 * * *` - Diario a medianoche
- `0 2 * * 0` - Domingos a las 2am
- `0 9 * * 1-5` - Lunes a viernes a las 9am

## API Endpoints

### Ver estado del scheduler
```bash
GET /api/jobs/status
```

Respuesta:
```json
{
  "enabled": true,
  "jobs": [
    {
      "name": "outboxPublisher",
      "cron": "* * * * *",
      "running": true
    },
    {
      "name": "payoutCalculation",
      "cron": "0 2 * * 0",
      "running": true
    }
  ]
}
```

### Ejecutar job manualmente (Admin)
```bash
POST /api/admin/jobs/run/:jobName
```

Jobs disponibles:
- `outbox` - Procesar outbox
- `payout` - Calcular payouts
- `cleanup` - Limpiar eventos antiguos
- `retry` - Verificar payouts fallidos

Ejemplo:
```bash
curl -X POST http://localhost:3001/api/admin/jobs/run/payout
```

## Ejecución Manual (CLI)

También puedes ejecutar jobs desde la línea de comandos:

```bash
# Worker en modo continuo (loop infinito)
npx tsx src/jobs/outboxWorker.ts start

# Ejecutar una vez y salir
npx tsx src/jobs/outboxWorker.ts run

# Ver estadísticas
npx tsx src/jobs/outboxWorker.ts stats

# Limpiar eventos antiguos
npx tsx src/jobs/outboxWorker.ts cleanup 30  # días
```

## Monitoreo

### Logs
Los jobs escriben logs en stdout con prefijo `[Job:NombreJob]`:

```
[Job:Outbox] Procesados: 5, Fallidos: 0
[Job:Payout] Completado - Creados: 3, Omitidos: 12, Errores: 0
[Job:Cleanup] Limpiados 142 eventos
```

### Eventos de Auditoría
Los jobs importantes (como cálculo de payouts) crean eventos en el outbox para auditoría:

```sql
SELECT * FROM "OutboxEvent" 
WHERE "eventType" = 'PayoutCalculationJobCompleted'
ORDER BY "createdAt" DESC;
```

## Despliegue en Producción

### Opción 1: Scheduler Integrado (Recomendado)
El servidor Express inicia automáticamente el scheduler. Solo asegúrate de:

```bash
ENABLE_JOBS=true
```

### Opción 2: Jobs Separados (Escalable)
Para mayor escalabilidad, ejecuta jobs en procesos separados:

1. **Servidor API** (sin jobs):
```bash
ENABLE_JOBS=false npm start
```

2. **Worker de Outbox** (en otro contenedor/servidor):
```bash
npx tsx src/jobs/outboxWorker.ts start
```

3. **Cron Jobs** (usando crontab del sistema):
```bash
# crontab -e
0 2 * * 0 cd /app && npx tsx src/jobs/scheduler.ts payout
0 3 * * * cd /app && npx tsx src/jobs/scheduler.ts cleanup
```

### Opción 3: Servicios Externos
Para mayor robustez, usa servicios especializados:

- **AWS EventBridge** - Para cron jobs
- **Google Cloud Scheduler** - Para jobs programados
- **Temporal.io** - Para workflows complejos
- **Bull/BullMQ** - Para colas con Redis

## Troubleshooting

### Jobs no se ejecutan
1. Verificar que `ENABLE_JOBS=true`
2. Ver estado: `GET /api/jobs/status`
3. Revisar logs del servidor

### Outbox crece demasiado
1. Verificar que el publisher funciona: `POST /api/admin/outbox/process`
2. Ver stats: `GET /api/admin/outbox/stats`
3. Ejecutar cleanup manualmente: `POST /api/admin/outbox/cleanup`

### Payouts no se calculan
1. Verificar que hay transacciones elegibles (hold liberado)
2. Ver mínimo de payout en fee schedule ($20.000 CLP)
3. Ejecutar manualmente: `POST /api/admin/jobs/run/payout`

## Alertas y Notificaciones

Para recibir alertas sobre fallos:

1. Configura un webhook externo:
```bash
OUTBOX_PUBLISHER_TYPE=webhook
OUTBOX_WEBHOOK_URL=https://tu-servicio.com/webhooks/payments
OUTBOX_WEBHOOK_SECRET=tu_secret
```

2. Tu servicio recibirá eventos como:
```json
{
  "id": "evt_...",
  "type": "PayoutCalculated",
  "aggregateType": "Payout",
  "aggregateId": "payout_id",
  "payload": { ... },
  "occurredAt": "2025-12-27T18:00:00Z"
}
```

3. Implementa lógica para enviar notificaciones (email, Slack, etc.)
