import crypto from 'node:crypto';
import os from 'node:os';
import express from 'express';
import { ObjectId, type Document } from 'mongodb';
import { z } from 'zod';
import { config } from '../config.js';
import { dietaryAlert } from '../lib/customer-profile.js';
import { PAYMENT_METHODS, QR_TOKEN_PATTERN, TABLE_CALL_TYPES, diningConfig, isDineInCategory, newQrToken, tableBill, tableSchema } from '../lib/dining.js';
import { AppError, notFound } from '../lib/errors.js';
import { db } from '../lib/mongo.js';
import { localDateKey, localDayStart } from '../lib/pickup.js';
import { idParam, objectIdString, optionalText } from '../lib/schemas.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import { optionalCustomer } from '../middleware/customerAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { MAX_QUANTITY, quoteOrder, type OrderLine } from '../services/order-pricing.js';
import { loadSettings } from '../services/settings-store.js';

// Dine-in: each table has a QR code (/t/<code>). Guests scan it, order in as many rounds as they like,
// and pay one bill at the register. Orders go into the same order list as pickup and delivery, so the
// kitchen display, member points and stamps all work unchanged.

const router = express.Router();

const MAX_LINES = 30;
const ORDER_TOKEN_BYTES = 16;
const CLOSED_TODAY_LIMIT = 30;
const ACTIVE = ['NEW', 'CONFIRMED', 'READY'];

const tables = () => db().collection('DiningTable');
const sessions = () => db().collection('TableSession');
const orders = () => db().collection('PickupOrder');

let indexesReady: Promise<unknown> | undefined;
const ensureIndexes = () =>
  (indexesReady ??= Promise.all([
    tables().createIndex({ qrToken: 1 }, { unique: true }),
    tables().createIndex({ number: 1 }, { unique: true }),
    sessions().createIndex({ tableId: 1, status: 1 }),
    sessions().createIndex({ closedAt: -1 }),
    orders().createIndex({ sessionId: 1 }),
  ]));

const orderSchema = z.object({
  /** The visit the guest's page was showing; a new party at the table can't receive an old page's order. */
  sessionId: objectIdString,
  items: z
    .array(z.object({ itemId: objectIdString, quantity: z.number().int().min(1).max(MAX_QUANTITY) }))
    .min(1)
    .max(MAX_LINES),
  note: optionalText(300),
});
const callSchema = z.object({ sessionId: objectIdString, type: z.enum(TABLE_CALL_TYPES) });
const openSchema = z.object({ guests: z.number().int().min(1).max(50).optional() });
const closeSchema = z.object({ paymentMethod: z.enum(PAYMENT_METHODS), note: optionalText(200) });
const resolveSchema = z.object({ callId: z.string().max(40).optional() });

const tableOrderLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: config.orderMaxPerHour * 3, key: (req) => `table|${req.ip}` });
const callLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, key: (req) => `call|${req.ip}` });

async function tableByToken(token: string) {
  if (!QR_TOKEN_PATTERN.test(token)) throw notFound('Table');
  const table = await tables().findOne({ qrToken: token, isActive: { $ne: false } });
  if (!table) throw notFound('Table');
  return table;
}

const openSessionFor = (tableId: ObjectId) => sessions().findOne({ tableId, status: { $in: ['OPEN', 'BILL_REQUESTED'] } });

/** What the guests see: their orders (without anything private) and the running bill. */
async function guestView(session: Document | null) {
  if (!session) return null;
  const list = await orders()
    .find({ sessionId: session._id }, { projection: { number: 1, status: 1, items: 1, total: 1, tax: 1, grandTotal: 1, createdAt: 1, note: 1 } })
    .sort({ createdAt: 1 })
    .toArray();
  return {
    id: session._id.toHexString(),
    status: session.status,
    openedAt: session.openedAt,
    guests: session.guests ?? null,
    openCalls: (session.calls ?? []).filter((call: { resolvedAt?: Date | null }) => !call.resolvedAt).map((call: { type: string }) => call.type),
    orders: list.map(({ _id, items, ...order }) => ({
      id: _id.toHexString(),
      ...order,
      items: (items as OrderLine[]).map((line) => ({ nameEn: line.nameEn, nameJa: line.nameJa, quantity: line.quantity, lineTotal: line.lineTotal })),
    })),
    bill: tableBill(list),
  };
}

async function openSession(table: Document, input: { guests?: number; openedBy: string; userId?: string }) {
  const existing = await openSessionFor(table._id);
  if (existing) return existing;
  const now = new Date();
  const session = {
    _id: new ObjectId(),
    tableId: table._id,
    tableNumber: table.number,
    status: 'OPEN',
    guests: input.guests ?? null,
    openedAt: now,
    openedBy: input.openedBy,
    openedByUser: input.userId ? new ObjectId(input.userId) : null,
    calls: [],
    closedAt: null,
  };
  await sessions().insertOne(session);
  // Two openings at the same moment: keep the earliest and drop the other.
  const open = await sessions().find({ tableId: table._id, status: 'OPEN' }).sort({ openedAt: 1, _id: 1 }).toArray();
  if (open.length > 1) {
    await sessions().deleteMany({ _id: { $in: open.slice(1).map((s) => s._id) } });
    return open[0];
  }
  return session;
}

async function nextOrderNumber(dateKey: string): Promise<number> {
  const counter = await db()
    .collection<{ _id: string; seq: number }>('OrderCounter')
    .findOneAndUpdate({ _id: dateKey }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return counter?.seq ?? 1;
}

/** One round of food for a table, placed by a guest (with their member account, if signed in) or by staff. */
async function placeTableOrder(table: Document, session: Document, input: z.infer<typeof orderSchema>, by: { customerId?: ObjectId; userId?: string; ip?: string }) {
  const settings = await loadSettings();
  const dining = diningConfig(settings);

  // Only dine-in dishes: takeout-only categories are not served at the table.
  const itemIds = input.items.map((item) => new ObjectId(item.itemId));
  const menuItems = await db().collection('MenuItem').find({ _id: { $in: itemIds } }, { projection: { categoryId: 1, nameJa: 1, nameEn: 1 } }).toArray();
  const categories = await db().collection('Category').find({}).toArray();
  const categoryById = new Map(categories.map((category) => [category._id.toHexString(), category as object]));
  const notHere = menuItems.find((item) => !isDineInCategory(categoryById.get(String(item.categoryId)), categoryById));
  if (notHere) throw new AppError(409, 'NOT_DINE_IN', `「${notHere.nameJa || notHere.nameEn}」はテイクアウト専用です。`);

  const { lines, breakdown } = await quoteOrder({ items: input.items, customerId: by.customerId, fulfillment: 'PICKUP', settings });
  const now = new Date();
  const dateKey = localDateKey(now, settings.timezone);
  const order = {
    _id: new ObjectId(),
    number: await nextOrderNumber(dateKey),
    dateKey,
    token: crypto.randomBytes(ORDER_TOKEN_BYTES).toString('base64url'),
    status: 'NEW',
    fulfillment: 'DINE_IN',
    tableId: table._id,
    tableNumber: table.number,
    sessionId: session._id,
    customerName: `Table ${table.number}`,
    phone: '',
    email: null,
    note: input.note || null,
    // The kitchen's countdown: dine-in food should reach the table within the target time.
    pickupAt: new Date(now.getTime() + dining.targetMinutes * 60_000),
    items: lines,
    customerId: by.customerId ?? null,
    placedBy: by.userId ? 'STAFF' : 'GUEST',
    userId: by.userId ? new ObjectId(by.userId) : null,
    subtotal: breakdown.subtotal,
    offer: null,
    reward: null,
    pointsUsed: 0,
    pointsDiscount: 0,
    total: breakdown.total,
    taxRate: breakdown.taxRate,
    tax: breakdown.tax,
    grandTotal: breakdown.grandTotal,
    deliveryFee: 0,
    pointsEarned: 0,
    stampAwarded: false,
    ip: by.ip ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await orders().insertOne(order);
  await sessions().updateOne({ _id: session._id }, { $set: { lastOrderAt: now }, ...(by.customerId ? { $addToSet: { customerIds: by.customerId } } : {}) });
  return order;
}

// ---- Guests (public, by the table's QR code) --------------------------------------

/** The dine-in menu: every available dish outside the takeout-only categories, grouped by category. */
router.get('/menu', async (_req, res) => {
  const [categories, items] = await Promise.all([
    db().collection('Category').find({}).sort({ sortOrder: 1 }).toArray(),
    db().collection('MenuItem').find({ isActive: { $ne: false } }).sort({ sortOrder: 1, createdAt: 1 }).toArray(),
  ]);
  const byId = new Map(categories.map((category) => [category._id.toHexString(), category as object]));
  const groups = categories
    .filter((category) => isDineInCategory(category, byId))
    .map((category) => ({
      id: category._id.toHexString(),
      nameEn: category.nameEn,
      nameJa: category.nameJa ?? null,
      items: items
        .filter((item) => String(item.categoryId) === category._id.toHexString())
        .map((item) => ({
          id: item._id.toHexString(),
          nameEn: item.nameEn,
          nameJa: item.nameJa ?? null,
          descriptionJa: item.descriptionJa ?? item.descriptionEn ?? null,
          price: item.price,
          imageUrl: item.imageUrl ?? null,
          spiceLevel: item.spiceLevel ?? 0,
          isVegetarian: Boolean(item.isVegetarian),
          isRecommended: Boolean(item.isRecommended),
          allergens: item.allergens ?? [],
          isSoldOut: Boolean(item.isSoldOut),
        })),
    }))
    .filter((group) => group.items.length > 0);
  res.setHeader('Cache-Control', 'no-store');
  res.json(groups);
});

router.get('/t/:token', async (req, res) => {
  const table = await tableByToken(String(req.params.token));
  const dining = diningConfig(await loadSettings());
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    table: { number: table.number, name: table.name ?? null, seats: table.seats ?? null },
    dining: { enabled: dining.enabled, selfOpen: dining.selfOpen },
    session: await guestView(await openSessionFor(table._id)),
  });
});

/** Self-service opening, only when the restaurant allows it (otherwise staff open the table). */
router.post('/t/:token/open', async (req, res) => {
  const table = await tableByToken(String(req.params.token));
  const dining = diningConfig(await loadSettings());
  if (!dining.enabled) throw new AppError(409, 'DINING_OFF', '現在テーブルからのご注文は受け付けておりません。スタッフにお声がけください。');
  if (!dining.selfOpen && !(await openSessionFor(table._id))) {
    throw new AppError(409, 'TABLE_NOT_OPEN', 'スタッフがテーブルの準備をいたします。少々お待ちください。');
  }
  const { guests } = openSchema.parse(req.body ?? {});
  const session = await openSession(table, { guests, openedBy: 'GUEST' });
  res.status(201).json({ session: await guestView(session) });
});

router.post('/t/:token/orders', tableOrderLimiter, optionalCustomer, async (req, res) => {
  const table = await tableByToken(String(req.params.token));
  const input = orderSchema.parse(req.body);
  const dining = diningConfig(await loadSettings());
  if (!dining.enabled) throw new AppError(409, 'DINING_OFF', '現在テーブルからのご注文は受け付けておりません。スタッフにお声がけください。');
  const session = await openSessionFor(table._id);
  if (!session) throw new AppError(409, 'TABLE_NOT_OPEN', 'このテーブルは現在ご利用いただけません。スタッフにお声がけください。');
  if (session._id.toHexString() !== input.sessionId) {
    throw new AppError(409, 'STALE_SESSION', 'テーブルの状態が変わりました。画面を更新してください。');
  }
  if (session.status === 'BILL_REQUESTED') {
    // Ordering again after asking for the bill simply reopens the tab.
    await sessions().updateOne({ _id: session._id }, { $set: { status: 'OPEN' } });
  }
  const order = await placeTableOrder(table, session, input, { customerId: req.customer?.id, ip: req.ip });
  res.status(201).json({ number: order.number, total: order.total, tax: order.tax, grandTotal: order.grandTotal, session: await guestView(await openSessionFor(table._id)) });
});

/** "Call staff", "Water please" or "Bill please". A repeat of an unanswered call is not added twice. */
router.post('/t/:token/call', callLimiter, async (req, res) => {
  const table = await tableByToken(String(req.params.token));
  const { sessionId, type } = callSchema.parse(req.body);
  const session = await openSessionFor(table._id);
  if (!session || session._id.toHexString() !== sessionId) throw new AppError(409, 'STALE_SESSION', 'テーブルの状態が変わりました。画面を更新してください。');
  const pending = (session.calls ?? []).some((call: { type: string; resolvedAt?: Date | null }) => call.type === type && !call.resolvedAt);
  if (!pending) {
    await sessions().updateOne(
      { _id: session._id },
      {
        $push: { calls: { id: new ObjectId().toHexString(), type, createdAt: new Date(), resolvedAt: null } } as unknown as Document,
        ...(type === 'BILL' ? { $set: { status: 'BILL_REQUESTED', billRequestedAt: new Date() } } : {}),
      },
    );
  }
  res.json({ session: await guestView(await openSessionFor(table._id)) });
});

// ---- Staff ---------------------------------------------------------------

/**
 * The address table QR codes should open. The admin's saved site address wins; during development the
 * computer's local network addresses are offered too, because "localhost" on a phone is the phone itself.
 */
router.get('/qr-base', requireStaff, async (_req, res) => {
  const settings = (await loadSettings()) as { publicSiteUrl?: string | null };
  const lanAddresses = config.isProduction
    ? []
    : Object.values(os.networkInterfaces())
        .flat()
        .filter((net): net is os.NetworkInterfaceInfo => Boolean(net) && net!.family === 'IPv4' && !net!.internal)
        .map((net) => net.address);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ siteUrl: settings.publicSiteUrl || null, lanAddresses });
});

const staffTable = (table: Document) => ({
  id: table._id.toHexString(),
  number: table.number,
  name: table.name ?? null,
  seats: table.seats ?? null,
  area: table.area ?? null,
  isActive: table.isActive !== false,
  sortOrder: table.sortOrder ?? 0,
  qrToken: table.qrToken,
});

/** The floor: every table with its current visit (guests, time seated, orders, running total, calls). */
router.get('/tables', requireStaff, async (_req, res) => {
  await ensureIndexes();
  const settings = await loadSettings();
  const all = await tables().find({}).sort({ sortOrder: 1, number: 1 }).toArray();
  const open = await sessions().find({ status: { $in: ['OPEN', 'BILL_REQUESTED'] } }).toArray();
  const openOrders = await orders()
    .find({ sessionId: { $in: open.map((session) => session._id) } }, { projection: { sessionId: 1, status: 1, total: 1, tax: 1, grandTotal: 1, items: 1 } })
    .toArray();
  const todayStart = localDayStart(localDateKey(new Date(), settings.timezone), settings.timezone);
  const closedToday = await sessions().find({ status: 'CLOSED', closedAt: { $gte: todayStart } }).sort({ closedAt: -1 }).limit(CLOSED_TODAY_LIMIT).toArray();

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    dining: diningConfig(settings),
    tables: all.map((table) => {
      const session = open.find((s) => String(s.tableId) === table._id.toHexString());
      const bill = session ? tableBill(openOrders.filter((order) => String(order.sessionId) === session._id.toHexString())) : null;
      return {
        ...staffTable(table),
        session: session
          ? {
              id: session._id.toHexString(),
              status: session.status,
              guests: session.guests ?? null,
              openedAt: session.openedAt,
              openedBy: session.openedBy,
              lastOrderAt: session.lastOrderAt ?? null,
              calls: (session.calls ?? []).filter((call: { resolvedAt?: Date | null }) => !call.resolvedAt),
              orders: bill!.orders,
              inProgress: bill!.inProgress,
              ready: bill!.ready,
              total: bill!.total,
            }
          : null,
      };
    }),
    closedToday: closedToday.map((session) => ({
      id: session._id.toHexString(),
      tableNumber: session.tableNumber,
      guests: session.guests ?? null,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      total: session.total ?? 0,
      paymentMethod: session.paymentMethod ?? null,
    })),
  });
});

router.post('/tables', requireAdmin, async (req, res) => {
  await ensureIndexes();
  const input = tableSchema.parse(req.body);
  if (await tables().countDocuments({ number: input.number }, { limit: 1 })) throw new AppError(409, 'TABLE_EXISTS', `Table ${input.number} already exists.`);
  const now = new Date();
  const table = { _id: new ObjectId(), seats: 4, isActive: true, sortOrder: 0, name: null, area: null, ...input, qrToken: newQrToken(), createdAt: now, updatedAt: now };
  await tables().insertOne(table);
  res.status(201).json(staffTable(table));
});

/** Adds several tables at once, e.g. 1-12. Numbers that already exist are skipped. */
router.post('/tables/bulk', requireAdmin, async (req, res) => {
  await ensureIndexes();
  const { from, to, seats } = z.object({ from: z.number().int().min(1).max(999), to: z.number().int().min(1).max(999), seats: z.number().int().min(1).max(50).default(4) }).refine((v) => v.to >= v.from && v.to - v.from < 100, 'Up to 100 tables at a time').parse(req.body);
  const existing = new Set((await tables().find({}, { projection: { number: 1 } }).toArray()).map((table) => String(table.number)));
  const now = new Date();
  const created = [];
  for (let n = from; n <= to; n += 1) {
    if (existing.has(String(n))) continue;
    created.push({ _id: new ObjectId(), number: String(n), name: null, area: null, seats, isActive: true, sortOrder: n, qrToken: newQrToken(), createdAt: now, updatedAt: now });
  }
  if (created.length) await tables().insertMany(created);
  res.status(201).json({ created: created.length, skipped: to - from + 1 - created.length });
});

router.put('/tables/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const input = tableSchema.partial().parse(req.body);
  if (input.number && (await tables().countDocuments({ number: input.number, _id: { $ne: id } }, { limit: 1 }))) {
    throw new AppError(409, 'TABLE_EXISTS', `Table ${input.number} already exists.`);
  }
  const result = await tables().updateOne({ _id: id }, { $set: { ...input, updatedAt: new Date() } });
  if (result.matchedCount === 0) throw notFound('Table');
  if (input.number) await sessions().updateMany({ tableId: id, status: { $ne: 'CLOSED' } }, { $set: { tableNumber: input.number } });
  res.json(staffTable((await tables().findOne({ _id: id }))!));
});

router.delete('/tables/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  if (await openSessionFor(id)) throw new AppError(409, 'TABLE_IN_USE', 'Close the table before deleting it.');
  const result = await tables().deleteOne({ _id: id });
  if (result.deletedCount === 0) throw notFound('Table');
  res.status(204).end();
});

/** A new QR code for a table (the old printed code stops working), e.g. if a photo of it is being misused. */
router.post('/tables/:id/qr', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const result = await tables().findOneAndUpdate({ _id: id }, { $set: { qrToken: newQrToken(), updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!result) throw notFound('Table');
  res.json(staffTable(result));
});

router.post('/tables/:id/open', requireStaff, async (req, res) => {
  const id = idParam(req.params);
  const table = await tables().findOne({ _id: id });
  if (!table) throw notFound('Table');
  const { guests } = openSchema.parse(req.body ?? {});
  const session = await openSession(table, { guests, openedBy: 'STAFF', userId: req.user!.id });
  if (guests && session.guests !== guests) await sessions().updateOne({ _id: session._id }, { $set: { guests } });
  res.status(201).json({ id: session._id.toHexString() });
});

/** Everything about one visit, for the staff panel: orders with status, allergies, the bill and calls. */
router.get('/sessions/:id', requireStaff, async (req, res) => {
  const id = idParam(req.params);
  const session = await sessions().findOne({ _id: id });
  if (!session) throw notFound('Table session');
  const list = await orders().find({ sessionId: id }, { projection: { token: 0, ip: 0 } }).sort({ createdAt: 1 }).toArray();
  const memberIds = list.map((order) => order.customerId).filter((value): value is ObjectId => value instanceof ObjectId);
  const members = await db().collection('Customer').find({ _id: { $in: memberIds } }, { projection: { name: 1, preferences: 1 } }).toArray();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    id: session._id.toHexString(),
    tableId: String(session.tableId),
    tableNumber: session.tableNumber,
    status: session.status,
    guests: session.guests ?? null,
    openedAt: session.openedAt,
    closedAt: session.closedAt ?? null,
    paymentMethod: session.paymentMethod ?? null,
    calls: session.calls ?? [],
    members: members.map((member) => ({ id: member._id.toHexString(), name: member.name, dietaryAlert: dietaryAlert(member) })),
    orders: list.map(({ _id, ...order }) => ({ id: _id.toHexString(), ...order })),
    bill: tableBill(list),
  });
});

router.patch('/sessions/:id', requireStaff, async (req, res) => {
  const id = idParam(req.params);
  const { guests } = openSchema.parse(req.body ?? {});
  const result = await sessions().updateOne({ _id: id, status: { $ne: 'CLOSED' } }, { $set: { guests: guests ?? null } });
  if (result.matchedCount === 0) throw notFound('Table session');
  res.json({ success: true });
});

/** Staff take an order for the table (guests without a phone, or a change at the table). */
router.post('/sessions/:id/orders', requireStaff, async (req, res) => {
  const id = idParam(req.params);
  const input = orderSchema.parse({ ...req.body, sessionId: id.toHexString() });
  const session = await sessions().findOne({ _id: id, status: { $in: ['OPEN', 'BILL_REQUESTED'] } });
  if (!session) throw new AppError(409, 'TABLE_NOT_OPEN', 'This table is not open.');
  const table = await tables().findOne({ _id: session.tableId });
  if (!table) throw notFound('Table');
  const order = await placeTableOrder(table, session, input, { userId: req.user!.id });
  res.status(201).json({ id: order._id.toHexString(), number: order.number });
});

/** Every unanswered guest call (staff, water, bill), oldest first, for the alerts that ring until accepted. */
router.get('/calls', requireStaff, async (_req, res) => {
  const open = await sessions()
    .find({ status: { $in: ['OPEN', 'BILL_REQUESTED'] }, 'calls.resolvedAt': null }, { projection: { tableNumber: 1, calls: 1 } })
    .toArray();
  const calls = open
    .flatMap((session) =>
      (session.calls ?? [])
        .filter((call: { resolvedAt?: Date | null }) => !call.resolvedAt)
        .map((call: { id: string; type: string; createdAt: Date }) => ({
          sessionId: session._id.toHexString(),
          callId: call.id,
          tableNumber: session.tableNumber,
          type: call.type,
          createdAt: call.createdAt,
        })),
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  res.setHeader('Cache-Control', 'no-store');
  res.json(calls);
});

router.post('/sessions/:id/calls/resolve', requireStaff, async (req, res) => {
  const id = idParam(req.params);
  const { callId } = resolveSchema.parse(req.body ?? {});
  const session = await sessions().findOne({ _id: id });
  if (!session) throw notFound('Table session');
  const now = new Date();
  const calls = (session.calls ?? []).map((call: { id: string; resolvedAt?: Date | null }) =>
    !call.resolvedAt && (!callId || call.id === callId) ? { ...call, resolvedAt: now, resolvedBy: new ObjectId(req.user!.id) } : call,
  );
  await sessions().updateOne({ _id: id }, { $set: { calls } });
  res.json({ success: true });
});

/** Payment taken at the register: the visit ends and the table is free for the next guests. */
router.post('/sessions/:id/close', requireStaff, async (req, res) => {
  const id = idParam(req.params);
  const { paymentMethod, note } = closeSchema.parse(req.body);
  const session = await sessions().findOne({ _id: id, status: { $in: ['OPEN', 'BILL_REQUESTED'] } });
  if (!session) throw new AppError(409, 'TABLE_NOT_OPEN', 'This table is already closed.');
  const list = await orders().find({ sessionId: id }, { projection: { status: 1, total: 1, tax: 1, grandTotal: 1, items: 1 } }).toArray();
  const unfinished = list.filter((order) => ACTIVE.includes(order.status)).length;
  if (unfinished > 0) {
    throw new AppError(409, 'ORDERS_IN_PROGRESS', `${unfinished} order(s) not served yet. Mark them served (or cancel them) before closing the table.`, { unfinished });
  }
  const bill = tableBill(list);
  const now = new Date();
  const closed = await sessions().updateOne(
    { _id: id, status: { $in: ['OPEN', 'BILL_REQUESTED'] } },
    {
      $set: {
        status: 'CLOSED',
        closedAt: now,
        closedBy: new ObjectId(req.user!.id),
        paymentMethod,
        paymentNote: note ?? null,
        subtotal: bill.subtotal,
        tax: bill.tax,
        total: bill.total,
        calls: (session.calls ?? []).map((call: { resolvedAt?: Date | null }) => ({ ...call, resolvedAt: call.resolvedAt ?? now })),
      },
    },
  );
  if (closed.modifiedCount === 0) throw new AppError(409, 'TABLE_NOT_OPEN', 'This table is already closed.');
  await db().collection('AuditLog').insertOne({
    _id: new ObjectId(),
    userId: new ObjectId(req.user!.id),
    action: 'table.close',
    entity: 'TableSession',
    entityId: id.toHexString(),
    diff: { tableNumber: session.tableNumber, total: bill.total, paymentMethod },
    createdAt: now,
  });
  res.json({ success: true, total: bill.total });
});

export default router;
