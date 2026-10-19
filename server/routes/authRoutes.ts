import { Router } from 'express';
import { db, User } from '../db';
import { generateToken, revokeToken, AuthenticatedRequest, requireAuth } from '../auth';
import { AuditService } from '../services/auditService';

export const authRouter = Router();

// Login
authRouter.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username/Email and password are required.' });
  }

  const cleanUser = String(username).trim().toLowerCase();
  const user = db.users.find(
    u => (u.username.toLowerCase() === cleanUser || u.email.toLowerCase() === cleanUser) && u.isActive
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials or inactive account.' });
  }

  if (!db.verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  // Existing local development data used a legacy hash. Upgrade it only
  // after the user has proved knowledge of the current password.
  if (db.passwordNeedsUpgrade(user.passwordHash)) {
    user.passwordHash = db.hashPassword(password);
    user.updatedAt = new Date().toISOString();
    db.save();
  }

  const token = generateToken(user.id);

  // Set HTTP-only secure cookie as well
  res.cookie('ssu_auth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  let profile: any = null;
  if (user.role === 'TEACHER') {
    profile = db.teacherProfiles.find(tp => tp.userId === user.id);
  } else if (user.role === 'STUDENT') {
    profile = db.studentProfiles.find(sp => sp.userId === user.id);
  }

  AuditService.log({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'USER_LOGIN',
    targetType: 'USER',
    targetId: user.id,
    details: { username: user.username, role: user.role },
    ipAddress: req.ip,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    profile,
  });
});

// Get current logged-in user profile
authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  let profile: any = null;
  if (user.role === 'TEACHER') {
    profile = db.teacherProfiles.find(tp => tp.userId === user.id);
  } else if (user.role === 'STUDENT') {
    profile = db.studentProfiles.find(sp => sp.userId === user.id);
  }

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    profile,
  });
});

// Logout
authRouter.post('/logout', (req: AuthenticatedRequest, res) => {
  const token = req.cookies?.ssu_auth_token || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.split(' ')[1]);
  if (token) {
    revokeToken(token);
  }
  res.clearCookie('ssu_auth_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res.json({ success: true, message: 'Logged out successfully.' });
});
