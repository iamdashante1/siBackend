import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { ROLES } from '../lib/constants.js';
import { AppError, conflict, wrap } from '../lib/errors.js';
import { parseBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { notifyAdmins } from '../lib/notify.js';
import { config } from '../config.js';

const router = Router();

// Basic brute-force protection for logins.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.env === 'test',
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
});

const password = z
  .string({ required_error: 'Enter a password.' })
  .min(8, 'Use at least 8 characters.')
  .regex(/\d/, 'Include at least one number.');

// Public registration can only create students and employers. Admins come from the seed script.
const registerSchema = z.object({
  role: z.enum([ROLES.STUDENT, ROLES.EMPLOYER], { errorMap: () => ({ message: 'Choose student or employer.' }) }),
  name: z.string().trim().min(2, 'Enter your full name.').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password,
  organisation: z.string().trim().max(120).optional(),
});

router.post(
  '/register',
  wrap(async (req, res) => {
    const data = parseBody(registerSchema, req.body);
    if (data.role === ROLES.EMPLOYER && !data.organisation) {
      throw new AppError(400, 'Please fix the highlighted fields.', { organisation: 'Enter your organisation name.' });
    }
    if (await User.exists({ email: data.email })) throw conflict('An account with that email already exists.');

    const user = await User.create({
      name: data.name,
      email: data.email,
      passwordHash: await bcrypt.hash(data.password, 10),
      role: data.role,
      onboarded: false,
      // Employers must be verified by the placement office before they can publish.
      status: data.role === ROLES.EMPLOYER ? 'unverified' : 'active',
      employer: data.role === ROLES.EMPLOYER ? { company: data.organisation } : undefined,
    });
    if (data.role === ROLES.EMPLOYER) {
      await notifyAdmins('Employer registered', `${data.organisation} registered and needs verification.`);
    }
    await startSession(req, user);
    res.status(201).json({ user });
  }),
);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
  role: z.enum(Object.values(ROLES)).optional(),
});

router.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const { email, password: pw, role } = parseBody(loginSchema, req.body);
    const user = await User.findOne({ email });
    // Same message for unknown email and wrong password so we do not reveal which emails exist.
    const ok = user && (await bcrypt.compare(pw, user.passwordHash));
    if (!ok) throw new AppError(401, 'Incorrect email or password.');
    if (user.status === 'suspended') throw new AppError(403, 'This account has been suspended. Contact the placement office.');
    if (role && role !== user.role) {
      const label = { STUDENT: 'a student', EMPLOYER: 'an employer', ADMIN: 'a placement office' }[user.role];
      throw new AppError(401, `This account is registered as ${label} account. Choose the matching tab.`);
    }
    await startSession(req, user);
    res.json({ user });
  }),
);

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('placeme.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res, next) => {
  // Not logged in is a normal answer here, not an error: the UI uses it to decide what to show.
  if (!req.session?.userId) return res.json({ user: null });
  requireAuth(req, res, (err) => (err ? next(err) : res.json({ user: req.user })));
});

router.get(
  '/notifications',
  requireAuth,
  wrap(async (req, res) => {
    const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(10);
    res.json({ notifications: items });
  }),
);

// New session id on every login prevents session fixation.
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = String(user._id);
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

export default router;
