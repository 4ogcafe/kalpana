import type { RequestHandler } from 'express';

// Public content may be up to 60 s stale (PRD FR-A12); the admin UI fetches with cache: 'no-store'.
export const publicCache: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  next();
};
