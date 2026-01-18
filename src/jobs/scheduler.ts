/**
 * Scheduler - Sistema de jobs programados para el backend
 * 
 * Jobs disponibles:
 * 1. Outbox Publisher - cada minuto (procesa eventos pendientes)
 * 2. Payout Calculation - semanal (domingos 2am)
 * 3. Outbox Cleanup - diario (3am, limpia eventos >30 días)
 * 4. Payout Retry - cada hora (reintenta payouts fallidos)
 * 5. Subscription Renewal - diario (6am, procesa renovaciones y expiraciones)
 * 
 * Configuración via env:
 * - ENABLE_JOBS: 'true' | 'false' (default: true)
 * - OUTBOX_CRON: expresión cron (default: '* * * * *' = cada minuto)
 * - PAYOUT_CRON: expresión cron (default: '0 2 * * 0' = domingos 2am)
 * - CLEANUP_CRON: expresión cron (default: '0 3 * * *' = diario 3am)
 * - RENEWAL_CRON: expresión cron (default: '0 6 * * *' = diario 6am)
 */

import cron, { ScheduledTask } from 'node-cron';
import { 
  createPublisher, 
  processOutboxEvents, 
  cleanupPublishedEvents,
  type PublisherConfig 
} from '../services/outboxPublisher';
import { calculateAllPayouts, getPayoutsPendingRetry } from '../services/payoutService';
import { processSubscriptionRenewals } from '../services/subscriptionRenewalService';
import prisma from '../lib/prisma';

// Configuración
const ENABLE_JOBS = process.env.ENABLE_JOBS !== 'false';
const OUTBOX_CRON = process.env.OUTBOX_CRON || '* * * * *'; // Cada minuto
const PAYOUT_CRON = process.env.PAYOUT_CRON || '0 2 * * 0'; // Domingos 2am
const CLEANUP_CRON = process.env.CLEANUP_CRON || '0 3 * * *'; // Diario 3am
const RETRY_CRON = process.env.RETRY_CRON || '0 * * * *'; // Cada hora
const RENEWAL_CRON = process.env.RENEWAL_CRON || '0 6 * * *'; // Diario 6am

// Publisher config
const publisherConfig: PublisherConfig = {
  type: (process.env.OUTBOX_PUBLISHER_TYPE as 'console' | 'webhook') || 'console',
  webhookUrl: process.env.OUTBOX_WEBHOOK_URL,
  webhookSecret: process.env.OUTBOX_WEBHOOK_SECRET
};

// Estado de jobs activos
const jobs: Record<string, ScheduledTask> = {};

/**
 * Job 1: Procesar eventos del outbox
 */
function outboxPublisherJob() {
  const publisher = createPublisher(publisherConfig);
  
  jobs.outbox = cron.schedule(OUTBOX_CRON, async () => {
    try {
      const result = await processOutboxEvents(publisher, {
        batchSize: 100,
        maxRetries: 5
      });
      
      if (result.processed > 0 || result.failed > 0) {
        console.log(
          `[Job:Outbox] Procesados: ${result.processed}, ` +
          `Fallidos: ${result.failed}`
        );
      }
      
      if (result.errors.length > 0) {
        console.error('[Job:Outbox] Errores:', result.errors.slice(0, 3));
      }
    } catch (error) {
      console.error('[Job:Outbox] Error:', error);
    }
  });
  
  console.log(`✅ Job 'outboxPublisher' iniciado: ${OUTBOX_CRON}`);
}

/**
 * Job 2: Calcular payouts semanalmente
 */
function payoutCalculationJob() {
  jobs.payout = cron.schedule(PAYOUT_CRON, async () => {
    console.log('[Job:Payout] Iniciando cálculo semanal...');
    
    try {
      const result = await calculateAllPayouts();
      
      console.log(
        `[Job:Payout] Completado - ` +
        `Creados: ${result.created}, ` +
        `Omitidos: ${result.skipped}, ` +
        `Errores: ${result.errors}`
      );
      
      // Crear registro en outbox para auditoría
      await prisma.outboxEvent.create({
        data: {
          aggregateType: 'System',
          aggregateId: 'payout-calculation-job',
          eventType: 'PayoutCalculationJobCompleted',
          payload: {
            eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            eventType: 'PayoutCalculationJobCompleted',
            occurredAt: new Date().toISOString(),
            result: {
              created: result.created,
              skipped: result.skipped,
              errors: result.errors
            }
          }
        }
      });
    } catch (error) {
      console.error('[Job:Payout] Error:', error);
    }
  });
  
  console.log(`✅ Job 'payoutCalculation' iniciado: ${PAYOUT_CRON}`);
}

/**
 * Job 3: Limpiar eventos antiguos del outbox
 */
function outboxCleanupJob() {
  jobs.cleanup = cron.schedule(CLEANUP_CRON, async () => {
    console.log('[Job:Cleanup] Limpiando eventos antiguos...');
    
    try {
      const count = await cleanupPublishedEvents(30);
      console.log(`[Job:Cleanup] Limpiados ${count} eventos`);
    } catch (error) {
      console.error('[Job:Cleanup] Error:', error);
    }
  });
  
  console.log(`✅ Job 'outboxCleanup' iniciado: ${CLEANUP_CRON}`);
}

/**
 * Job 4: Reintentar payouts fallidos
 */
function payoutRetryJob() {
  jobs.retry = cron.schedule(RETRY_CRON, async () => {
    try {
      const pending = await getPayoutsPendingRetry();
      
      if (pending.length === 0) {
        return;
      }
      
      console.log(`[Job:Retry] ${pending.length} payouts pendientes de reintento`);
      
      // TODO: Implementar lógica de reenvío al procesador de pagos
      // Por ahora solo logueamos
      for (const payout of pending) {
        console.log(
          `[Job:Retry] Payout ${payout.id}: ` +
          `creador=${payout.creatorId}, ` +
          `monto=${payout.payoutAmount}, ` +
          `intentos=${payout.retryCount}`
        );
      }
    } catch (error) {
      console.error('[Job:Retry] Error:', error);
    }
  });
  
  console.log(`✅ Job 'payoutRetry' iniciado: ${RETRY_CRON}`);
}

/**
 * Job 5: Procesar renovaciones y expiraciones de suscripciones
 */
function subscriptionRenewalJob() {
  jobs.renewal = cron.schedule(RENEWAL_CRON, async () => {
    console.log('[Job:Renewal] Procesando renovaciones de suscripciones...');
    
    try {
      const result = await processSubscriptionRenewals();
      
      console.log(
        `[Job:Renewal] Completado - ` +
        `Expiradas: ${result.expired}, ` +
        `Renovadas: ${result.renewed}, ` +
        `Recordatorios: ${result.reminded}, ` +
        `Errores: ${result.errors}`
      );
      
      // Crear registro en outbox para auditoría
      await prisma.outboxEvent.create({
        data: {
          aggregateType: 'System',
          aggregateId: 'subscription-renewal-job',
          eventType: 'SubscriptionRenewalJobCompleted',
          payload: {
            eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            eventType: 'SubscriptionRenewalJobCompleted',
            occurredAt: new Date().toISOString(),
            result: {
              expired: result.expired,
              renewed: result.renewed,
              reminded: result.reminded,
              errors: result.errors
            }
          }
        }
      });
    } catch (error) {
      console.error('[Job:Renewal] Error:', error);
    }
  });
  
  console.log(`✅ Job 'subscriptionRenewal' iniciado: ${RENEWAL_CRON}`);
}

/**
 * Inicia todos los jobs
 */
export function startScheduler(): void {
  if (!ENABLE_JOBS) {
    console.log('⚠️  Jobs deshabilitados (ENABLE_JOBS=false)');
    return;
  }
  
  console.log('\n🕐 Iniciando Scheduler...');
  console.log(`Publisher: ${publisherConfig.type}`);
  
  outboxPublisherJob();
  payoutCalculationJob();
  outboxCleanupJob();
  payoutRetryJob();
  subscriptionRenewalJob();
  
  console.log('');
}

/**
 * Detiene todos los jobs
 */
export function stopScheduler(): void {
  console.log('🛑 Deteniendo Scheduler...');
  
  for (const [name, job] of Object.entries(jobs)) {
    job.stop();
    console.log(`  ✓ Job '${name}' detenido`);
  }
}

/**
 * Ejecuta un job específico manualmente
 */
export async function runJobManually(jobName: string): Promise<void> {
  console.log(`[Manual] Ejecutando job: ${jobName}`);
  
  switch (jobName) {
    case 'outbox':
      const publisher = createPublisher(publisherConfig);
      const result = await processOutboxEvents(publisher, { batchSize: 100 });
      console.log(`[Manual] Outbox result:`, result);
      break;
      
    case 'payout':
      const payoutResult = await calculateAllPayouts();
      console.log(`[Manual] Payout result:`, payoutResult);
      break;
      
    case 'cleanup':
      const count = await cleanupPublishedEvents(30);
      console.log(`[Manual] Cleanup: ${count} eventos limpiados`);
      break;
      
    case 'retry':
      const pending = await getPayoutsPendingRetry();
      console.log(`[Manual] Retry: ${pending.length} payouts pendientes`);
      break;
      
    case 'renewal':
      const renewalResult = await processSubscriptionRenewals();
      console.log(`[Manual] Renewal result:`, renewalResult);
      break;
      
    default:
      throw new Error(`Job desconocido: ${jobName}`);
  }
}

/**
 * Obtiene el estado de los jobs
 */
export function getSchedulerStatus(): {
  enabled: boolean;
  jobs: Array<{
    name: string;
    cron: string;
    running: boolean;
  }>;
} {
  return {
    enabled: ENABLE_JOBS,
    jobs: [
      { name: 'outboxPublisher', cron: OUTBOX_CRON, running: !!jobs.outbox },
      { name: 'payoutCalculation', cron: PAYOUT_CRON, running: !!jobs.payout },
      { name: 'outboxCleanup', cron: CLEANUP_CRON, running: !!jobs.cleanup },
      { name: 'payoutRetry', cron: RETRY_CRON, running: !!jobs.retry },
      { name: 'subscriptionRenewal', cron: RENEWAL_CRON, running: !!jobs.renewal }
    ]
  };
}

// Manejo de shutdown graceful
process.on('SIGINT', () => {
  stopScheduler();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopScheduler();
  process.exit(0);
});
