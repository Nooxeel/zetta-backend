/**
 * Transbank Oneclick Mall Integration Service
 * 
 * Handles card inscription and recurring payments for subscriptions.
 * Uses Oneclick Mall to allow automatic charging without user intervention.
 * 
 * Flow:
 * 1. User subscribes → inscribe card via Oneclick (user enters card once)
 * 2. User confirms inscription → we store tbkUser token
 * 3. On renewal → use tbkUser to charge automatically
 * 4. If charge fails → expire subscription and notify user
 */

import { Oneclick, Options, IntegrationApiKeys, IntegrationCommerceCodes, Environment, TransactionDetail } from 'transbank-sdk';
import prisma from '../lib/prisma';
import { createLogger } from '../lib/logger';

const logger = createLogger('OneclickService');

// ==================== CONFIGURATION ====================

function getOneclickConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    const commerceCode = process.env.ONECLICK_COMMERCE_CODE;
    const apiKey = process.env.ONECLICK_API_KEY;
    const childCommerceCode = process.env.ONECLICK_CHILD_COMMERCE_CODE;
    
    if (!commerceCode || !apiKey || !childCommerceCode) {
      logger.warn('Oneclick not configured - missing ONECLICK_COMMERCE_CODE, ONECLICK_API_KEY, or ONECLICK_CHILD_COMMERCE_CODE');
      return null;
    }
    
    return {
      environment: Environment.Production,
      commerceCode,
      apiKey,
      childCommerceCode,
    };
  }
  
  // Development/Integration: use test credentials
  return {
    environment: Environment.Integration,
    commerceCode: IntegrationCommerceCodes.ONECLICK_MALL,
    apiKey: IntegrationApiKeys.WEBPAY,
    childCommerceCode: IntegrationCommerceCodes.ONECLICK_MALL_CHILD1,
  };
}

let _config: ReturnType<typeof getOneclickConfig> | null = null;
const getConfig = () => {
  if (_config === null) {
    _config = getOneclickConfig();
  }
  return _config;
};

// ==================== TYPES ====================

export interface InscriptionStartResult {
  success: boolean;
  token?: string;
  urlWebpay?: string;
  error?: string;
}

export interface InscriptionFinishResult {
  success: boolean;
  savedCardId?: string;
  cardType?: string;
  cardLastFour?: string;
  error?: string;
  responseCode?: number;
}

export interface ChargeResult {
  success: boolean;
  authorizationCode?: string;
  transactionId?: string;
  amount?: number;
  error?: string;
  responseCode?: number;
}

// ==================== SERVICE ====================

/**
 * Check if Oneclick is configured and available
 */
export function isOneclickConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Start card inscription process
 * User will be redirected to Transbank to enter card details
 */
export async function startInscription(
  userId: string,
  username: string,
  email: string,
  responseUrl: string
): Promise<InscriptionStartResult> {
  const config = getConfig();
  
  if (!config) {
    return {
      success: false,
      error: 'Oneclick is not configured',
    };
  }
  
  try {
    const inscription = new Oneclick.MallInscription(
      new Options(config.commerceCode, config.apiKey, config.environment)
    );
    
    const response = await inscription.start(username, email, responseUrl);
    
    logger.info(`Inscription started for user ${userId}`, { token: response.token });
    
    // Store pending inscription in DB for tracking
    await prisma.savedCard.create({
      data: {
        userId,
        tbkUser: `pending_${response.token}`, // Temporary, will be updated on finish
        cardType: 'PENDING',
        cardLastFour: '****',
        isActive: false, // Not active until inscription completes
      },
    });
    
    return {
      success: true,
      token: response.token,
      urlWebpay: response.url_webpay,
    };
  } catch (error) {
    logger.error('Failed to start inscription:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Finish card inscription after user returns from Transbank
 * This should be called when user is redirected back to responseUrl
 */
export async function finishInscription(
  userId: string,
  token: string
): Promise<InscriptionFinishResult> {
  const config = getConfig();
  
  if (!config) {
    return {
      success: false,
      error: 'Oneclick is not configured',
    };
  }
  
  try {
    const inscription = new Oneclick.MallInscription(
      new Options(config.commerceCode, config.apiKey, config.environment)
    );
    
    const response = await inscription.finish(token);
    
    // Check if inscription was successful
    if (response.response_code !== 0) {
      logger.warn(`Inscription failed for user ${userId}`, {
        responseCode: response.response_code,
      });
      
      // Delete the pending card record
      await prisma.savedCard.deleteMany({
        where: {
          userId,
          tbkUser: `pending_${token}`,
        },
      });
      
      return {
        success: false,
        responseCode: response.response_code,
        error: `Inscription rejected with code ${response.response_code}`,
      };
    }
    
    // Extract card info
    const cardNumber = response.card_number || '';
    const cardLastFour = cardNumber.slice(-4) || '****';
    const cardType = response.card_type || 'UNKNOWN';
    
    // Update the pending card with real data
    const savedCard = await prisma.savedCard.updateMany({
      where: {
        userId,
        tbkUser: `pending_${token}`,
      },
      data: {
        tbkUser: response.tbk_user,
        cardType,
        cardLastFour,
        isActive: true,
        isDefault: true, // Make it default if first card
      },
    });
    
    // Get the actual card ID
    const card = await prisma.savedCard.findFirst({
      where: {
        userId,
        tbkUser: response.tbk_user,
      },
    });
    
    // Set as default if it's the first card (unset other defaults)
    if (card) {
      const cardCount = await prisma.savedCard.count({
        where: { userId, isActive: true },
      });
      
      if (cardCount === 1) {
        await prisma.savedCard.update({
          where: { id: card.id },
          data: { isDefault: true },
        });
      }
    }
    
    logger.info(`Inscription completed for user ${userId}`, {
      cardType,
      cardLastFour,
      tbkUser: response.tbk_user,
    });
    
    return {
      success: true,
      savedCardId: card?.id,
      cardType,
      cardLastFour,
    };
  } catch (error) {
    logger.error('Failed to finish inscription:', error);
    
    // Clean up pending record
    await prisma.savedCard.deleteMany({
      where: {
        userId,
        tbkUser: `pending_${token}`,
      },
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Charge a saved card for a subscription renewal
 * This is used by the renewal cron job
 */
export async function chargeCard(
  savedCardId: string,
  amount: number,
  buyOrder: string,
  subscriptionId?: string
): Promise<ChargeResult> {
  const config = getConfig();
  
  if (!config) {
    return {
      success: false,
      error: 'Oneclick is not configured',
    };
  }
  
  // Get the saved card
  const savedCard = await prisma.savedCard.findUnique({
    where: { id: savedCardId },
    include: { user: { select: { username: true, id: true } } },
  });
  
  if (!savedCard || !savedCard.isActive) {
    return {
      success: false,
      error: 'Card not found or inactive',
    };
  }
  
  try {
    const transaction = new Oneclick.MallTransaction(
      new Options(config.commerceCode, config.apiKey, config.environment)
    );
    
    // Create transaction detail for the child commerce
    const txDetail = new TransactionDetail(
      amount,
      config.childCommerceCode,
      buyOrder,
      1 // installments_number - subscriptions don't use installments
    );
    
    const response = await transaction.authorize(
      savedCard.user.username,
      savedCard.tbkUser,
      buyOrder, // Parent buy order
      [txDetail]  // Array of transaction details
    );
    
    // Check if transaction was successful
    // Response contains details array with each child transaction result
    const responseDetail = response.details?.[0] as {
      response_code?: number;
      status?: string;
      authorization_code?: string;
    } | undefined;
    
    if (!responseDetail || responseDetail.response_code !== 0) {
      logger.warn(`Charge failed for card ${savedCardId}`, {
        responseCode: responseDetail?.response_code,
        status: responseDetail?.status,
      });
      
      return {
        success: false,
        responseCode: responseDetail?.response_code,
        error: `Charge rejected with code ${responseDetail?.response_code}`,
      };
    }
    
    // Update last used timestamp
    await prisma.savedCard.update({
      where: { id: savedCardId },
      data: { lastUsedAt: new Date() },
    });
    
    logger.info(`Charge successful for card ${savedCardId}`, {
      amount,
      authorizationCode: responseDetail.authorization_code,
      buyOrder,
    });
    
    return {
      success: true,
      authorizationCode: responseDetail.authorization_code,
      transactionId: response.buy_order,
      amount,
    };
  } catch (error) {
    logger.error('Failed to charge card:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a card inscription from Transbank
 * Should be called when user removes a saved card
 */
export async function deleteInscription(savedCardId: string): Promise<boolean> {
  const config = getConfig();
  
  if (!config) {
    return false;
  }
  
  const savedCard = await prisma.savedCard.findUnique({
    where: { id: savedCardId },
    include: { user: { select: { username: true } } },
  });
  
  if (!savedCard) {
    return false;
  }
  
  try {
    const inscription = new Oneclick.MallInscription(
      new Options(config.commerceCode, config.apiKey, config.environment)
    );
    
    await inscription.delete(savedCard.tbkUser, savedCard.user.username);
    
    // Soft delete in our DB
    await prisma.savedCard.update({
      where: { id: savedCardId },
      data: { isActive: false },
    });
    
    logger.info(`Card ${savedCardId} deleted from Transbank`);
    return true;
  } catch (error) {
    logger.error('Failed to delete inscription:', error);
    return false;
  }
}

/**
 * Get user's saved cards
 */
export async function getUserCards(userId: string) {
  return prisma.savedCard.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      id: true,
      cardType: true,
      cardLastFour: true,
      cardBrand: true,
      isDefault: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: [
      { isDefault: 'desc' },
      { createdAt: 'desc' },
    ],
  });
}

/**
 * Set a card as default for auto-renewals
 */
export async function setDefaultCard(userId: string, cardId: string): Promise<boolean> {
  try {
    // First, unset all defaults for this user
    await prisma.savedCard.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
    
    // Set the new default
    await prisma.savedCard.update({
      where: { id: cardId, userId },
      data: { isDefault: true },
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to set default card:', error);
    return false;
  }
}

/**
 * Get the default card for a user (for auto-renewals)
 */
export async function getDefaultCard(userId: string) {
  return prisma.savedCard.findFirst({
    where: {
      userId,
      isActive: true,
      isDefault: true,
    },
  });
}
