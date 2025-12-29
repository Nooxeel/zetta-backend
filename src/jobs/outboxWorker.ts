/**
 * OutboxWorker - Job que procesa eventos del outbox periódicamente
 * 
 * Puede ejecutarse de varias formas:
 * 1. Como proceso independiente: npx tsx src/jobs/outboxWorker.ts
 * 2. Integrado en el servidor Express con setInterval
 * 3. Como cron job externo llamando al endpoint admin
 * 
 * Configuración via env vars:
 * - OUTBOX_PUBLISHER_TYPE: 'console' | 'webhook'
 * - OUTBOX_WEBHOOK_URL: URL del webhook destino
 * - OUTBOX_WEBHOOK_SECRET: Secret para firmar eventos
 * - OUTBOX_POLL_INTERVAL_MS: Intervalo de polling (default: 5000)
 * - OUTBOX_BATCH_SIZE: Eventos por batch (default: 100)
 */

import {
  createPublisher,
  processOutboxEvents,
  getOutboxStats,
  cleanupPublishedEvents,
  type PublisherConfig
} from '../services/outboxPublisher';

// Configuración desde env
const config: PublisherConfig = {
  type: (process.env.OUTBOX_PUBLISHER_TYPE as 'console' | 'webhook') || 'console',
  webhookUrl: process.env.OUTBOX_WEBHOOK_URL,
  webhookSecret: process.env.OUTBOX_WEBHOOK_SECRET
};

const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || '5000');
const BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH_SIZE || '100');
const MAX_RETRIES = parseInt(process.env.OUTBOX_MAX_RETRIES || '5');

let isRunning = false;
let shouldStop = false;

/**
 * Ejecuta un ciclo de procesamiento
 */
export async function runOnce(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const publisher = createPublisher(config);
  return processOutboxEvents(publisher, {
    batchSize: BATCH_SIZE,
    maxRetries: MAX_RETRIES
  });
}

/**
 * Inicia el worker en modo loop
 */
export async function startWorker(): Promise<void> {
  if (isRunning) {
    console.log('[OutboxWorker] Ya está corriendo');
    return;
  }

  isRunning = true;
  shouldStop = false;
  
  console.log(`[OutboxWorker] Iniciando...`);
  console.log(`  Publisher: ${config.type}`);
  console.log(`  Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  Max retries: ${MAX_RETRIES}`);

  const publisher = createPublisher(config);

  while (!shouldStop) {
    try {
      const result = await processOutboxEvents(publisher, {
        batchSize: BATCH_SIZE,
        maxRetries: MAX_RETRIES
      });

      if (result.processed > 0 || result.failed > 0) {
        console.log(
          `[OutboxWorker] Procesados: ${result.processed}, ` +
          `Fallidos: ${result.failed}`
        );
      }

      if (result.errors.length > 0) {
        console.error('[OutboxWorker] Errores:', result.errors);
      }
    } catch (error) {
      console.error('[OutboxWorker] Error en ciclo:', error);
    }

    // Esperar antes del siguiente ciclo
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  isRunning = false;
  console.log('[OutboxWorker] Detenido');
}

/**
 * Detiene el worker
 */
export function stopWorker(): void {
  console.log('[OutboxWorker] Deteniendo...');
  shouldStop = true;
}

/**
 * Limpieza de eventos antiguos (ejecutar periódicamente)
 */
export async function cleanup(olderThanDays: number = 30): Promise<void> {
  const count = await cleanupPublishedEvents(olderThanDays);
  console.log(`[OutboxWorker] Limpiados ${count} eventos antiguos`);
}

/**
 * Muestra estadísticas
 */
export async function showStats(): Promise<void> {
  const stats = await getOutboxStats();
  console.log('[OutboxWorker] Estadísticas:');
  console.log(`  Pendientes: ${stats.pending}`);
  console.log(`  Publicados: ${stats.published}`);
  console.log(`  Fallidos: ${stats.failed}`);
  console.log(`  Por tipo:`, stats.byEventType);
}

// Si se ejecuta directamente como script
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case 'run':
      // Ejecutar una vez y salir
      runOnce()
        .then(result => {
          console.log('Resultado:', result);
          process.exit(0);
        })
        .catch(error => {
          console.error('Error:', error);
          process.exit(1);
        });
      break;

    case 'stats':
      showStats()
        .then(() => process.exit(0))
        .catch(error => {
          console.error('Error:', error);
          process.exit(1);
        });
      break;

    case 'cleanup':
      const days = parseInt(process.argv[3] || '30');
      cleanup(days)
        .then(() => process.exit(0))
        .catch(error => {
          console.error('Error:', error);
          process.exit(1);
        });
      break;

    case 'start':
    default:
      // Modo worker continuo
      process.on('SIGINT', () => {
        stopWorker();
      });
      process.on('SIGTERM', () => {
        stopWorker();
      });
      
      startWorker().catch(error => {
        console.error('Error fatal:', error);
        process.exit(1);
      });
      break;
  }
}
