import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import settingsRoutes from './routes/settings.js';
import carouselsRoutes from './routes/carousels.js';
import contactRoutes from './routes/contact.js';
import usersRoutes from './routes/users.js';
import uploadRoutes from './routes/upload.js';
import dashboardRoutes from './routes/dashboard.js';

const JSON_BODY_LIMIT = '100kb';
const UPLOAD_MAX_AGE = '30d';

export function createApp() {
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  // Images are loaded by the web app, which may run on another origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Upload names are unique, so files can be cached for a long time. The sandbox CSP stops any
  // file that slipped through from running scripts on this origin.
  app.use(
    '/uploads',
    express.static(config.uploadDir, {
      maxAge: UPLOAD_MAX_AGE,
      immutable: true,
      setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox"),
    }),
  );

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/menu', menuRoutes);
  app.use('/api/v1/settings', settingsRoutes);
  app.use('/api/v1/carousels', carouselsRoutes);
  app.use('/api/v1/contact', contactRoutes);
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/upload', uploadRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
