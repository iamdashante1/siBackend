import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const COOKIE = 'placeme.token';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' });

// Returns the user id inside a valid token, or null.
export function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }).sub || null;
  } catch {
    return null;
  }
}

// The token travels in an httpOnly cookie (not readable by page scripts) and is also accepted as a Bearer header.
export function tokenFromRequest(req) {
  const bearer = req.get('authorization');
  if (bearer?.startsWith('Bearer ')) return bearer.slice(7);
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: config.env === 'production', path: '/' });
export const setAuthCookie = (res, token) => res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: WEEK_MS });
export const clearAuthCookie = (res) => res.clearCookie(COOKIE, cookieOptions());
