import { User } from '../models/User.js';
import { AppError, forbidden, wrap } from '../lib/errors.js';
import { tokenFromRequest, verifyToken } from '../lib/tokens.js';

// Loads the user named by the JWT on every request, so a suspended account loses access immediately
// instead of when its token expires. Returns null when nobody is signed in.
export async function userFromRequest(req) {
  const id = verifyToken(tokenFromRequest(req));
  if (!id) return null;
  const user = await User.findById(id).catch(() => null);
  if (!user) return null;
  if (user.status === 'suspended') throw new AppError(403, 'This account has been suspended. Contact the placement office.');
  return user;
}

export const requireAuth = wrap(async (req, _res, next) => {
  const user = await userFromRequest(req);
  if (!user) throw new AppError(401, 'Please log in to continue.');
  req.user = user;
  next();
});

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

// Simple CSRF defence: state-changing requests must carry a custom header,
// which a cross-site form or image cannot add. Our fetch wrapper always sends it.
export function requireCustomHeader(req, _res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!safe && req.get('X-Requested-With') !== 'placeme') {
    return next(new AppError(403, 'Missing request header.'));
  }
  next();
}
