import bcrypt from 'bcryptjs';
import express from 'express';
import { MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { db } from '../lib/mongo.js';
import { prisma } from '../lib/prisma.js';
import { definedOnly, idParam } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

const ROLES = ['ADMIN', 'STAFF', 'KITCHEN'] as const;
const BCRYPT_COST = 12;
const DUPLICATE_KEY = 11000;
const password = z.string().min(8, 'Password must be at least 8 characters').max(200);

const userUpdateSchema = z.object({
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  // Set a new password for a staff member who forgot theirs.
  password: password.optional(),
});

const userCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  role: z.enum(ROLES),
  password,
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

router.post('/', async (req, res) => {
  const input = userCreateSchema.parse(req.body);
  // Checked here too, in case the unique index was never created on this database.
  if (await db().collection('User').countDocuments({ email: input.email }, { limit: 1 })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'A user with this email already exists');
  }
  const now = new Date();
  const user = {
    _id: new ObjectId(),
    name: input.name,
    email: input.email,
    role: input.role,
    isActive: true,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db().collection('User').insertOne(user);
  } catch (err) {
    if (err instanceof MongoServerError && err.code === DUPLICATE_KEY) throw new AppError(409, 'EMAIL_TAKEN', 'A user with this email already exists');
    throw err;
  }
  res.status(201).json({ id: user._id.toHexString(), name: user.name, email: user.email, role: user.role, isActive: true, createdAt: now });
});

router.put('/:id', async (req, res) => {
  const id = idParam(req.params);
  const { password: newPassword, ...fields } = definedOnly(userUpdateSchema.parse(req.body));

  // An admin demoting or deactivating themselves could leave nobody able to manage the site.
  if (id.toHexString() === req.user?.id && ((fields.role && fields.role !== 'ADMIN') || fields.isActive === false)) {
    throw new AppError(400, 'SELF_LOCKOUT', 'You cannot remove your own admin access');
  }

  const update: Record<string, unknown> = { ...fields, updatedAt: new Date() };
  if (newPassword) update.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const result = await db().collection('User').updateOne({ _id: id }, { $set: update });
  if (result.matchedCount === 0) throw notFound('User');
  res.json({ success: true });
});

export default router;
