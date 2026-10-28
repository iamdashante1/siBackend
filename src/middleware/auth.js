import { User } from '../models/User.js';
import { AppError, forbidden, wrap } from '../lib/errors.js';

// Loads the logged-in user from the session on every request, so a suspended
// account loses access immediately instead of when its cookie expires.
export const requireAuth = wrap(async (req, _res, next) => {
  const id = req.session?.userId;
  if (!id) throw new AppError(401, 'Please log in to continue.');
  const user = await User.findById(id);
  if (!user || user.status === 'suspended') {
    req.session.destroy(() => {});
    throw new AppError(401, 'Your session has ended. Please log in again.');
  }
  req.user = user;
  next();
});

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

// Simple CSRF defence for cookie sessions: state-changing requests must carry a custom header,
// which a cross-site form or image cannot add. Our fetch wrapper always sends it.
export function requireCustomHeader(req, _res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!safe && req.get('X-Requested-With') !== 'placeme') {
    return next(new AppError(403, 'Missing request header.'));
  }
  next();
}
