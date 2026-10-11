import express from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { db } from '../lib/mongo.js';
import { prisma } from '../lib/prisma.js';
import { definedOnly, idParam } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

const userUpdateSchema = z.object({
  role: z.enum(['ADMIN', 'STAFF']).optional(),
  isActive: z.boolean().optional(),
});

router.use(requireAdmin);

router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json(users);
});

router.put('/:id', async (req, res) => {
  const id = idParam(req.params);
  const fields = definedOnly(userUpdateSchema.parse(req.body));

  // An admin demoting or deactivating themselves could leave nobody able to manage the site.
  if (id.toHexString() === req.user?.id && (fields.role === 'STAFF' || fields.isActive === false)) {
    throw new AppError(400, 'SELF_LOCKOUT', 'You cannot remove your own admin access');
  }

  const result = await db()
    .collection('User')
    .updateOne({ _id: id }, { $set: { ...fields, updatedAt: new Date() } });
  if (result.matchedCount === 0) throw notFound('User');
  res.json({ success: true });
});

export default router;
