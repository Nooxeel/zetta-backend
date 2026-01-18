/**
 * Webpay Plus Integration Service
 * 
 * Handles all Transbank Webpay Plus transactions for the platform.
 * Uses REST API integration via official transbank-sdk.
 * 
 * Environment: Integration (test) - Commerce Code: 597055555532
 */

import { WebpayPlus, Options, IntegrationApiKeys, IntegrationCommerceCodes, Environment } from 'transbank-sdk';
import prisma from '../lib/prisma';
import { WebpayPaymentType, WebpayStatus, ProductType, TransactionStatus } from '@prisma/client';
import { createTransactionLedgerEntries, LEDGER_CODES } from './ledgerService';
import { processReferralCommission } from './referralService';

// Default fee schedule ID (10% platform fee)
const DEFAULT_FEE_SCHEDULE_ID = 'default-fee-schedule';
const PLATFORM_FEE_BPS = 1000; // 10% = 1000 basis points

// ==================== CONFIGURATION ====================

// Integration (test) credentials
const WEBPAY_CONFIG = {
  environment: Environment.Integration,
  commerceCode: IntegrationCommerceCodes.WEBPAY_PLUS, // 597055555532
  apiKey: IntegrationApiKeys.WEBPAY, // 579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C
};

// For production, use environment variables:
// const WEBPAY_PROD_CONFIG = {
//   environment: Environment.Production,
//   commerceCode: process.env.WEBPAY_COMMERCE_CODE!,
//   apiKey: process.env.WEBPAY_API_KEY!,
// };

// ==================== TYPES ====================

export interface CreatePaymentParams {
  userId: string;
  amount: number; // In CLP (whole numbers only)
  paymentType: WebpayPaymentType;
  returnUrl: string;
  // Optional based on payment type
  subscriptionTierId?: string;
  creatorId?: string;
  donationMessage?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  buyOrder: string;
  amount: number;
  status: WebpayStatus;
  authorizationCode?: string;
  cardNumber?: string;
  paymentTypeCode?: string;
  errorMessage?: string;
}

// ==================== SERVICE ====================

class WebpayService {
  private transaction: InstanceType<typeof WebpayPlus.Transaction>;

  constructor() {
    // Initialize with integration credentials
    const options = new Options(
      WEBPAY_CONFIG.commerceCode,
      WEBPAY_CONFIG.apiKey,
      WEBPAY_CONFIG.environment
    );
    this.transaction = new WebpayPlus.Transaction(options);
  }

  /**
   * Generate unique buy order ID
   */
  private generateBuyOrder(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `APO-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Generate session ID for tracking
   */
  private generateSessionId(userId: string): string {
    return `session-${userId}-${Date.now()}`;
  }

  /**
   * Create a new payment and redirect to Webpay
   */
  async createPayment(params: CreatePaymentParams): Promise<{
    token: string;
    url: string;
    buyOrder: string;
    transactionId: string;
  }> {
    const { userId, amount, paymentType, returnUrl, subscriptionTierId, creatorId, donationMessage } = params;

    // Validate amount (must be positive integer in CLP)
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new Error('El monto debe ser un número entero positivo en CLP');
    }

    const buyOrder = this.generateBuyOrder();
    const sessionId = this.generateSessionId(userId);

    console.log(`[Webpay] Creating payment: ${buyOrder} for ${amount} CLP`);

    // Create record in database first
    const webpayTx = await prisma.webpayTransaction.create({
      data: {
        userId,
        buyOrder,
        sessionId,
        amount,
        paymentType,
        subscriptionTierId,
        creatorId,
        donationMessage,
        returnUrl,
        status: 'PENDING',
      },
    });

    try {
      // Create transaction in Webpay
      const response = await this.transaction.create(
        buyOrder,
        sessionId,
        amount,
        returnUrl
      );

      // Update with token
      await prisma.webpayTransaction.update({
        where: { id: webpayTx.id },
        data: { token: response.token },
      });

      console.log(`[Webpay] Payment created successfully: ${buyOrder}`);
      console.log(`[Webpay] Redirect URL: ${response.url}`);

      return {
        token: response.token,
        url: response.url,
        buyOrder,
        transactionId: webpayTx.id,
      };
    } catch (error) {
      // Update status to failed
      await prisma.webpayTransaction.update({
        where: { id: webpayTx.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Error desconocido',
        },
      });
      throw error;
    }
  }

  /**
   * Confirm/commit a payment after user returns from Webpay
   * This should be called when receiving token_ws in return URL
   */
  async confirmPayment(token: string): Promise<PaymentResult> {
    console.log(`[Webpay] Confirming payment with token: ${token.substring(0, 20)}...`);

    // Find transaction by token
    const webpayTx = await prisma.webpayTransaction.findUnique({
      where: { token },
    });

    if (!webpayTx) {
      throw new Error('Transacción no encontrada');
    }

    if (webpayTx.status !== 'PENDING') {
      // Already processed
      return {
        success: webpayTx.status === 'AUTHORIZED',
        transactionId: webpayTx.id,
        buyOrder: webpayTx.buyOrder,
        amount: webpayTx.amount,
        status: webpayTx.status,
        authorizationCode: webpayTx.authorizationCode ?? undefined,
        cardNumber: webpayTx.cardNumber ?? undefined,
        paymentTypeCode: webpayTx.paymentTypeCode ?? undefined,
      };
    }

    try {
      // Commit transaction in Webpay
      const response = await this.transaction.commit(token);

      console.log(`[Webpay] Commit response:`, {
        responseCode: response.response_code,
        status: response.status,
        authorizationCode: response.authorization_code,
      });

      // Check if authorized (response_code === 0 && status === 'AUTHORIZED')
      const isAuthorized = response.response_code === 0 && response.status === 'AUTHORIZED';

      // Update transaction record
      await prisma.webpayTransaction.update({
        where: { id: webpayTx.id },
        data: {
          status: isAuthorized ? 'AUTHORIZED' : 'FAILED',
          responseCode: response.response_code,
          authorizationCode: response.authorization_code,
          cardNumber: response.card_detail?.card_number,
          cardType: response.card_detail?.card_number?.startsWith('4') ? 'VISA' : 'MASTERCARD',
          paymentTypeCode: response.payment_type_code,
          installmentsNumber: response.installments_number,
          transactionDate: new Date(response.transaction_date),
          completedAt: new Date(),
          errorMessage: isAuthorized ? null : `Código de respuesta: ${response.response_code}`,
        },
      });

      // If authorized and it's a subscription, activate it
      if (isAuthorized && webpayTx.paymentType === 'SUBSCRIPTION' && webpayTx.subscriptionTierId) {
        await this.activateSubscription(
          webpayTx.userId, 
          webpayTx.subscriptionTierId, 
          webpayTx.creatorId!,
          webpayTx.id,
          webpayTx.amount,
          webpayTx.buyOrder
        );
      }

      // If authorized and it's a donation, record it
      if (isAuthorized && (webpayTx.paymentType === 'DONATION' || webpayTx.paymentType === 'TIP')) {
        await this.recordDonation(
          webpayTx.userId, 
          webpayTx.creatorId!, 
          webpayTx.amount, 
          webpayTx.id,
          webpayTx.buyOrder,
          webpayTx.donationMessage
        );
      }

      return {
        success: isAuthorized,
        transactionId: webpayTx.id,
        buyOrder: webpayTx.buyOrder,
        amount: webpayTx.amount,
        status: isAuthorized ? 'AUTHORIZED' : 'FAILED',
        authorizationCode: response.authorization_code,
        cardNumber: response.card_detail?.card_number,
        paymentTypeCode: response.payment_type_code,
        errorMessage: isAuthorized ? undefined : `Pago rechazado (código: ${response.response_code})`,
      };
    } catch (error) {
      console.error(`[Webpay] Error confirming payment:`, error);
      
      await prisma.webpayTransaction.update({
        where: { id: webpayTx.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Error al confirmar pago',
          completedAt: new Date(),
        },
      });

      return {
        success: false,
        transactionId: webpayTx.id,
        buyOrder: webpayTx.buyOrder,
        amount: webpayTx.amount,
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Error al confirmar pago',
      };
    }
  }

  /**
   * Handle cancelled/aborted payment
   * Called when receiving TBK_TOKEN (user clicked "Anular")
   */
  async handleCancelledPayment(tbkToken: string, tbkOrdenCompra: string): Promise<PaymentResult> {
    console.log(`[Webpay] Payment cancelled: ${tbkOrdenCompra}`);

    const webpayTx = await prisma.webpayTransaction.findUnique({
      where: { buyOrder: tbkOrdenCompra },
    });

    if (!webpayTx) {
      throw new Error('Transacción no encontrada');
    }

    await prisma.webpayTransaction.update({
      where: { id: webpayTx.id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        errorMessage: 'Pago cancelado por el usuario',
      },
    });

    return {
      success: false,
      transactionId: webpayTx.id,
      buyOrder: webpayTx.buyOrder,
      amount: webpayTx.amount,
      status: 'CANCELLED',
      errorMessage: 'Pago cancelado por el usuario',
    };
  }

  /**
   * Handle timeout (user didn't complete payment in time)
   */
  async handleTimeout(tbkOrdenCompra: string, tbkIdSesion: string): Promise<PaymentResult> {
    console.log(`[Webpay] Payment timeout: ${tbkOrdenCompra}`);

    const webpayTx = await prisma.webpayTransaction.findUnique({
      where: { buyOrder: tbkOrdenCompra },
    });

    if (!webpayTx) {
      throw new Error('Transacción no encontrada');
    }

    await prisma.webpayTransaction.update({
      where: { id: webpayTx.id },
      data: {
        status: 'TIMEOUT',
        completedAt: new Date(),
        errorMessage: 'Tiempo de pago agotado',
      },
    });

    return {
      success: false,
      transactionId: webpayTx.id,
      buyOrder: webpayTx.buyOrder,
      amount: webpayTx.amount,
      status: 'TIMEOUT',
      errorMessage: 'Tiempo de pago agotado',
    };
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(buyOrder: string): Promise<PaymentResult | null> {
    const webpayTx = await prisma.webpayTransaction.findUnique({
      where: { buyOrder },
    });

    if (!webpayTx) return null;

    return {
      success: webpayTx.status === 'AUTHORIZED',
      transactionId: webpayTx.id,
      buyOrder: webpayTx.buyOrder,
      amount: webpayTx.amount,
      status: webpayTx.status,
      authorizationCode: webpayTx.authorizationCode ?? undefined,
      cardNumber: webpayTx.cardNumber ?? undefined,
      paymentTypeCode: webpayTx.paymentTypeCode ?? undefined,
      errorMessage: webpayTx.errorMessage ?? undefined,
    };
  }

  /**
   * Refund a payment
   */
  async refundPayment(token: string, amount: number): Promise<{ success: boolean; message: string }> {
    const webpayTx = await prisma.webpayTransaction.findUnique({
      where: { token },
    });

    if (!webpayTx) {
      throw new Error('Transacción no encontrada');
    }

    if (webpayTx.status !== 'AUTHORIZED') {
      throw new Error('Solo se pueden reembolsar transacciones autorizadas');
    }

    try {
      const response = await this.transaction.refund(token, amount);

      await prisma.webpayTransaction.update({
        where: { id: webpayTx.id },
        data: {
          status: 'REFUNDED',
        },
      });

      return {
        success: true,
        message: `Reembolso exitoso. Código: ${response.authorization_code}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error al procesar reembolso',
      };
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Activate subscription after successful payment and record transaction
   */
  private async activateSubscription(
    userId: string, 
    tierId: string, 
    creatorId: string,
    webpayTxId: string,
    amount: number,
    buyOrder: string
  ): Promise<void> {
    const tier = await prisma.subscriptionTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) return;

    // Calculate end date based on tier duration
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + (tier.durationDays || 30));

    // Calculate fees (10% platform fee)
    const grossAmount = BigInt(amount);
    const platformFeeAmount = grossAmount * BigInt(PLATFORM_FEE_BPS) / BigInt(10000);
    const creatorPayableAmount = grossAmount - platformFeeAmount;

    // Get current fee schedule (the most recent one)
    let feeSchedule = await prisma.feeSchedule.findFirst({
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!feeSchedule) {
      // Create default if not exists
      feeSchedule = await prisma.feeSchedule.create({
        data: {
          effectiveFrom: new Date(),
          standardPlatformFeeBps: PLATFORM_FEE_BPS,
          vipPlatformFeeBps: 700,
          holdDays: 7,
          minPayoutClp: BigInt(20000),
          payoutFrequency: 'WEEKLY',
          description: 'Default fee schedule',
        },
      });
    }

    // Use a transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // 1. Create or update subscription
      await tx.subscription.upsert({
        where: {
          userId_creatorId: {
            userId: userId,
            creatorId: creatorId,
          },
        },
        update: {
          tierId: tierId,
          status: 'active',
          startDate: startDate,
          endDate: endDate,
        },
        create: {
          userId: userId,
          creatorId: creatorId,
          tierId: tierId,
          status: 'active',
          startDate: startDate,
          endDate: endDate,
        },
      });

      // 2. Create Transaction record
      const transaction = await tx.transaction.create({
        data: {
          creatorId: creatorId,
          fanUserId: userId,
          productType: ProductType.SUBSCRIPTION,
          currency: 'CLP',
          grossAmount: grossAmount,
          appliedFeeScheduleId: feeSchedule!.id,
          appliedPlatformFeeBps: PLATFORM_FEE_BPS,
          platformFeeAmount: platformFeeAmount,
          creatorPayableAmount: creatorPayableAmount,
          status: TransactionStatus.SUCCEEDED,
          provider: 'WEBPAY',
          providerPaymentId: webpayTxId,
          providerEventId: buyOrder,
          metadata: {
            tierId: tierId,
            tierName: tier.name,
            durationDays: tier.durationDays || 30,
          },
        },
      });

      // 3. Create ledger entries for double-entry accounting
      try {
        await createTransactionLedgerEntries(
          tx,
          transaction.id,
          grossAmount,
          platformFeeAmount,
          creatorPayableAmount,
          creatorId
        );
      } catch (ledgerError) {
        // Log but don't fail if ledger accounts aren't set up
        console.warn('[Webpay] Could not create ledger entries:', ledgerError);
      }

      // 4. Process referral commission if applicable
      try {
        const referralResult = await processReferralCommission(
          tx,
          userId,
          platformFeeAmount,
          'subscription',
          transaction.id
        );
        if (referralResult.processed) {
          console.log(`[Webpay] Referral commission: ${referralResult.commissionAmount} CLP to ${referralResult.referrerId}`);
        }
      } catch (referralError) {
        console.warn('[Webpay] Could not process referral commission:', referralError);
      }
    });

    console.log(`[Webpay] Subscription activated for user ${userId} to creator ${creatorId}`);
    console.log(`[Webpay] Transaction recorded: gross=${amount}, platform=${platformFeeAmount}, creator=${creatorPayableAmount}`);
  }

  /**
   * Record donation after successful payment
   */
  private async recordDonation(
    fromUserId: string,
    creatorId: string,
    amount: number,
    webpayTxId: string,
    buyOrder: string,
    message?: string | null
  ): Promise<void> {
    // Calculate platform fee (10%) and creator earnings
    const grossAmount = BigInt(amount);
    const platformFeeAmount = grossAmount * BigInt(PLATFORM_FEE_BPS) / BigInt(10000);
    const creatorPayableAmount = grossAmount - platformFeeAmount;

    // Get current fee schedule
    let feeSchedule = await prisma.feeSchedule.findFirst({
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!feeSchedule) {
      feeSchedule = await prisma.feeSchedule.create({
        data: {
          effectiveFrom: new Date(),
          standardPlatformFeeBps: PLATFORM_FEE_BPS,
          vipPlatformFeeBps: 700,
          holdDays: 7,
          minPayoutClp: BigInt(20000),
          payoutFrequency: 'WEEKLY',
          description: 'Default fee schedule',
        },
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Create donation record
      await tx.donation.create({
        data: {
          fromUserId,
          toCreatorId: creatorId,
          amount,
          currency: 'CLP',
          message: message ?? undefined,
          platformFee: Number(platformFeeAmount),
          creatorEarnings: Number(creatorPayableAmount),
          status: 'completed',
        },
      });

      // 2. Create Transaction record for earnings tracking
      const transaction = await tx.transaction.create({
        data: {
          creatorId: creatorId,
          fanUserId: fromUserId,
          productType: ProductType.TIP,
          currency: 'CLP',
          grossAmount: grossAmount,
          appliedFeeScheduleId: feeSchedule!.id,
          appliedPlatformFeeBps: PLATFORM_FEE_BPS,
          platformFeeAmount: platformFeeAmount,
          creatorPayableAmount: creatorPayableAmount,
          status: TransactionStatus.SUCCEEDED,
          provider: 'WEBPAY',
          providerPaymentId: webpayTxId,
          providerEventId: buyOrder,
          metadata: {
            message: message || null,
          },
        },
      });

      // 3. Create ledger entries
      try {
        await createTransactionLedgerEntries(
          tx,
          transaction.id,
          grossAmount,
          platformFeeAmount,
          creatorPayableAmount,
          creatorId
        );
      } catch (ledgerError) {
        console.warn('[Webpay] Could not create ledger entries for donation:', ledgerError);
      }

      // 4. Process referral commission if applicable
      try {
        const referralResult = await processReferralCommission(
          tx,
          fromUserId,
          platformFeeAmount,
          'donation',
          transaction.id
        );
        if (referralResult.processed) {
          console.log(`[Webpay] Referral commission for donation: ${referralResult.commissionAmount} CLP`);
        }
      } catch (referralError) {
        console.warn('[Webpay] Could not process referral commission for donation:', referralError);
      }
    });

    console.log(`[Webpay] Donation recorded: ${amount} CLP from ${fromUserId} to creator ${creatorId}`);
    console.log(`[Webpay] Transaction: gross=${amount}, platform=${platformFeeAmount}, creator=${creatorPayableAmount}`);
  }
}

// Export singleton instance
export const webpayService = new WebpayService();
