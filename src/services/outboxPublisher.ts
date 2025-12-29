/**
 * OutboxPublisher - Procesa eventos del outbox y los publica
 * 
 * El patrón Outbox garantiza que:
 * 1. Los eventos se escriben en la misma transacción que el cambio de estado
 * 2. Un worker separado los publica al sistema de mensajería
 * 3. Si falla la publicación, se reintenta
 * 
 * Destinos soportados:
 * - Webhook HTTP
 * - Console (desarrollo)
 * - Redis (futuro)
 * - AWS SNS/SQS (futuro)
 */

import prisma from '../lib/prisma';

export interface PublisherConfig {
  type: 'webhook' | 'console' | 'redis';
  webhookUrl?: string;
  webhookSecret?: string;
  redisUrl?: string;
}

export interface PublishResult {
  success: boolean;
  error?: string;
}

/**
 * Publisher base - interfaz para diferentes destinos
 */
export interface EventPublisher {
  publish(event: OutboxEventData): Promise<PublishResult>;
}

export interface OutboxEventData {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: any;
  createdAt: Date;
}

/**
 * Publisher de consola (desarrollo)
 */
export class ConsolePublisher implements EventPublisher {
  async publish(event: OutboxEventData): Promise<PublishResult> {
    console.log(`[OutboxEvent] ${event.eventType}`, {
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload
    });
    return { success: true };
  }
}

/**
 * Publisher HTTP Webhook
 */
export class WebhookPublisher implements EventPublisher {
  constructor(
    private webhookUrl: string,
    private secret?: string
  ) {}

  async publish(event: OutboxEventData): Promise<PublishResult> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Event-Type': event.eventType,
        'X-Aggregate-Type': event.aggregateType,
        'X-Event-Id': event.id
      };

      // Agregar firma si hay secret configurado
      if (this.secret) {
        const crypto = await import('crypto');
        const signature = crypto
          .createHmac('sha256', this.secret)
          .update(JSON.stringify(event.payload))
          .digest('hex');
        headers['X-Webhook-Signature'] = signature;
      }

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: event.id,
          type: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
          occurredAt: event.createdAt.toISOString()
        })
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${await response.text()}`
        };
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * Obtener publisher según configuración
 */
export function createPublisher(config: PublisherConfig): EventPublisher {
  switch (config.type) {
    case 'webhook':
      if (!config.webhookUrl) {
        throw new Error('webhookUrl es requerido para type=webhook');
      }
      return new WebhookPublisher(config.webhookUrl, config.webhookSecret);
    
    case 'console':
    default:
      return new ConsolePublisher();
  }
}

/**
 * Procesa eventos pendientes del outbox
 */
export async function processOutboxEvents(
  publisher: EventPublisher,
  options: {
    batchSize?: number;
    maxRetries?: number;
  } = {}
): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const { batchSize = 100, maxRetries = 5 } = options;
  
  // Obtener eventos pendientes
  const pendingEvents = await prisma.outboxEvent.findMany({
    where: {
      publishedAt: null,
      retryCount: { lt: maxRetries }
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize
  });

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const event of pendingEvents) {
    const eventData: OutboxEventData = {
      id: event.id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.payload as any,
      createdAt: event.createdAt
    };

    const result = await publisher.publish(eventData);

    if (result.success) {
      // Marcar como publicado
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date() }
      });
      processed++;
    } else {
      // Incrementar retry count
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          retryCount: { increment: 1 },
          lastError: result.error
        }
      });
      failed++;
      errors.push(`Event ${event.id}: ${result.error}`);
    }
  }

  return { processed, failed, errors };
}

/**
 * Obtiene estadísticas del outbox
 */
export async function getOutboxStats(): Promise<{
  pending: number;
  published: number;
  failed: number;
  byEventType: Record<string, number>;
}> {
  const [pending, published, failed, byType] = await Promise.all([
    prisma.outboxEvent.count({
      where: { publishedAt: null, retryCount: { lt: 5 } }
    }),
    prisma.outboxEvent.count({
      where: { publishedAt: { not: null } }
    }),
    prisma.outboxEvent.count({
      where: { publishedAt: null, retryCount: { gte: 5 } }
    }),
    prisma.outboxEvent.groupBy({
      by: ['eventType'],
      _count: true,
      where: { publishedAt: null }
    })
  ]);

  const byEventType: Record<string, number> = {};
  for (const item of byType) {
    byEventType[item.eventType] = item._count;
  }

  return { pending, published, failed, byEventType };
}

/**
 * Limpia eventos antiguos ya publicados
 */
export async function cleanupPublishedEvents(
  olderThanDays: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await prisma.outboxEvent.deleteMany({
    where: {
      publishedAt: { not: null },
      createdAt: { lt: cutoffDate }
    }
  });

  return result.count;
}

/**
 * Reintenta eventos fallidos (reset retry count)
 */
export async function retryFailedEvents(): Promise<number> {
  const result = await prisma.outboxEvent.updateMany({
    where: {
      publishedAt: null,
      retryCount: { gte: 5 }
    },
    data: {
      retryCount: 0,
      lastError: null
    }
  });

  return result.count;
}
