/**
 * Tipos de eventos para el sistema de pagos
 * Estos eventos se guardan en outbox_events y se publican asincrónicamente
 */

// ============================================================
// TIPOS BASE
// ============================================================

export type EventType = 
  | 'TransactionCreated'
  | 'TransactionRefunded'
  | 'PayoutCalculated'
  | 'PayoutSent'
  | 'PayoutFailed'
  | 'ChargebackReceived'
  | 'ChargebackResolved'
  | 'CreatorTierChanged';

export type AggregateType = 
  | 'Transaction'
  | 'Payout'
  | 'Chargeback'
  | 'Creator';

export interface BaseEvent {
  eventId: string;
  eventType: EventType;
  occurredAt: string; // ISO 8601
}

// ============================================================
// TRANSACTION EVENTS
// ============================================================

export interface TransactionCreatedEvent extends BaseEvent {
  eventType: 'TransactionCreated';
  transaction: {
    id: string;
    creatorId: string;
    fanUserId: string;
    productId: string | null;
    productType: 'SUBSCRIPTION' | 'PPV' | 'TIP';
    currency: string;
    grossAmount: number; // En JSON usamos number, en BD BigInt
    appliedFeeScheduleId: string;
    appliedPlatformFeeBps: number;
    platformFeeAmount: number;
    processorFeeAmount: number;
    creatorPayableAmount: number;
    provider: string;
    providerPaymentId: string;
    providerEventId: string;
  };
  ledgerEntries: Array<{
    accountCode: string;
    debit: number;
    credit: number;
  }>;
}

export interface TransactionRefundedEvent extends BaseEvent {
  eventType: 'TransactionRefunded';
  transactionId: string;
  refundAmount: number;
  reason: string;
}

// ============================================================
// PAYOUT EVENTS
// ============================================================

export interface PayoutCalculatedEvent extends BaseEvent {
  eventType: 'PayoutCalculated';
  payout: {
    id: string;
    creatorId: string;
    periodStart: string;
    periodEnd: string;
    currency: string;
    grossTotal: number;
    platformFeeTotal: number;
    adjustmentsTotal: number;
    payoutAmount: number;
  };
  config: {
    minPayoutClp: number;
    holdDays: number;
  };
  includedTransactionIds: string[];
  excludedReason: {
    holdNotReleasedCount: number;
    belowMinPayout: boolean;
  } | null;
}

export interface PayoutSentEvent extends BaseEvent {
  eventType: 'PayoutSent';
  payoutId: string;
  creatorId: string;
  amount: number;
  providerTransferId: string;
  sentAt: string;
}

export interface PayoutFailedEvent extends BaseEvent {
  eventType: 'PayoutFailed';
  payoutId: string;
  creatorId: string;
  amount: number;
  failureReason: string;
  retryCount: number;
  nextRetryAt: string | null;
}

// ============================================================
// CHARGEBACK EVENTS
// ============================================================

export interface ChargebackReceivedEvent extends BaseEvent {
  eventType: 'ChargebackReceived';
  chargeback: {
    id: string;
    transactionId: string;
    provider: string;
    providerCaseId: string;
    amount: number;
    reason: string | null;
    status: 'RECEIVED';
  };
  originalTransaction: {
    id: string;
    creatorId: string;
    grossAmount: number;
  };
}

export interface ChargebackResolvedEvent extends BaseEvent {
  eventType: 'ChargebackResolved';
  chargebackId: string;
  transactionId: string;
  resolution: 'WON' | 'LOST' | 'REVERSED';
  adjustmentAmount: number;
}

// ============================================================
// CREATOR EVENTS
// ============================================================

export interface CreatorTierChangedEvent extends BaseEvent {
  eventType: 'CreatorTierChanged';
  creatorId: string;
  previousTier: 'STANDARD' | 'VIP';
  newTier: 'STANDARD' | 'VIP';
  reason: string;
  changedBy: string; // userId o 'SYSTEM'
}

// ============================================================
// UNION TYPE
// ============================================================

export type PaymentEvent =
  | TransactionCreatedEvent
  | TransactionRefundedEvent
  | PayoutCalculatedEvent
  | PayoutSentEvent
  | PayoutFailedEvent
  | ChargebackReceivedEvent
  | ChargebackResolvedEvent
  | CreatorTierChangedEvent;

// ============================================================
// HELPERS
// ============================================================

/**
 * Crea un ID único para evento
 */
export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Crea timestamp ISO para evento
 */
export function eventTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Factory para crear eventos base
 */
export function createBaseEvent(eventType: EventType): BaseEvent {
  return {
    eventId: generateEventId(),
    eventType,
    occurredAt: eventTimestamp(),
  };
}
