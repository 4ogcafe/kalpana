import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import express from 'express';
import { MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError, notFound } from '../lib/errors.js';
import { isOfferLive, loyaltyConfig, type OfferRule } from '../lib/loyalty.js';
import { profileSchema, profileUpdate, publicProfile } from '../lib/customer-profile.js';
import { db } from '../lib/mongo.js';
import { idParam, optionalText } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { clearCustomerSession, issueCustomerSession, optionalCustomer, requireCustomer } from '../middleware/customerAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { offerAlreadyUsed, pricingSummary } from '../services/order-pricing.js';
import { changePoints } from '../services/points.js';
import { loadSettings } from '../services/settings-store.js';
import { stampCardFor } from '../services/stamps.js';
import { stampConfig } from '../lib/stamps.js';

const router = express.Router();

const BCRYPT_COST = 12;
const MIN_PASSWORD = 8;
const HOUR_MS = 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ORDER_HISTORY_LIMIT = 100;
const POINT_HISTORY_LIMIT = 100;
const ADMIN_LIST_LIMIT = 500;
const DUPLICATE_KEY = 11000;

const email = z.email().max(254).transform((value) => value.trim().toLowerCase());
const password = z.string().min(MIN_PASSWORD, `パスワードは${MIN_PASSWORD}文字以上にしてください`).max(200);
const phone = z.union([z.literal(''), z.string().trim().regex(/^[\d\s()+-]{8,20}$/, '電話番号の形式が正しくありません')]).nullable().optional();

const registerSchema = z.object({ name: z.string().trim().min(1).max(100), email, phone, password });
const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
const emailChangeSchema = z.object({ email, currentPassword: z.string().min(1).max(200) });
const deleteSchema = z.object({ currentPassword: z.string().min(1).max(200) });
const passwordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });
const resetSchema = z.object({ password });
const adjustSchema = z.object({ points: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0), note: optionalText(200) });

const registerLimiter = rateLimit({ windowMs: HOUR_MS, max: config.registerMaxPerHour, key: (req) => req.ip ?? 'unknown' });
const loginLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: 10,
  failuresOnly: true,
  key: (req) => `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
});

let indexesReady: Promise<unknown> | undefined;
const ensureIndexes = () =>
  (indexesReady ??= Promise.all([
    db().collection('Customer').createIndex({ email: 1 }, { unique: true }),
    db().collection('PointTransaction').createIndex({ customerId: 1, createdAt: -1 }),
    db().collection('PickupOrder').createIndex({ customerId: 1, createdAt: -1 }),
  ]));

let dummyHash: string | undefined;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash('not-a-real-password', BCRYPT_COST));

// ---- Account -------------------------------------------------------------

router.post('/register', registerLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  await ensureIndexes();
  const now = new Date();
  const customer = {
    _id: new ObjectId(),
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
    points: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db().collection('Customer').insertOne(customer);
  } catch (err) {
    if (err instanceof MongoServerError && err.code === DUPLICATE_KEY) {
      throw new AppError(409, 'EMAIL_TAKEN', 'このメールアドレスはすでに登録されています。ログインしてください。');
    }
    throw err;
  }

  const loyalty = loyaltyConfig(await loadSettings());
  if (loyalty.enabled && loyalty.signupBonusPoints > 0) {
    await changePoints(customer._id, loyalty.signupBonusPoints, 'BONUS', { note: '新規会員登録ボーナス' });
  }
  issueCustomerSession(res, customer._id);
  const saved = await db().collection('Customer').findOne({ _id: customer._id });
  res.status(201).json({ customer: publicProfile(saved ?? customer) });
});

router.post('/login', loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const customer = await db().collection('Customer').findOne({ email: input.email });
  const matches = await bcrypt.compare(input.password, customer?.passwordHash ?? (await getDummyHash()));
  if (!customer || !matches || customer.isActive === false) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'メールアドレスまたはパスワードが正しくありません。');
  }
  issueCustomerSession(res, customer._id);
  res.json({ customer: publicProfile(customer) });
});

router.post('/logout', (_req, res) => {
  clearCustomerSession(res);
  res.status(204).end();
});

// Answers guests too ({ customer: null }), so every page load's "who is signed in?" check isn't a 401 in the console.
router.get('/me', optionalCustomer, async (req, res) => {
  const customer = req.customer ? await db().collection('Customer').findOne({ _id: req.customer.id }) : null;
  res.setHeader('Cache-Control', 'no-store');
  if (!customer) {
    res.json({ customer: null, loyalty: null });
    return;
  }
  const loyalty = loyaltyConfig(await loadSettings());
  res.json({ customer: publicProfile(customer), loyalty: { enabled: loyalty.enabled, pointsPer100Yen: loyalty.pointsPer100Yen, pointValueYen: loyalty.pointValueYen } });
});

router.put('/me', requireCustomer, async (req, res) => {
  const update = { ...profileUpdate(profileSchema.parse(req.body)), updatedAt: new Date() };
  const customer = await db().collection('Customer').findOneAndUpdate({ _id: req.customer!.id }, { $set: update }, { returnDocument: 'after' });
  if (!customer) throw notFound('Customer');
  res.json({ customer: publicProfile(customer) });
});

/** The member's record, after checking their current password. */
async function verifiedCustomer(customerId: ObjectId, currentPassword: string) {
  const customer = await db().collection('Customer').findOne({ _id: customerId });
  if (!customer || !(await bcrypt.compare(currentPassword, customer.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', '現在のパスワードが正しくありません。');
  }
  return customer;
}

/** The email is the login, so changing it needs the current password. */
router.put('/me/email', requireCustomer, async (req, res) => {
  const input = emailChangeSchema.parse(req.body);
  await verifiedCustomer(req.customer!.id, input.currentPassword);
  await ensureIndexes();
  try {
    const customer = await db()
      .collection('Customer')
      .findOneAndUpdate({ _id: req.customer!.id }, { $set: { email: input.email, updatedAt: new Date() } }, { returnDocument: 'after' });
    res.json({ customer: customer && publicProfile(customer) });
  } catch (err) {
    if (err instanceof MongoServerError && err.code === DUPLICATE_KEY) {
      throw new AppError(409, 'EMAIL_TAKEN', 'このメールアドレスはすでに使われています。');
    }
    throw err;
  }
});

/**
 * Closes the account. Personal details are erased, but the record stays (anonymised) so past
 * orders keep their history for the restaurant's books.
 */
router.delete('/me', requireCustomer, async (req, res) => {
  const { currentPassword } = deleteSchema.parse(req.body);
  const customer = await verifiedCustomer(req.customer!.id, currentPassword);
  const active = await db()
    .collection('PickupOrder')
    .countDocuments({ customerId: customer._id, status: { $in: ['NEW', 'CONFIRMED', 'READY'] } }, { limit: 1 });
  if (active) throw new AppError(409, 'ACTIVE_ORDERS', '進行中のご注文があるため、受け取り後に退会してください。');

  await db().collection('Customer').updateOne(
    { _id: customer._id },
    {
      $set: {
        email: `deleted-${customer._id.toHexString()}@deleted.invalid`,
        name: '退会済み会員',
        passwordHash: await bcrypt.hash(crypto.randomUUID(), BCRYPT_COST),
        isActive: false,
        points: 0,
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
      $unset: { nameKana: '', phone: '', birthDate: '', address: '', preferences: '', newsletterOptIn: '', newsletterOptInAt: '' },
    },
  );
  await db().collection('PickupOrder').updateMany({ customerId: customer._id }, { $set: { customerName: '退会済み会員', phone: '', email: null } });
  clearCustomerSession(res);
  res.status(204).end();
});

router.put('/me/password', requireCustomer, async (req, res) => {
  const input = passwordSchema.parse(req.body);
  const customer = await db().collection('Customer').findOne({ _id: req.customer!.id });
  if (!customer || !(await bcrypt.compare(input.currentPassword, customer.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', '現在のパスワードが正しくありません。');
  }
  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
  await db().collection('Customer').updateOne({ _id: customer._id }, { $set: { passwordHash, updatedAt: new Date() } });
  res.json({ success: true });
});

// ---- Member data ---------------------------------------------------------

router.get('/me/orders', requireCustomer, async (req, res) => {
  const orders = await db()
    .collection('PickupOrder')
    .find({ customerId: req.customer!.id })
    .sort({ createdAt: -1 })
    .limit(ORDER_HISTORY_LIMIT)
    .toArray();
  res.setHeader('Cache-Control', 'no-store');
  res.json(
    orders.map((order) => ({
      token: order.token,
      number: order.number,
      status: order.status,
      pickupAt: order.pickupAt,
      createdAt: order.createdAt,
      items: order.items.map((line: Record<string, unknown>) => ({
        itemId: String(line.itemId),
        nameEn: line.nameEn,
        nameJa: line.nameJa,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
      })),
      ...pricingSummary(order),
      stampAwarded: Boolean(order.stampAwarded),
    })),
  );
});

/** The member's stamp card: stamps on the current card, rewards to use, and the in-store code. */
router.get('/me/stamps', requireCustomer, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await stampCardFor(req.customer!.id));
});

router.get('/me/points', requireCustomer, async (req, res) => {
  const [customer, history] = await Promise.all([
    db().collection('Customer').findOne({ _id: req.customer!.id }, { projection: { points: 1 } }),
    db().collection('PointTransaction').find({ customerId: req.customer!.id }).sort({ createdAt: -1 }).limit(POINT_HISTORY_LIMIT).toArray(),
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    balance: Number(customer?.points) || 0,
    history: history.map((entry) => ({
      id: entry._id.toHexString(),
      type: entry.type,
      points: entry.points,
      balanceAfter: entry.balanceAfter,
      orderNumber: entry.orderNumber,
      note: entry.note,
      createdAt: entry.createdAt,
    })),
  });
});

/** Live offers, each marked with whether this member can still use it. */
router.get('/me/offers', requireCustomer, async (req, res) => {
  const offers = (await db().collection('Offer').find({ isActive: { $ne: false } }).sort({ endsAt: 1, createdAt: -1 }).toArray()).filter((offer) =>
    isOfferLive(offer as unknown as OfferRule),
  );
  const result = await Promise.all(
    offers.map(async (offer) => ({
      id: offer._id.toHexString(),
      titleJa: offer.titleJa,
      descriptionJa: offer.descriptionJa ?? '',
      imageUrl: offer.imageUrl ?? '',
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      minSubtotal: offer.minSubtotal ?? 0,
      endsAt: offer.endsAt ?? null,
      // When it became available, so the member's page can mark new offers.
      startsAt: offer.startsAt ?? offer.createdAt ?? null,
      oncePerCustomer: Boolean(offer.oncePerCustomer),
      used: offer.oncePerCustomer ? await offerAlreadyUsed(offer._id, req.customer!.id) : false,
    })),
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json(result);
});

// ---- Admin ---------------------------------------------------------------

router.get('/', requireAdmin, async (_req, res) => {
  const customers = await db()
    .collection('Customer')
    .find({ deletedAt: { $exists: false } }, { projection: { passwordHash: 0 } })
    .sort({ createdAt: -1 })
    .limit(ADMIN_LIST_LIMIT)
    .toArray();
  const counts = await db()
    .collection('PickupOrder')
    .aggregate<{ _id: ObjectId; orders: number; spent: number }>([
      { $match: { customerId: { $in: customers.map((customer) => customer._id) }, status: 'COMPLETED' } },
      { $group: { _id: '$customerId', orders: { $sum: 1 }, spent: { $sum: '$total' } } },
    ])
    .toArray();
  const byCustomer = new Map(counts.map((count) => [count._id.toHexString(), count]));
  const rewardCounts = await db()
    .collection('StampReward')
    .aggregate<{ _id: ObjectId; count: number }>([
      { $match: { customerId: { $in: customers.map((customer) => customer._id) }, status: 'AVAILABLE', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] } },
      { $group: { _id: '$customerId', count: { $sum: 1 } } },
    ])
    .toArray();
  const rewardsByCustomer = new Map(rewardCounts.map((count) => [count._id.toHexString(), count.count]));
  const { perCard } = stampConfig(await loadSettings());

  res.setHeader('Cache-Control', 'no-store');
  res.json(
    customers.map((customer) => ({
      ...publicProfile(customer),
      completedOrders: byCustomer.get(customer._id.toHexString())?.orders ?? 0,
      totalSpent: byCustomer.get(customer._id.toHexString())?.spent ?? 0,
      memberCode: customer.memberCode ?? null,
      stamps: Math.min(Number(customer.stampCount) || 0, perCard),
      stampsPerCard: perCard,
      completedCards: Number(customer.stampCardsCompleted) || 0,
      lastStampAt: customer.lastStampAt ?? null,
      availableRewards: rewardsByCustomer.get(customer._id.toHexString()) ?? 0,
    })),
  );
});

/** One member's offers, for their profile in the admin: what they can still use, and what they've used. */
router.get('/:id/offers', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const exists = await db().collection('Customer').countDocuments({ _id: id }, { limit: 1 });
  if (!exists) throw notFound('Customer');
  const [offers, usedOrders] = await Promise.all([
    db().collection('Offer').find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).toArray(),
    db()
      .collection('PickupOrder')
      .find({ customerId: id, 'offer.id': { $exists: true }, status: { $ne: 'CANCELLED' } }, { projection: { number: 1, offer: 1, createdAt: 1, status: 1 } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray(),
  ]);
  const usedIds = new Set(usedOrders.map((order) => String(order.offer?.id)));
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    available: offers
      .filter((offer) => isOfferLive(offer as unknown as OfferRule))
      .map((offer) => ({
        id: offer._id.toHexString(),
        titleJa: offer.titleJa,
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        minSubtotal: offer.minSubtotal ?? 0,
        endsAt: offer.endsAt ?? null,
        oncePerCustomer: Boolean(offer.oncePerCustomer),
        used: usedIds.has(offer._id.toHexString()),
      })),
    used: usedOrders.map((order) => ({ orderNumber: order.number, titleJa: order.offer?.titleJa ?? '', discount: order.offer?.discount ?? 0, createdAt: order.createdAt, status: order.status })),
  });
});

router.post('/:id/points', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const { points, note } = adjustSchema.parse(req.body);
  const exists = await db().collection('Customer').countDocuments({ _id: id }, { limit: 1 });
  if (!exists) throw notFound('Customer');

  const ok = await changePoints(id, points, 'ADJUST', { note: note || 'Adjusted by staff', userId: req.user!.id });
  if (!ok) throw new AppError(409, 'INSUFFICIENT_POINTS', 'The customer does not have that many points to remove.');

  await db().collection('AuditLog').insertOne({
    _id: new ObjectId(),
    userId: new ObjectId(req.user!.id),
    action: 'customer.points',
    entity: 'Customer',
    entityId: id.toHexString(),
    diff: { points, note: note ?? null },
    createdAt: new Date(),
  });
  const customer = await db().collection('Customer').findOne({ _id: id }, { projection: { points: 1 } });
  res.json({ success: true, points: Number(customer?.points) || 0 });
});

/** For customers who forgot their password: staff set a temporary one and tell them in person or by phone. */
router.post('/:id/password', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const input = resetSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const result = await db().collection('Customer').updateOne({ _id: id }, { $set: { passwordHash, updatedAt: new Date() } });
  if (result.matchedCount === 0) throw notFound('Customer');
  await db().collection('AuditLog').insertOne({
    _id: new ObjectId(),
    userId: new ObjectId(req.user!.id),
    action: 'customer.password_reset',
    entity: 'Customer',
    entityId: id.toHexString(),
    diff: null,
    createdAt: new Date(),
  });
  res.json({ success: true });
});

export default router;
