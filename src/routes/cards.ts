/**
 * Saved Cards Routes (Oneclick)
 * 
 * Manages card inscription for recurring payments
 */

import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import {
  startInscription,
  finishInscription,
  deleteInscription,
  getUserCards,
  setDefaultCard,
  isOneclickConfigured,
} from '../services/oneclick.service';
import { createLogger } from '../lib/logger';

const router = Router();
const logger = createLogger('SavedCardsRoutes');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * GET /api/cards
 * Get user's saved cards
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    const cards = await getUserCards(userId);
    
    res.json({
      success: true,
      cards,
      oneclickEnabled: isOneclickConfigured(),
    });
  } catch (error) {
    logger.error('Failed to get cards:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener tarjetas guardadas',
    });
  }
});

/**
 * POST /api/cards/inscribe
 * Start card inscription process
 * Returns URL to redirect user to Transbank
 */
router.post('/inscribe', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    });
    
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
      return;
    }
    
    if (!isOneclickConfigured()) {
      res.status(503).json({
        success: false,
        error: 'El sistema de pagos recurrentes no está configurado',
      });
      return;
    }
    
    const responseUrl = `${FRONTEND_URL}/cards/confirm`;
    
    const result = await startInscription(
      user.id,
      user.username,
      user.email,
      responseUrl
    );
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error || 'Error al iniciar inscripción',
      });
      return;
    }
    
    res.json({
      success: true,
      token: result.token,
      urlWebpay: result.urlWebpay,
    });
  } catch (error) {
    logger.error('Failed to start inscription:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar inscripción de tarjeta',
    });
  }
});

/**
 * POST /api/cards/confirm
 * Finish card inscription after user returns from Transbank
 */
router.post('/confirm', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { token } = req.body;
    
    if (!token) {
      res.status(400).json({
        success: false,
        error: 'Token de inscripción requerido',
      });
      return;
    }
    
    const result = await finishInscription(userId, token);
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error || 'Inscripción rechazada',
        responseCode: result.responseCode,
      });
      return;
    }
    
    res.json({
      success: true,
      message: 'Tarjeta guardada exitosamente',
      card: {
        id: result.savedCardId,
        type: result.cardType,
        lastFour: result.cardLastFour,
      },
    });
  } catch (error) {
    logger.error('Failed to confirm inscription:', error);
    res.status(500).json({
      success: false,
      error: 'Error al confirmar inscripción de tarjeta',
    });
  }
});

/**
 * DELETE /api/cards/:cardId
 * Delete a saved card
 */
router.delete('/:cardId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    
    const success = await deleteInscription(cardId);
    
    if (!success) {
      res.status(400).json({
        success: false,
        error: 'No se pudo eliminar la tarjeta',
      });
      return;
    }
    
    res.json({
      success: true,
      message: 'Tarjeta eliminada exitosamente',
    });
  } catch (error) {
    logger.error('Failed to delete card:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar tarjeta',
    });
  }
});

/**
 * PUT /api/cards/:cardId/default
 * Set a card as default for auto-renewals
 */
router.put('/:cardId/default', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { cardId } = req.params;
    
    const success = await setDefaultCard(userId, cardId);
    
    if (!success) {
      res.status(400).json({
        success: false,
        error: 'No se pudo establecer como tarjeta predeterminada',
      });
      return;
    }
    
    res.json({
      success: true,
      message: 'Tarjeta predeterminada actualizada',
    });
  } catch (error) {
    logger.error('Failed to set default card:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar tarjeta predeterminada',
    });
  }
});

export default router;
