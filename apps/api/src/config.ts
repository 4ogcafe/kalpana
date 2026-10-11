import crypto from 'node:crypto';
import path from 'node:path';
import { logger } from './lib/logger.js';

const isProduction = process.env.NODE_ENV === 'production';
const MIN_SECRET_LENGTH = 32;

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret;
  if (isProduction) {
    throw new Error(`JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters in production`);
  }
  logger.warn('JWT_SECRET is missing or too short; using a random secret for this process (sessions reset on restart)');
  return crypto.randomBytes(48).toString('hex');
}

function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  const hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
}

export const config = {
  isProduction,
  port: Number(process.env.PORT) || 4000,
  databaseUrl: process.env.DATABASE_URL || 'mongodb://localhost:27017/kalpanarestro',
  jwtSecret: resolveJwtSecret(),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  uploadDir: path.join(process.cwd(), 'public', 'uploads'),
};
