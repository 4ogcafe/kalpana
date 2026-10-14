import crypto from 'node:crypto';
import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError, notFound } from '../lib/errors.js';
import { dietaryAlert } from '../lib/customer-profile.js';
import { earnedPoints, loyaltyConfig } from '../lib/loyalty.js';
import { db } from '../lib/mongo.js';
import { FULFILLMENTS, deliveryAddressSchema, fulfillmentOptions, isEnabled, isInDeliveryArea, pausedUntil, slotsFor } from '../lib/fulfillment.js';
import { localDateKey } from '../lib/pickup.js';
import { idParam, objectIdString, optionalText } from '../lib/schemas.js';
import { requireKitchen } from '../middleware/auth.js';
import { optionalCustomer, requireCustomer } from '../middleware/customerAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { MAX_QUANTITY, pricingSummary, quoteOrder, type OrderLine } from '../services/order-pricing.js';
import { changePoints } from '../services/points.js';
import { loadSettings } from '../services/settings-store.js';
import { awardStamp, releaseReward, useReward } from '../services/stamps.js';
import { notifyOrderReady } from '../services/push.js';
import { stampAmount } from '../lib/stamps.js';

const router = express.Router();

const ORDER_WINDOW_MS = 60 * 60 * 1000;
const MAX_LINES = 30;
const MAX_POINTS_PER_ORDER = 1_000_000;
const HISTORY_LIMIT = 200;
const TOKEN_BYTES = 16;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const ORDER_STATUSES = ['NEW', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];
const ACTIVE_STATUSES: OrderStatus[] = ['NEW', 'CONFIRMED', 'READY'];

/**
 * Which statuses an order may move to from each status; COMPLETED and CANCELLED are final.
 * READY can go back to CONFIRMED when the kitchen marked it ready by mistake.
 */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED', 'CONFIRMED'],
  COMPLETED: [],
  CANCELLED: [],
};

const cartSchema = {
  items: z
    .array(z.object({ itemId: objectIdString, quantity: z.number().int().min(1).max(MAX_QUANTITY) }))
    .min(1)
    .max(MAX_LINES),
  offerId: objectIdString.nullable().optional(),
  rewardId: objectIdString.nullable().optional(),
  pointsToUse: z.number().int().min(0).max(MAX_POINTS_PER_ORDER).optional(),
  fulfillment: z.enum(FULFILLMENTS).default('PICKUP'),
};

const quoteSchema = z.object(cartSchema);

const orderSchema = z.object({
  ...cartSchema,
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^[\d\s()+-]{8,20}$/, 'Invalid phone number'),
  email: z.union([z.literal(''), z.email().max(254)]).nullable().optional(),
  note: optionalText(500),
  // The chosen time: pickup time, or delivery time for deliveries.
  pickupAt: z.iso.datetime(),
  deliveryAddress: deliveryAddressSchema.optional(),
  // Honeypot: hidden from people, filled in by bots.
  website: z.string().optional(),
});

const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) });
// NEW is never a target status (nothing moves back to it), so it has no time field.
const STATUS_TIME_FIELD: Record<Exclude<OrderStatus, 'NEW'>, string> = {
  CONFIRMED: 'confirmedAt',
  READY: 'readyAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
};
const listQuerySchema = z.object({ scope: z.enum(['active', 'history']).default('active') });

const orderLimiter = rateLimit({
  windowMs: ORDER_WINDOW_MS,
  max: config.orderMaxPerHour,
  key: (req) => req.ip ?? 'unknown',
});

/** Short daily order numbers (1, 2, 3…) that staff can call out at the counter. */
async function nextOrderNumber(dateKey: string): Promise<number> {
  const counter = await db()
    .collection<{ _id: string; seq: number }>('OrderCounter')
    .findOneAndUpdate({ _id: dateKey }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return counter?.seq ?? 1;
}

// ---- Public --------------------------------------------------------------

const slotsQuerySchema = z.object({ type: z.enum(['pickup', 'delivery']).default('pickup') });

/** Which ordering options are on, and the times offered for the requested one. */
router.get('/slots', async (req, res) => {
  const { type } = slotsQuerySchema.parse(req.query);
  const settings = await loadSettings();
  const options = fulfillmentOptions(settings);
  const fulfillment = type === 'delivery' ? 'DELIVERY' : 'PICKUP';
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    // `enabled` is true when customers can order online at all (pickup, delivery or both).
    enabled: options.pickup.enabled || options.delivery.enabled,
    note: options.pickup.note,
    ...options,
    slots: slotsFor(settings, fulfillment),
  });
});

/** Live price for the checkout page: offer and points discounts as the order would be saved. */
router.post('/quote', optionalCustomer, async (req, res) => {
  const input = quoteSchema.parse(req.body);
  const quote = await quoteOrder({ ...input, customerId: req.customer?.id, settings: await loadSettings() });
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ...quote.breakdown,
    offer: quote.offer && { id: quote.offer.id.toHexString(), titleJa: quote.offer.titleJa },
    reward: quote.reward && { id: quote.reward.id.toHexString(), titleJa: quote.reward.titleJa, kind: quote.reward.kind },
  });
});

// Only signed-in members can place orders, so every order belongs to a verified account.
router.post('/', orderLimiter, requireCustomer, async (req, res) => {
  const { website, ...input } = orderSchema.parse(req.body);
  if (website) {
    // Pretend success so bots don't learn they were filtered.
    res.status(201).json({ token: crypto.randomBytes(TOKEN_BYTES).toString('base64url') });
    return;
  }

  const settings = await loadSettings();
  const isDelivery = input.fulfillment === 'DELIVERY';
  const paused = pausedUntil(settings);
  if (paused) {
    const until = paused.toLocaleTimeString('ja-JP', { timeZone: settings.timezone ?? 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
    throw new AppError(409, 'ORDERING_PAUSED', `ただいま大変混み合っているため、${until}頃までご注文の受付を一時停止しています。`);
  }
  if (!isEnabled(settings, input.fulfillment)) {
    throw new AppError(409, 'FULFILLMENT_UNAVAILABLE', isDelivery ? '現在デリバリーは受け付けておりません。' : '現在お持ち帰りのご注文は受け付けておりません。');
  }
  const pickupAt = new Date(input.pickupAt);
  if (!slotsFor(settings, input.fulfillment).some((slot) => new Date(slot.at).getTime() === pickupAt.getTime())) {
    throw new AppError(409, 'SLOT_UNAVAILABLE', `この${isDelivery ? 'お届け' : '受け取り'}時間は選択できません。別の時間をお選びください。`);
  }
  if (isDelivery) {
    if (!input.deliveryAddress) throw new AppError(400, 'ADDRESS_REQUIRED', 'お届け先の住所を入力してください。');
    if (!isInDeliveryArea(input.deliveryAddress, settings.deliveryAreas)) {
      throw new AppError(409, 'OUTSIDE_DELIVERY_AREA', '申し訳ありません。このご住所は配達エリア外です。お持ち帰りをご利用ください。');
    }
  }

  const customerId = req.customer?.id;
  const { lines, breakdown, offer, reward } = await quoteOrder({ ...input, customerId, settings });
  if (breakdown.minOrderShortfall > 0) {
    throw new AppError(409, 'BELOW_MINIMUM', `デリバリーは¥${(settings.deliveryMinOrder ?? 0).toLocaleString('ja-JP')}以上のご注文で承ります。`);
  }
  const orderId = new ObjectId();
  const dateKey = localDateKey(pickupAt, settings.timezone);
  const number = await nextOrderNumber(dateKey);

  // A stamp reward and points are taken when the order is placed (and given back if it is cancelled),
  // so they can't be used twice.
  if (customerId && reward && !(await useReward(reward.id, customerId, { orderId, orderNumber: number }))) {
    throw new AppError(409, 'REWARD_UNAVAILABLE', 'このスタンプ特典はすでにご利用済みです。');
  }
  if (customerId && breakdown.pointsUsed > 0) {
    const reserved = await changePoints(customerId, -breakdown.pointsUsed, 'REDEEM', { orderId, orderNumber: number });
    if (!reserved) {
      if (reward) await releaseReward(orderId);
      throw new AppError(409, 'POINTS_CHANGED', 'ポイント残高が変わりました。もう一度お試しください。');
    }
  }

  const now = new Date();
  const order = {
    _id: orderId,
    number,
    dateKey,
    token: crypto.randomBytes(TOKEN_BYTES).toString('base64url'),
    status: 'NEW' as OrderStatus,
    fulfillment: input.fulfillment,
    deliveryAddress: isDelivery ? input.deliveryAddress : null,
    deliveryFee: breakdown.deliveryFee,
    customerName: input.name,
    phone: input.phone,
    email: input.email || null,
    note: input.note || null,
    pickupAt,
    items: lines,
    customerId: customerId ?? null,
    subtotal: breakdown.subtotal,
    offer,
    reward,
    pointsUsed: breakdown.pointsUsed,
    pointsDiscount: breakdown.pointsDiscount,
    total: breakdown.total,
    taxRate: breakdown.taxRate,
    tax: breakdown.tax,
    grandTotal: breakdown.grandTotal,
    pointsEarned: 0,
    stampAwarded: false,
    ip: req.ip ?? null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db().collection('PickupOrder').insertOne(order);
  } catch (err) {
    if (customerId && breakdown.pointsUsed > 0) {
      await changePoints(customerId, breakdown.pointsUsed, 'REFUND', { orderId, orderNumber: number, note: 'Order could not be saved' });
    }
    if (reward) await releaseReward(orderId);
    throw err;
  }
  res.status(201).json({ token: order.token, number: order.number, total: order.total, tax: order.tax, grandTotal: order.grandTotal, pickupAt: order.pickupAt });
});

/** The customer's status page. The unguessable token is the only key, so order ids can't be enumerated. */
router.get('/track/:token', async (req, res) => {
  const token = req.params.token;
  if (!TOKEN_PATTERN.test(token)) throw notFound('Order');
  const order = await db().collection('PickupOrder').findOne({ token });
  if (!order) throw notFound('Order');

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    number: order.number,
    status: order.status,
    customerName: order.customerName,
    pickupAt: order.pickupAt,
    items: order.items.map((line: OrderLine) => ({ nameEn: line.nameEn, nameJa: line.nameJa, quantity: line.quantity, lineTotal: line.lineTotal })),
    ...pricingSummary(order),
    isMember: Boolean(order.customerId),
    createdAt: order.createdAt,
  });
});

// ---- Staff ---------------------------------------------------------------

router.get('/', requireKitchen, async (req, res) => {
  const { scope } = listQuerySchema.parse(req.query);
  const active = scope === 'active';
  const orders = await db()
    .collection('PickupOrder')
    .find(
      { status: active ? { $in: ACTIVE_STATUSES } : { $nin: ACTIVE_STATUSES } },
      { projection: { token: 0, ip: 0 } },
    )
    .sort({ pickupAt: active ? 1 : -1 })
    .limit(active ? 0 : HISTORY_LIMIT)
    .toArray();

  res.setHeader('Cache-Control', 'no-store');
  res.json(await withDietaryAlerts(orders));
});

/** The kitchen sees each member's allergies and dietary needs on their orders. */
async function withDietaryAlerts(orders: Record<string, unknown>[]) {
  const memberIds = [...new Set(orders.map((order) => order.customerId).filter((id): id is ObjectId => id instanceof ObjectId))];
  const members = await db().collection('Customer').find({ _id: { $in: memberIds } }, { projection: { preferences: 1 } }).toArray();
  const alerts = new Map(members.map((member) => [member._id.toHexString(), dietaryAlert(member)]));
  return orders.map(({ _id, ...order }) => ({
    id: (_id as ObjectId).toHexString(),
    ...order,
    dietaryAlert: order.customerId instanceof ObjectId ? (alerts.get(order.customerId.toHexString()) ?? null) : null,
  }));
}

// ---- Kitchen display -----------------------------------------------------

const KITCHEN_DONE_LIMIT = 40;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PAUSE_MINUTES = 4 * 60;
const KITCHEN_PROJECTION = { token: 0, ip: 0, email: 0 };
const pauseSchema = z.object({ minutes: z.number().int().min(0).max(MAX_PAUSE_MINUTES) });
const itemDoneSchema = z.object({ done: z.boolean() });

/** Everything the kitchen screen shows, in one request: open orders, today's finished ones, and stats. */
router.get('/kitchen', requireKitchen, async (_req, res) => {
  const settings = await loadSettings();
  const now = new Date();
  const today = localDateKey(now, settings.timezone);
  const orders = db().collection('PickupOrder');
  const [active, done, todayOrders] = await Promise.all([
    orders.find({ status: { $in: ACTIVE_STATUSES } }, { projection: KITCHEN_PROJECTION }).sort({ pickupAt: 1 }).toArray(),
    // "Done today" goes by when the order was finished (not its pickup date), in the restaurant's timezone.
    orders
      .find({ status: { $in: ['COMPLETED', 'CANCELLED'] }, updatedAt: { $gte: new Date(now.getTime() - DAY_MS) } }, { projection: KITCHEN_PROJECTION })
      .sort({ updatedAt: -1 })
      .limit(KITCHEN_DONE_LIMIT)
      .toArray()
      .then((finished) => finished.filter((order) => localDateKey(order.updatedAt, settings.timezone) === today)),
    orders
      .find(
        { $or: [{ createdAt: { $gte: new Date(now.getTime() - DAY_MS) } }, { updatedAt: { $gte: new Date(now.getTime() - DAY_MS) } }] },
        { projection: { status: 1, createdAt: 1, updatedAt: 1, confirmedAt: 1, readyAt: 1, completedAt: 1, cancelledAt: 1, items: 1 } },
      )
      .toArray(),
  ]);

  // Each figure counts what happened today (in the restaurant's timezone), whatever the pickup date.
  const isToday = (value: unknown) => value instanceof Date && localDateKey(value, settings.timezone) === today;
  const received = todayOrders.filter((order) => isToday(order.createdAt) && order.status !== 'CANCELLED');
  // Prep time: from accepting the order to marking it ready.
  const prepMinutes = todayOrders
    .filter((order) => order.confirmedAt instanceof Date && isToday(order.readyAt))
    .map((order) => (order.readyAt.getTime() - order.confirmedAt.getTime()) / 60_000);

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    serverTime: now,
    pausedUntil: pausedUntil(settings, now),
    ordering: fulfillmentOptions(settings),
    active: await withDietaryAlerts(active),
    done: await withDietaryAlerts(done),
    stats: {
      ordersToday: received.length,
      completedToday: todayOrders.filter((order) => order.status === 'COMPLETED' && isToday(order.completedAt ?? order.updatedAt)).length,
      cancelledToday: todayOrders.filter((order) => order.status === 'CANCELLED' && isToday(order.cancelledAt ?? order.updatedAt)).length,
      itemsToday: received.reduce((sum, order) => sum + (order.items as OrderLine[]).reduce((n, line) => n + line.quantity, 0), 0),
      avgPrepMinutes: prepMinutes.length ? Math.round(prepMinutes.reduce((a, b) => a + b, 0) / prepMinutes.length) : null,
    },
  });
});

/** "Too busy": stop new online orders for a while (0 resumes now). Orders already placed are not affected. */
router.post('/kitchen/pause', requireKitchen, async (req, res) => {
  const { minutes } = pauseSchema.parse(req.body);
  const until = minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null;
  const settingsCollection = db().collection('Settings');
  const existing = await settingsCollection.findOne({}, { projection: { _id: 1 } });
  if (existing) await settingsCollection.updateOne({ _id: existing._id }, { $set: { orderingPausedUntil: until, updatedAt: new Date() } });
  else await settingsCollection.insertOne({ _id: new ObjectId(), orderingPausedUntil: until, updatedAt: new Date() });

  await db().collection('AuditLog').insertOne({
    _id: new ObjectId(),
    userId: new ObjectId(req.user!.id),
    action: 'ordering.pause',
    entity: 'Settings',
    entityId: 'ordering',
    diff: { minutes, until },
    createdAt: new Date(),
  });
  res.json({ pausedUntil: until });
});

/** Ticks one dish off (or back on) while an order is being prepared; shared by every kitchen screen. */
router.patch('/:id/items/:index', requireKitchen, async (req, res) => {
  const id = idParam(req.params);
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_LINES) throw notFound('Order line');
  const { done } = itemDoneSchema.parse(req.body);
  const result = await db()
    .collection('PickupOrder')
    .updateOne(
      { _id: id, status: { $in: ACTIVE_STATUSES }, [`items.${index}`]: { $exists: true } },
      { $set: { [`items.${index}.doneAt`]: done ? new Date() : null, updatedAt: new Date() } },
    );
  if (result.matchedCount === 0) throw notFound('Order line');
  res.json({ success: true });
});

router.patch('/:id/status', requireKitchen, async (req, res) => {
  const id = idParam(req.params);
  const { status } = statusSchema.parse(req.body);
  const allowedFrom = ORDER_STATUSES.filter((from) => NEXT_STATUSES[from].includes(status));

  // The status filter makes the check and the write one atomic step, so two staff can't race.
  const before = await db()
    .collection('PickupOrder')
    .findOneAndUpdate(
      { _id: id, status: { $in: allowedFrom } },
      // Each step's time is kept for the kitchen timers; going back to CONFIRMED clears "ready".
      {
        $set: {
          status,
          updatedAt: new Date(),
          ...(status !== 'NEW' ? { [STATUS_TIME_FIELD[status]]: new Date() } : {}),
          ...(status === 'CONFIRMED' ? { readyAt: null } : {}),
        },
      },
    );

  if (!before) {
    const exists = await db().collection('PickupOrder').findOne({ _id: id }, { projection: { status: 1 } });
    if (!exists) throw notFound('Order');
    throw new AppError(409, 'INVALID_STATUS_CHANGE', `Cannot change an order from ${exists.status} to ${status}`);
  }

  // Sent back from "ready" to the kitchen: the prep timer keeps counting from when it was first accepted.
  if (before.status === 'READY' && status === 'CONFIRMED' && before.confirmedAt) {
    await db().collection('PickupOrder').updateOne({ _id: id }, { $set: { confirmedAt: before.confirmedAt } });
  }
  await settleMemberPoints(before, status);
  const stamp = await settleMemberStamp(before, status);
  // "Your food is ready": a notification to the customer's phone, sent in the background.
  if (status === 'READY') void notifyOrderReady(before);

  await db().collection('AuditLog').insertOne({
    _id: new ObjectId(),
    userId: new ObjectId(req.user?.id),
    action: 'order.status',
    entity: 'PickupOrder',
    entityId: id.toHexString(),
    diff: { from: before.status, to: status },
    createdAt: new Date(),
  });
  res.json({ success: true, status, stamp });
});

/** Members earn points when an order is picked up, and get spent points back when it is cancelled. */
async function settleMemberPoints(order: Record<string, unknown>, status: OrderStatus) {
  const customerId = order.customerId;
  if (!(customerId instanceof ObjectId)) return;
  const meta = { orderId: order._id as ObjectId, orderNumber: Number(order.number) };

  if (status === 'COMPLETED') {
    const points = earnedPoints(Number(order.total) || 0, loyaltyConfig(await loadSettings()));
    if (points > 0) {
      await changePoints(customerId, points, 'EARN', meta);
      await db().collection('PickupOrder').updateOne({ _id: meta.orderId }, { $set: { pointsEarned: points } });
    }
  }
  const pointsUsed = Number(order.pointsUsed) || 0;
  if (status === 'CANCELLED' && pointsUsed > 0) {
    await changePoints(customerId, pointsUsed, 'REFUND', meta);
  }
  if (status === 'CANCELLED' && order.reward) await releaseReward(meta.orderId);
}

/** A completed member order earns a stamp when it is large enough and the last stamp was long enough ago. */
async function settleMemberStamp(order: Record<string, unknown>, status: OrderStatus) {
  const customerId = order.customerId;
  if (status !== 'COMPLETED' || !(customerId instanceof ObjectId)) return null;
  const orderId = order._id as ObjectId;
  const result = await awardStamp(customerId, { source: 'ORDER', amount: stampAmount(order), orderId, orderNumber: Number(order.number) });
  if (result.status === 'AWARDED') await db().collection('PickupOrder').updateOne({ _id: orderId }, { $set: { stampAwarded: true } });
  return result;
}

export default router;
