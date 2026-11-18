import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { requireAuth, requireCustomHeader } from './middleware/auth.js';
import { errorHandler } from './middleware/validate.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import opportunityRoutes from './routes/opportunities.js';
import applicationRoutes from './routes/applications.js';
import interviewRoutes from './routes/interviews.js';
import placementRoutes from './routes/placements.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';

export function createApp({ production = config.env === 'production' } = {}) {
  const app = express();
  if (production) app.set('trust proxy', 1); // behind the hosting proxy
  // Profile photos are served from Cloudinary, so allow images from there.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'img-src': ["'self'", 'data:', 'https://res.cloudinary.com'] },
      },
    }),
  );
  app.use(express.json({ limit: '3mb' })); // CV uploads are sent as base64 JSON (max 2 MB file)

  app.use('/api', requireCustomHeader);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);

  // Everything below needs a logged-in user. Role checks live inside each router.
  app.use('/api', requireAuth);
  app.use('/api/profile', profileRoutes);
  app.use('/api/opportunities', opportunityRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/interviews', interviewRoutes);
  app.use('/api/placements', placementRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(errorHandler);
  return app;
}
