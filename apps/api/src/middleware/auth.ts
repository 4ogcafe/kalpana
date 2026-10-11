import type { Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

export const SESSION_COOKIE = 'kalpana_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction,
  // strict keeps the admin cookie off cross-site requests, which is our CSRF protection.
  sameSite: 'strict' as const,
  path: '/',
});

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function issueSession(res: Response, user: SessionUser) {
  const token = jwt.sign({ role: user.role }, config.jwtSecret, { subject: user.id, expiresIn: SESSION_TTL_SECONDS });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL_SECONDS * 1000 });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Please log in');

function verifiedUserId(token: string): string {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'object' && typeof payload.sub === 'string' && /^[a-f\d]{24}$/i.test(payload.sub)) {
      return payload.sub;
    }
  } catch {
    // fall through: invalid or expired token
  }
  throw unauthenticated();
}

/** Loads the user on every request so deactivation and role changes apply immediately. */
async function authenticate(req: Request): Promise<SessionUser> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) throw unauthenticated();
  const user = await prisma.user.findUnique({
    where: { id: verifiedUserId(token) },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) throw unauthenticated();
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  async (req, _res, next) => {
    const user = await authenticate(req);
    if (!roles.includes(user.role)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
    req.user = user;
    next();
  };

export const requireAuth = requireRole('ADMIN', 'STAFF');
export const requireAdmin = requireRole('ADMIN');
export const requireStaff = requireRole('ADMIN', 'STAFF');
