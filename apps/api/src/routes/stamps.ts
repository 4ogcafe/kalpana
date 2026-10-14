import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { db } from '../lib/mongo.js';
import { idParam, optionalText } from '../lib/schemas.js';
import { MEMBER_CODE_PATTERN, normalizeMemberCode } from '../lib/stamps.js';
import { requireStaff } from '../middleware/auth.js';
import { awardStamp, memberCodeFor, stampCardFor, useReward } from '../services/stamps.js';

// The counter: staff scan (or type) a member's code, give a stamp for an in-store visit, and
// hand over rewards. Online orders are stamped automatically when they are completed.

const router = express.Router();
router.use(requireStaff);

const MAX_AMOUNT = 10_000_000;
const stampSchema = z.object({ amount: z.number().int().min(0).max(MAX_AMOUNT), note: optionalText(200) });

async function memberByCode(rawCode: string) {
  const code = normalizeMemberCode(rawCode);
  if (!MEMBER_CODE_PATTERN.test(code)) throw new AppError(400, 'INVALID_CODE', 'That is not a member code.');
  const customer = await db()
    .collection('Customer')
    .findOne({ memberCode: code, deletedAt: { $exists: false } }, { projection: { name: 1, nameKana: 1, isActive: 1 } });
  if (!customer || customer.isActive === false) throw notFound('Member');
  return customer;
}

const audit = (userId: string, action: string, entityId: string, diff: unknown) =>
  db().collection('AuditLog').insertOne({ _id: new ObjectId(), userId: new ObjectId(userId), action, entity: 'Customer', entityId, diff, createdAt: new Date() });

const memberView = async (customer: Record<string, unknown>) => ({
  member: { id: String(customer._id), name: customer.name, nameKana: customer.nameKana ?? '' },
  card: await stampCardFor(customer._id as ObjectId),
});

const SEARCH_LIMIT = 10;
const searchSchema = z.object({ q: z.string().trim().min(1).max(100) });
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * For members without their phone at hand: find them by code, name, kana, email or phone.
 * Each match gets a member code (created if they never opened their card) so staff can open it.
 */
router.get('/search', async (req, res) => {
  const { q } = searchSchema.parse(req.query);
  const code = normalizeMemberCode(q);
  const digits = q.replace(/\D/g, '');
  const text = new RegExp(escapeRegex(q), 'i');
  const or: Record<string, unknown>[] = [{ name: text }, { nameKana: text }, { email: text }];
  if (MEMBER_CODE_PATTERN.test(code)) or.push({ memberCode: code });
  // Phone numbers are stored as typed (090-1234-5678), so match the digits with optional separators.
  if (digits.length >= 4) {
    // 070-1234-5678 and +81 70-1234-5678 are the same number.
    const forms = new Set([digits]);
    if (digits.startsWith('0')) forms.add(`81${digits.slice(1)}`);
    if (digits.startsWith('81')) forms.add(`0${digits.slice(2)}`);
    for (const form of forms) or.push({ phone: new RegExp(form.split('').join('[\\s()+-]*')) });
  }

  const customers = await db()
    .collection('Customer')
    .find({ deletedAt: { $exists: false }, isActive: { $ne: false }, $or: or }, { projection: { name: 1, nameKana: 1, email: 1, phone: 1 } })
    .sort({ name: 1 })
    .limit(SEARCH_LIMIT)
    .toArray();
  res.setHeader('Cache-Control', 'no-store');
  res.json(
    await Promise.all(
      customers.map(async (customer) => ({
        name: customer.name,
        nameKana: customer.nameKana ?? '',
        email: customer.email,
        phone: customer.phone ?? '',
        memberCode: await memberCodeFor(customer._id),
      })),
    ),
  );
});

router.get('/member/:code', async (req, res) => {
  const customer = await memberByCode(String(req.params.code));
  res.setHeader('Cache-Control', 'no-store');
  res.json(await memberView(customer));
});

/** One stamp for an in-store purchase; the same minimum amount and time gap apply as online. */
router.post('/member/:code', async (req, res) => {
  const customer = await memberByCode(String(req.params.code));
  const { amount, note } = stampSchema.parse(req.body);
  const result = await awardStamp(customer._id, { source: 'STAFF', amount, userId: req.user!.id, note: note ?? undefined });

  if (result.status === 'DISABLED') throw new AppError(409, 'STAMPS_DISABLED', 'The stamp card is switched off.');
  if (result.status === 'NOT_FOUND') throw notFound('Member');
  if (result.status === 'BELOW_MINIMUM') {
    throw new AppError(409, 'BELOW_MINIMUM', `A stamp needs a purchase of at least ¥${result.minAmount.toLocaleString('en-US')}.`, { minAmount: result.minAmount });
  }
  if (result.status === 'TOO_SOON') {
    throw new AppError(409, 'TOO_SOON', 'This member already got a stamp recently.', { nextAt: result.nextAt.toISOString() });
  }
  await audit(req.user!.id, 'customer.stamp', customer._id.toHexString(), { amount, position: result.position, note: note ?? null });
  res.status(201).json({ result, ...(await memberView(customer)) });
});

/** Hands over a reward at the counter (e.g. the free naan upgrade with a dine-in set). */
router.post('/rewards/:id/use', async (req, res) => {
  const id = idParam(req.params);
  const reward = await db().collection('StampReward').findOne({ _id: id });
  if (!reward) throw notFound('Reward');
  const used = await useReward(id, reward.customerId, { userId: req.user!.id });
  if (!used) throw new AppError(409, 'REWARD_UNAVAILABLE', 'This reward was already used or has expired.');
  await audit(req.user!.id, 'customer.reward_used', reward.customerId.toHexString(), { rewardId: id.toHexString(), titleJa: reward.titleJa });
  res.json({ success: true });
});

export default router;
