import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { authMiddleware } from './auth';
import { authRouter } from './routes/authRoutes';
import { adminRouter } from './routes/adminRoutes';
import { teacherRouter } from './routes/teacherRoutes';
import { studentRouter } from './routes/studentRoutes';
import { attendanceRouter } from './routes/attendanceRoutes';
import { registrationRouter } from './routes/registrationRoutes';
import { db } from './db';

/** Creates the API shared by the local Express server and Vercel functions. */
export function createApp() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const publicUrl = process.env.APP_URL;
  // Same-origin browser requests do not need CORS. If a separate trusted
  // frontend is used, APP_URL may opt it in explicitly; arbitrary origins are
  // never reflected in production.
  const allowedOrigin = isProduction
    ? (publicUrl ? new URL(publicUrl).origin : false)
    : true;

  // The app is normally same-origin. In production, never reflect arbitrary
  // origins while allowing credentials, because that can expose login tokens.
  app.set('trust proxy', 1);

  app.use(cors({
    origin: allowedOrigin,
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use(authMiddleware);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.get('/api/public/branding', (_req, res) => {
    res.json({
      institutionName: db.settings.institutionName,
      logoDataUrl: db.settings.logoDataUrl || null,
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/teacher', teacherRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/public', registrationRouter);

  return app;
}
