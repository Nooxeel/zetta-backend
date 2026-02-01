/**
 * Middleware de autenticación compartido
 * Supports both Bearer token (Authorization header) and httpOnly cookie
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_COOKIE_NAME } from '../lib/cookies';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set. Application cannot start without it.');
}

export interface AuthRequest extends Request {
  userId?: string;
  isCreator?: boolean;
  role?: string;
  user?: { userId: string; isCreator?: boolean; role?: string };
}

/**
 * Helper para obtener userId de forma type-safe
 * Usar después de authenticate middleware
 */
export function getUserId(req: Request): string {
  return (req as AuthRequest).userId!;
}

/**
 * Helper para obtener user info de forma type-safe
 */
export function getUser(req: Request): { userId: string; isCreator?: boolean } {
  return (req as AuthRequest).user!;
}

/**
 * Extract token from request (header or cookie)
 */
function getTokenFromRequest(req: Request): string | null {
  // 1. Try Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  
  // 2. Try httpOnly cookie
  const cookieToken = req.cookies?.[JWT_COOKIE_NAME];
  if (cookieToken) {
    return cookieToken;
  }
  
  return null;
}

/**
 * Middleware para verificar JWT y extraer userId e isCreator
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = getTokenFromRequest(req);
    
    if (!token) {
      res.status(401).json({ error: 'Token no proporcionado' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; isCreator?: boolean; role?: string };
    
    // Compatibilidad: establecer en múltiples propiedades para código existente
    (req as AuthRequest).userId = decoded.userId;
    (req as AuthRequest).isCreator = decoded.isCreator;
    (req as AuthRequest).role = decoded.role;
    (req as AuthRequest).user = { userId: decoded.userId, isCreator: decoded.isCreator, role: decoded.role };
    
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

/**
 * Middleware opcional de autenticación - extrae userId si hay token válido, pero no falla si no lo hay
 * Útil para rutas públicas que necesitan saber si hay un usuario autenticado
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = getTokenFromRequest(req);
    
    if (!token) {
      // No hay token, continuar sin userId
      next();
      return;
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; isCreator?: boolean; role?: string };
      
      (req as AuthRequest).userId = decoded.userId;
      (req as AuthRequest).isCreator = decoded.isCreator;
      (req as AuthRequest).role = decoded.role;
      (req as AuthRequest).user = { userId: decoded.userId, isCreator: decoded.isCreator, role: decoded.role };
    } catch {
      // Token inválido, continuar sin userId
    }
    
    next();
  } catch (error) {
    // En caso de error inesperado, continuar sin autenticación
    next();
  }
};

/**
 * Middleware para verificar que el usuario sea SUPER_ADMIN
 * Debe usarse después de authenticate middleware
 */
export const requireSuperAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.role || authReq.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Acceso denegado: Se requieren permisos de administrador' });
      return;
    }
    
    next();
  } catch (error) {
    res.status(403).json({ error: 'Acceso denegado' });
  }
};

export default authenticate;
