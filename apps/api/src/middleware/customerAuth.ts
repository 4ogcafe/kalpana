import type { Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { db } from '../lib/mongo.js';
import { readCookie } from './auth.js';

// Customers get their own cookie, token audience and collection, so a customer session can never
// reach staff routes (and a staff session is never mistaken for a customer).
export const CUSTOMER_COOKIE = 'kalpana_customer';
const CUSTOMER_AUDIENCE = 'customer';
const CUSTOMER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionCustomer {
  id: ObjectId;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: SessionCustomer;
    }
  }
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'strict' as const,
  path: '/',
});

export function issueCustomerSession(res: Response, customerId: ObjectId) {
  const token = jwt.sign({}, config.jwtSecret, {
    subject: customerId.toHexString(),
    audience: CUSTOMER_AUDIENCE,
    expiresIn: CUSTOMER_SESSION_TTL_SECONDS,
  });
  res.cookie(CUSTOMER_COOKIE, token, { ...cookieOptions(), maxAge: CUSTOMER_SESSION_TTL_SECONDS * 1000 });
}

export function clearCustomerSession(res: Response) {
  res.clearCookie(CUSTOMER_COOKIE, cookieOptions());
}

function customerIdFromToken(token: string): ObjectId | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], audience: CUSTOMER_AUDIENCE });
    if (typeof payload === 'object' && typeof payload.sub === 'string' && /^[a-f\d]{24}$/i.test(payload.sub)) {
      return new ObjectId(payload.sub);
    }
  } catch {
    // invalid or expired token
  }
  return null;
}

/** Loads the customer on every request so a disabled account is signed out immediately. */
async function loadCustomer(req: Request): Promise<SessionCustomer | null> {
  const token = readCookie(req, CUSTOMER_COOKIE);
  const id = token ? customerIdFromToken(token) : null;
  if (!id) return null;
  const customer = await db()
    .collection('Customer')
    .findOne({ _id: id, isActive: { $ne: false } }, { projection: { name: 1, email: 1 } });
  return customer ? { id: customer._id, name: customer.name, email: customer.email } : null;
}

/** Attaches req.customer when a valid session exists; guests continue without one. */
export const optionalCustomer: RequestHandler = async (req, _res, next) => {
  req.customer = (await loadCustomer(req)) ?? undefined;
  next();
};

export const requireCustomer: RequestHandler = async (req, _res, next) => {
  const customer = await loadCustomer(req);
  if (!customer) throw new AppError(401, 'UNAUTHENTICATED', 'ログインしてください');
  req.customer = customer;
  next();
};
