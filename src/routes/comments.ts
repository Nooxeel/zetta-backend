import { Router, Request, Response } from 'express';
import { createLogger } from '../lib/logger'
import prisma from '../lib/prisma';
import { sanitizeComment } from '../lib/sanitize';
import { commentLimiter } from '../middleware/rateLimiter';
import { createCommentSchema, validateData } from '../lib/validators';
import { authenticate, getUser } from '../middleware/auth';

const router = Router();
const logger = createLogger('Comments');

// GET /api/comments/user/my-comments - Obtener comentarios del usuario autenticado
router.get('/user/my-comments', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUser(req).userId;
    
    const comments = await prisma.comment.findMany({
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
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json(comments);
  } catch (error) {
    logger.error('Error al obtener comentarios del usuario:', error);
    res.status(500).json({ error: 'Error al obtener comentarios' });
  }
});

// GET /api/comments/:creatorId - Obtener comentarios aprobados de un creador (público)
router.get('/:creatorId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { creatorId } = req.params;
    
    const comments = await prisma.comment.findMany({
      where: {
        creatorId,
        isApproved: true
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json(comments);
  } catch (error) {
    logger.error('Error al obtener comentarios:', error);
    res.status(500).json({ error: 'Error al obtener comentarios' });
  }
});

// GET /api/comments/:creatorId/pending - Obtener comentarios pendientes (solo para el creador)
router.get('/:creatorId/pending', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { creatorId } = req.params;
    const userId = getUser(req).userId;
    
    // Verificar que el usuario sea el dueño del perfil de creador
    const creator = await prisma.creator.findUnique({
      where: { id: creatorId }
    });
    
    if (!creator || creator.userId !== userId) {
      res.status(403).json({ error: 'No tienes permiso para ver estos comentarios' });
      return;
    }
    
    const comments = await prisma.comment.findMany({
      where: {
        creatorId,
        isApproved: false
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json(comments);
  } catch (error) {
    logger.error('Error al obtener comentarios pendientes:', error);
    res.status(500).json({ error: 'Error al obtener comentarios pendientes' });
  }
});

// GET /api/comments/:creatorId/stats - Obtener conteo de comentarios (público)
router.get('/:creatorId/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { creatorId } = req.params;
    
    const [approvedCount, pendingCount] = await Promise.all([
      prisma.comment.count({
        where: { creatorId, isApproved: true }
      }),
      prisma.comment.count({
        where: { creatorId, isApproved: false }
      })
    ]);
    
    res.json({
      approved: approvedCount,
      pending: pendingCount,
      total: approvedCount + pendingCount
    });
  } catch (error) {
    logger.error('Error al obtener estadísticas de comentarios:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// POST /api/comments/:creatorId - Crear un comentario (requiere autenticación)
router.post('/:creatorId', commentLimiter, authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { creatorId } = req.params;
    const userId = getUser(req).userId;
    
    // Validar con Zod
    const validation = validateData(createCommentSchema, req.body);
    if (!validation.success) {
      res.status(400).json({ error: validation.errors[0] });
      return;
    }
    
    const { content } = validation.data;
    
    // Sanitizar comentario para prevenir XSS
    const sanitizedContent = sanitizeComment(content);
    
    // Verificar que el creador existe
    const creator = await prisma.creator.findUnique({
      where: { id: creatorId }
    });
    
    if (!creator) {
      res.status(404).json({ error: 'Creador no encontrado' });
      return;
    }
    
    // Si el creador comenta en su propio perfil, se aprueba automáticamente
    const isOwnProfile = creator.userId === userId;
    
    const comment = await prisma.comment.create({
      data: {
        userId,
        creatorId,
        content: sanitizedContent,
        isApproved: isOwnProfile // Auto-aprobar si es el mismo creador
      },
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
    });
    
    res.status(201).json(comment);
  } catch (error) {
    logger.error('Error al crear comentario:', error);
    res.status(500).json({ error: 'Error al crear comentario' });
  }
});

// PUT /api/comments/:commentId/approve - Aprobar un comentario (solo creador)
router.put('/:commentId/approve', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { commentId } = req.params;
    const userId = getUser(req).userId;
    
    // Obtener el comentario con información del creador
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        creator: true
      }
    });
    
    if (!comment) {
      res.status(404).json({ error: 'Comentario no encontrado' });
      return;
    }
    
    // Verificar que el usuario sea el dueño del perfil
    if (comment.creator.userId !== userId) {
      res.status(403).json({ error: 'No tienes permiso para aprobar este comentario' });
      return;
    }
    
    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { isApproved: true },
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
    });
    
    res.json(updatedComment);
  } catch (error) {
    logger.error('Error al aprobar comentario:', error);
    res.status(500).json({ error: 'Error al aprobar comentario' });
  }
});

// DELETE /api/comments/:commentId - Eliminar un comentario (creador o autor)
router.delete('/:commentId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { commentId } = req.params;
    const userId = getUser(req).userId;
    
    // Obtener el comentario con información del creador
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        creator: true
      }
    });
    
    if (!comment) {
      res.status(404).json({ error: 'Comentario no encontrado' });
      return;
    }
    
    // Puede eliminar: el autor del comentario o el dueño del perfil
    const isAuthor = comment.userId === userId;
    const isProfileOwner = comment.creator.userId === userId;
    
    if (!isAuthor && !isProfileOwner) {
      res.status(403).json({ error: 'No tienes permiso para eliminar este comentario' });
      return;
    }
    
    await prisma.comment.delete({
      where: { id: commentId }
    });
    
    res.json({ message: 'Comentario eliminado' });
  } catch (error) {
    logger.error('Error al eliminar comentario:', error);
    res.status(500).json({ error: 'Error al eliminar comentario' });
  }
});

export default router;

