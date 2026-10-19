import { Request, Response, NextFunction } from 'express';
import { db, User } from './db';
import crypto from 'crypto';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

// In-memory active tokens mapped to User ID with expiration
const activeTokens = new Map<string, { userId: string; expiresAt: number }>();

export function generateToken(userId: string): string {
  const token = 'ssu_tk_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  activeTokens.set(token, { userId, expiresAt });
  return token;
}

export function revokeToken(token: string) {
  activeTokens.delete(token);
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  let token: string | undefined;

  // 1. Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Check cookie if header not present
  if (!token && req.cookies && req.cookies.ssu_auth_token) {
    token = req.cookies.ssu_auth_token;
  }

  if (!token) {
    return next();
  }

  const record = activeTokens.get(token);
  if (!record || record.expiresAt < Date.now()) {
    if (record) activeTokens.delete(token);
    return next();
  }

  const user = db.users.find(u => u.id === record.userId && u.isActive);
  if (user) {
    req.user = user;
  }

  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  next();
}

export function requireRole(allowedRoles: Array<'ADMIN' | 'TEACHER' | 'STUDENT'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Access requires one of [${allowedRoles.join(', ')}] role. Your role is ${req.user.role}.`,
      });
    }
    next();
  };
}
