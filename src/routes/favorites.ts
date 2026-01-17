import { Router, Request, Response } from 'express';
import { createLogger } from '../lib/logger'
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();
const logger = createLogger('Favorites');

// GET /api/favorites - Obtener favoritos del usuario logueado
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: {
        creator: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Formatear respuesta para incluir info del creador
    const formattedFavorites = favorites.map(fav => ({
      id: fav.id,
      createdAt: fav.createdAt,
      creator: {
        id: fav.creator.id,
        username: fav.creator.user.username,
        displayName: fav.creator.user.displayName,
        avatar: fav.creator.user.avatar,
        profileImage: fav.creator.profileImage,
        bio: fav.creator.bio,
        isVerified: fav.creator.isVerified,
        accentColor: fav.creator.accentColor
      }
    }));
    
    res.json(formattedFavorites);
  } catch (error) {
    logger.error('Error al obtener favoritos:', error);
    res.status(500).json({ error: 'Error al obtener favoritos' });
  }
});

// GET /api/favorites/check/:creatorId - Verificar si un creador está en favoritos
router.get('/check/:creatorId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { creatorId } = req.params;
    
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_creatorId: {
          userId,
          creatorId
        }
      }
    });
    
    res.json({ isFavorite: !!favorite });
  } catch (error) {
    logger.error('Error al verificar favorito:', error);
    res.status(500).json({ error: 'Error al verificar favorito' });
  }
});

// POST /api/favorites/:creatorId - Agregar creador a favoritos
router.post('/:creatorId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { creatorId } = req.params;
    
    // Verificar que el creador existe
    const creator = await prisma.creator.findUnique({
      where: { id: creatorId }
    });
    
    if (!creator) {
      res.status(404).json({ error: 'Creador no encontrado' });
      return;
    }
    
    // No permitir que un creador se agregue a sí mismo como favorito
    if (creator.userId === userId) {
      res.status(400).json({ error: 'No puedes agregarte a ti mismo como favorito' });
      return;
    }
    
    // Verificar si ya existe
    const existing = await prisma.favorite.findUnique({
      where: {
        userId_creatorId: {
          userId,
          creatorId
        }
      }
    });
    
    if (existing) {
      res.status(400).json({ error: 'Ya tienes a este creador en favoritos' });
      return;
    }
    
    const favorite = await prisma.favorite.create({
      data: {
        userId,
        creatorId
      }
    });
    
    res.status(201).json({ message: 'Agregado a favoritos', favorite });
  } catch (error) {
    logger.error('Error al agregar favorito:', error);
    res.status(500).json({ error: 'Error al agregar favorito' });
  }
});

// DELETE /api/favorites/:creatorId - Quitar creador de favoritos
router.delete('/:creatorId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.userId;
    const { creatorId } = req.params;
    
    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_creatorId: {
          userId,
          creatorId
        }
      }
    });
    
    if (!favorite) {
      res.status(404).json({ error: 'No tienes a este creador en favoritos' });
      return;
    }
    
    await prisma.favorite.delete({
      where: {
        userId_creatorId: {
          userId,
          creatorId
        }
      }
    });
    
    res.json({ message: 'Eliminado de favoritos' });
  } catch (error) {
    logger.error('Error al eliminar favorito:', error);
    res.status(500).json({ error: 'Error al eliminar favorito' });
  }
});

// GET /api/favorites/count/:creatorId - Obtener cantidad de favoritos de un creador
router.get('/count/:creatorId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { creatorId } = req.params;
    
    const count = await prisma.favorite.count({
      where: { creatorId }
    });
    
    res.json({ count });
  } catch (error) {
    logger.error('Error al contar favoritos:', error);
    res.status(500).json({ error: 'Error al contar favoritos' });
  }
});

export default router;
