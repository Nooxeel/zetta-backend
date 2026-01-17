import { Request, Response, NextFunction } from 'express'
import prisma from '../lib/prisma'
import { createLogger } from '../lib/logger'

const logger = createLogger('BlockCheck')

/**
 * Verifica si un usuario está bloqueado por un creador
 * @param creatorId - ID del creador
 * @param userId - ID del usuario a verificar
 * @returns true si está bloqueado, false si no
 */
export async function isUserBlocked(creatorId: string, userId: string): Promise<boolean> {
  if (!creatorId || !userId) return false
  
  const block = await prisma.blockedUser.findUnique({
    where: {
      creatorId_blockedUserId: {
        creatorId,
        blockedUserId: userId
      }
    }
  })
  
  return !!block
}

/**
 * Verifica si un usuario está bloqueado por un creador dado su username
 * @param creatorUsername - Username del creador
 * @param userId - ID del usuario a verificar
 * @returns true si está bloqueado, false si no
 */
export async function isUserBlockedByUsername(creatorUsername: string, userId: string): Promise<boolean> {
  if (!creatorUsername || !userId) return false
  
  const creator = await prisma.creator.findFirst({
    where: {
      user: { username: creatorUsername }
    },
    select: { id: true }
  })
  
  if (!creator) return false
  
  return isUserBlocked(creator.id, userId)
}

/**
 * Middleware factory que verifica si el usuario autenticado está bloqueado por el creador
 * Requiere que el creatorId esté en req.params.creatorId o se pase como argumento
 */
export function checkBlockedMiddleware(getCreatorId?: (req: Request) => string | Promise<string>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).userId
      
      // Si no hay usuario autenticado, continuar (el perfil público puede ser visible)
      if (!userId) {
        next()
        return
      }
      
      let creatorId: string | undefined
      
      if (getCreatorId) {
        creatorId = await getCreatorId(req)
      } else {
        creatorId = req.params.creatorId
      }
      
      if (!creatorId) {
        next()
        return
      }
      
      const isBlocked = await isUserBlocked(creatorId, userId)
      
      if (isBlocked) {
        logger.debug(`Blocked user ${userId} tried to access creator ${creatorId}`)
        res.status(403).json({ 
          error: 'No tienes acceso a este contenido',
          code: 'USER_BLOCKED'
        })
        return
      }
      
      next()
    } catch (error) {
      logger.error('Error checking blocked status:', error)
      // En caso de error, permitir el acceso para no bloquear innecesariamente
      next()
    }
  }
}

/**
 * Middleware que verifica bloqueo usando el username del creador en los parámetros
 */
export function checkBlockedByUsernameMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).userId
      const username = req.params.username || req.params.creatorUsername
      
      // Si no hay usuario autenticado, continuar
      if (!userId || !username) {
        next()
        return
      }
      
      const isBlocked = await isUserBlockedByUsername(username, userId)
      
      if (isBlocked) {
        logger.debug(`Blocked user ${userId} tried to access creator @${username}`)
        res.status(403).json({ 
          error: 'No tienes acceso a este perfil',
          code: 'USER_BLOCKED'
        })
        return
      }
      
      next()
    } catch (error) {
      logger.error('Error checking blocked status by username:', error)
      next()
    }
  }
}

export default {
  isUserBlocked,
  isUserBlockedByUsername,
  checkBlockedMiddleware,
  checkBlockedByUsernameMiddleware
}
