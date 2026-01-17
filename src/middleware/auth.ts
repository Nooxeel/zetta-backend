/**
 * Middleware de autenticación compartido
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is not set. Application cannot start without it.');
}

export interface AuthRequest extends Request {
  userId?: string;
  isCreator?: boolean;
  user?: { userId: string; isCreator?: boolean };
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
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token no proporcionado' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; isCreator?: boolean };
    
    // Compatibilidad: establecer en múltiples propiedades para código existente
    (req as AuthRequest).userId = decoded.userId;
    (req as AuthRequest).isCreator = decoded.isCreator;
    (req as AuthRequest).user = { userId: decoded.userId, isCreator: decoded.isCreator };
    
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

export default authenticate;
