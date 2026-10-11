import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { db } from '../lib/mongo.js';
import { prisma } from '../lib/prisma.js';
import { idParam, optionalNumber, optionalText } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

const CONTACT_WINDOW_MS = 60 * 60 * 1000;
const CONTACT_MAX_PER_WINDOW = 5;

const messageSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  phone: optionalText(30),
  type: z.enum(['GENERAL', 'RESERVATION', 'CATERING', 'FEEDBACK']).default('GENERAL'),
  message: z.string().trim().max(5000).default(''),
  date: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.coerce.date().optional(),
  ),
  guests: optionalNumber(z.number().int().min(1).max(100)),
  // Honeypot: hidden from people, filled in by bots.
  website: z.string().optional(),
});

const contactLimiter = rateLimit({
  windowMs: CONTACT_WINDOW_MS,
  max: CONTACT_MAX_PER_WINDOW,
  key: (req) => req.ip ?? 'unknown',
});

router.get('/', requireAdmin, async (_req, res) => {
  const messages = await prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' } });
  res.setHeader('Cache-Control', 'no-store');
  res.json(messages);
});

router.post('/', contactLimiter, async (req, res) => {
  const { website, ...input } = messageSchema.parse(req.body);
  if (website) {
    // Pretend success so bots don't learn they were filtered.
    res.status(201).json({ success: true });
    return;
  }

  const now = new Date();
  const message = {
    _id: new ObjectId(),
    name: input.name,
    email: input.email,
    phone: input.phone ?? '',
    type: input.type,
    message: input.message,
    date: input.date ?? null,
    guests: input.guests ?? null,
    isRead: false,
    ip: req.ip ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db().collection('ContactMessage').insertOne(message);
  res.status(201).json({ success: true, id: message._id.toHexString() });
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { isRead } = z.object({ isRead: z.boolean() }).parse(req.body);
  const result = await db()
    .collection('ContactMessage')
    .updateOne({ _id: idParam(req.params) }, { $set: { isRead, updatedAt: new Date() } });
  if (result.matchedCount === 0) throw notFound('Message');
  res.json({ success: true });
});

export default router;
