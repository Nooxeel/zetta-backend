import { Router, Request, Response } from 'express';
import { createLogger } from '../lib/logger'
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();
const logger = createLogger('Users');

// GET /api/users/me - Obtener perfil del usuario actual
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        coverImage: true,
        backgroundColor: true,
        backgroundGradient: true,
        accentColor: true,
        fontFamily: true,
        isCreator: true,
        createdAt: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    res.json(user);
  } catch (error) {
    logger.error('Error al obtener usuario:', error);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// PUT /api/users/me - Actualizar perfil del usuario
router.put('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { displayName, avatar, bio, backgroundColor, backgroundGradient, accentColor, fontFamily } = req.body;

    const updateData: any = {};

    if (displayName) updateData.displayName = displayName;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (bio !== undefined) updateData.bio = bio;
    if (backgroundColor) updateData.backgroundColor = backgroundColor;
    if (backgroundGradient !== undefined) updateData.backgroundGradient = backgroundGradient;
    if (accentColor) updateData.accentColor = accentColor;
    if (fontFamily) updateData.fontFamily = fontFamily;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        coverImage: true,
        backgroundColor: true,
        backgroundGradient: true,
        accentColor: true,
        fontFamily: true,
        isCreator: true
      }
    });

    res.json(user);
  } catch (error) {
    logger.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// GET /api/users/me/subscriptions - Obtener suscripciones activas del usuario
router.get('/me/subscriptions', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    
    const subscriptions = await prisma.subscription.findMany({
      where: {
        userId,
        status: 'active'
      },
      include: {
        creator: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                avatar: true
              }
            }
          }
        },
        tier: true
      },
      orderBy: {
        startDate: 'desc'
      }
    });
    
    const formattedSubs = subscriptions.map(sub => ({
      id: sub.id,
      startDate: sub.startDate,
      endDate: sub.endDate,
      status: sub.status,
      tier: {
        name: sub.tier.name,
        price: sub.tier.price,
        currency: sub.tier.currency
      },
      creator: {
        id: sub.creator.id,
        username: sub.creator.user.username,
        displayName: sub.creator.user.displayName,
        avatar: sub.creator.user.avatar,
        isVerified: sub.creator.isVerified
      }
    }));
    
    res.json(formattedSubs);
  } catch (error) {
    logger.error('Error al obtener suscripciones:', error);
    res.status(500).json({ error: 'Error al obtener suscripciones' });
  }
});

// GET /api/users/me/stats - Obtener estadísticas del usuario
router.get('/me/stats', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    
    const [subscriptionsCount, favoritesCount, commentsCount, donationsCount] = await Promise.all([
      prisma.subscription.count({
        where: { userId, status: 'active' }
      }),
      prisma.favorite.count({
        where: { userId }
      }),
      prisma.comment.count({
        where: { userId, isApproved: true }
      }),
      prisma.donation.count({
        where: { fromUserId: userId }
      })
    ]);
    
    res.json({
      activeSubscriptions: subscriptionsCount,
      favorites: favoritesCount,
      comments: commentsCount,
      donations: donationsCount
    });
  } catch (error) {
    logger.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// GET /api/subscriptions/check/:creatorId - Verificar si el usuario está suscrito a un creador
router.get('/subscriptions/check/:creatorId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { creatorId } = req.params;

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        creatorId,
        status: 'active'
      }
    });

    res.json({ isSubscribed: !!subscription });
  } catch (error) {
    logger.error('Error al verificar suscripción:', error);
    res.status(500).json({ error: 'Error al verificar suscripción' });
  }
});

// GET /api/users/me/payments - Obtener historial de pagos del usuario
router.get('/me/payments', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { limit = 20, offset = 0 } = req.query;
    
    // Obtener donaciones enviadas
    const donations = await prisma.donation.findMany({
      where: { fromUserId: userId },
      include: {
        toCreator: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                avatar: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });
    
    // Obtener historial de suscripciones (todas, no solo activas)
    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      include: {
        creator: {
          include: {
            user: {
              select: {
                username: true,
                displayName: true,
                avatar: true
              }
            }
          }
        },
        tier: true
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });
    
    // Formatear donaciones
    const formattedDonations = donations.map(d => ({
      id: d.id,
      type: 'donation' as const,
      amount: d.amount,
      currency: d.currency,
      message: d.message,
      status: d.status,
      createdAt: d.createdAt,
      creator: {
        id: d.toCreator.id,
        username: d.toCreator.user.username,
        displayName: d.toCreator.user.displayName,
        avatar: d.toCreator.user.avatar,
        profileImage: d.toCreator.profileImage,
        isVerified: d.toCreator.isVerified
      }
    }));
    
    // Formatear suscripciones como pagos
    const formattedSubscriptions = subscriptions.map(s => ({
      id: s.id,
      type: 'subscription' as const,
      amount: s.tier.price,
      currency: s.tier.currency,
      tierName: s.tier.name,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
      createdAt: s.createdAt,
      creator: {
        id: s.creator.id,
        username: s.creator.user.username,
        displayName: s.creator.user.displayName,
        avatar: s.creator.user.avatar,
        profileImage: s.creator.profileImage,
        isVerified: s.creator.isVerified
      }
    }));
    
    // Combinar y ordenar por fecha
    const allPayments = [...formattedDonations, ...formattedSubscriptions]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    res.json({
      payments: allPayments,
      total: allPayments.length
    });
  } catch (error) {
    logger.error('Error al obtener historial de pagos:', error);
    res.status(500).json({ error: 'Error al obtener historial de pagos' });
  }
});

export default router;
