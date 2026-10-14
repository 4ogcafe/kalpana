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
  // New member accounts allowed per IP per hour (spam protection).
  registerMaxPerHour: Number(process.env.REGISTER_MAX_PER_HOUR) || 10,
  // Orders allowed per IP per hour (spam protection).
  orderMaxPerHour: Number(process.env.ORDER_MAX_PER_HOUR) || 10,
  // Google Places API key (server only) for showing the restaurant's Google rating and reviews.
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY?.trim() || '',
  uploadDir: path.join(process.cwd(), 'public', 'uploads'),
  // Built web app (`pnpm --filter web build`). When present, the API serves the site too.
  webDistDir: path.resolve(process.env.WEB_DIST_DIR || path.join(process.cwd(), '..', 'web', 'dist')),
  square: {
    accessToken: process.env.SQUARE_ACCESS_TOKEN?.trim() || '',
    locationId: process.env.SQUARE_LOCATION_ID?.trim() || '',
    environment: (process.env.SQUARE_ENVIRONMENT?.trim() || 'sandbox') as 'sandbox' | 'production',
    webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY?.trim() || '',
  },
};
