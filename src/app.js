import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import MongoStore from 'connect-mongo';
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

export function createApp({ mongoUrl, secret = config.sessionSecret, production = config.env === 'production' } = {}) {
  if (!secret) throw new Error('SESSION_SECRET is not set. Copy .env.example to .env and set it.');

  const app = express();
  if (production) app.set('trust proxy', 1); // needed for secure cookies behind a hosting proxy
  app.use(helmet());
  app.use(express.json({ limit: '3mb' })); // CV uploads are sent as base64 JSON (max 2 MB file)

  const store = MongoStore.create({ mongoUrl, ttl: 7 * 24 * 60 * 60 });
  app.locals.sessionStore = store;
  app.use(
    session({
      name: 'placeme.sid',
      secret,
      resave: false,
      saveUninitialized: false,
      store,
      cookie: { httpOnly: true, sameSite: 'lax', secure: production, maxAge: 7 * 24 * 60 * 60 * 1000 },
    }),
  );
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
