import express from 'express';
import type { ObjectId } from 'mongodb';
import { z } from 'zod';
import {
  RANGES,
  busyHours,
  change,
  fulfillmentSplit,
  headline,
  paidAmount,
  periodFor,
  promotionUse,
  salesSeries,
  topItems,
  type OrderFact,
} from '../lib/analytics.js';
import { fulfillmentOptions, pausedUntil } from '../lib/fulfillment.js';
import { db } from '../lib/mongo.js';
import { localDayStart, localDateKey } from '../lib/pickup.js';
import { stampConfig } from '../lib/stamps.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import { loadSettings } from '../services/settings-store.js';

const router = express.Router();

const ACTIVE = ['NEW', 'CONFIRMED', 'READY'];
const RECENT_ORDERS = 8;
const RECENT_MESSAGES = 5;
const SOLD_OUT_LIST = 12;
const UPCOMING_RESERVATIONS = 6;
const MAX_EXPORT_ROWS = 20_000;
const ORDER_FIELDS = {
  number: 1, status: 1, fulfillment: 1, createdAt: 1, pickupAt: 1, confirmedAt: 1, readyAt: 1, customerId: 1, customerName: 1,
  subtotal: 1, total: 1, tax: 1, grandTotal: 1, deliveryFee: 1, pointsDiscount: 1, offer: 1, reward: 1, items: 1,
};

router.get('/stats', requireStaff, async (_req, res) => {
  const [menuItemsCount, soldOutItemsCount, categoriesCount, carouselsCount, unreadMessagesCount, newOrdersCount, activeOrdersCount, customersCount, openTables] = await Promise.all([
    db().collection('MenuItem').countDocuments(),
    db().collection('MenuItem').countDocuments({ isSoldOut: true }),
    db().collection('Category').countDocuments(),
    db().collection('CarouselSlide').countDocuments({ isActive: true }),
    db().collection('ContactMessage').countDocuments({ isRead: false }),
    db().collection('PickupOrder').countDocuments({ status: 'NEW' }),
    db().collection('PickupOrder').countDocuments({ status: { $in: ACTIVE } }),
    db().collection('Customer').countDocuments(),
    db().collection('TableSession').find({ status: { $in: ['OPEN', 'BILL_REQUESTED'] } }, { projection: { calls: 1 } }).toArray(),
  ]);
  // Guests waiting for staff: "call staff", "water" and "bill" requests not answered yet.
  const tableCallsCount = openTables.reduce((sum, session) => sum + (session.calls ?? []).filter((call: { resolvedAt?: Date | null }) => !call.resolvedAt).length, 0);

  res.setHeader('Cache-Control', 'no-store');
  res.json({ menuItemsCount, soldOutItemsCount, categoriesCount, carouselsCount, unreadMessagesCount, newOrdersCount, activeOrdersCount, customersCount, occupiedTablesCount: openTables.length, tableCallsCount });
});

/** What needs attention right now: open orders, ordering status, messages, reservations, stock. */
router.get('/live', requireStaff, async (req, res) => {
  const settings = await loadSettings();
  const now = new Date();
  const todayStart = localDayStart(localDateKey(now, settings.timezone), settings.timezone);
  const orders = db().collection('PickupOrder');
  const [open, todayOrders, recentOrders, unread, recentMessages, reservations, soldOut, menuCount, liveOffers, tableCount, tableSessions] = await Promise.all([
    orders.find({ status: { $in: ACTIVE } }, { projection: { status: 1, pickupAt: 1, number: 1, customerName: 1 } }).sort({ pickupAt: 1 }).toArray(),
    orders.find({ createdAt: { $gte: todayStart } }, { projection: { status: 1, grandTotal: 1, total: 1 } }).toArray(),
    orders
      .find({}, { projection: { number: 1, status: 1, fulfillment: 1, tableNumber: 1, customerName: 1, customerId: 1, grandTotal: 1, total: 1, createdAt: 1, pickupAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(RECENT_ORDERS)
      .toArray(),
    db().collection('ContactMessage').countDocuments({ isRead: false }),
    db().collection('ContactMessage').find({}, { projection: { name: 1, type: 1, isRead: 1, createdAt: 1, date: 1, guests: 1 } }).sort({ createdAt: -1 }).limit(RECENT_MESSAGES).toArray(),
    db()
      .collection('ContactMessage')
      .find({ type: 'RESERVATION', date: { $gte: todayStart } }, { projection: { name: 1, date: 1, guests: 1, isRead: 1, phone: 1 } })
      .sort({ date: 1 })
      .limit(UPCOMING_RESERVATIONS)
      .toArray(),
    db().collection('MenuItem').find({ isSoldOut: true }, { projection: { nameEn: 1, nameJa: 1 } }).limit(SOLD_OUT_LIST).toArray(),
    db().collection('MenuItem').countDocuments(),
    db().collection('Offer').countDocuments({ isActive: { $ne: false }, $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }] }),
    db().collection('DiningTable').countDocuments({ isActive: { $ne: false } }),
    db().collection('TableSession').find({ status: { $in: ['OPEN', 'BILL_REQUESTED'] } }, { projection: { guests: 1, status: 1, calls: 1 } }).toArray(),
  ]);

  const late = open.filter((order) => order.status !== 'READY' && order.pickupAt < now);
  const completedToday = todayOrders.filter((order) => order.status === 'COMPLETED');
  const isAdmin = req.user?.role === 'ADMIN';
  const nextDue = open.find((order) => order.status !== 'READY');

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    serverTime: now,
    open: {
      NEW: open.filter((order) => order.status === 'NEW').length,
      CONFIRMED: open.filter((order) => order.status === 'CONFIRMED').length,
      READY: open.filter((order) => order.status === 'READY').length,
      late: late.length,
      nextDue: nextDue ? { number: nextDue.number, customerName: nextDue.customerName, pickupAt: nextDue.pickupAt } : null,
    },
    today: {
      placed: todayOrders.filter((order) => order.status !== 'CANCELLED').length,
      completed: completedToday.length,
      cancelled: todayOrders.filter((order) => order.status === 'CANCELLED').length,
      // Sales are for admins only.
      sales: isAdmin ? completedToday.reduce((sum, order) => sum + paidAmount(order as unknown as OrderFact), 0) : null,
    },
    ordering: { ...fulfillmentOptions(settings), stampCard: stampConfig(settings).enabled, liveOffers },
    recentOrders: recentOrders.map(({ _id, grandTotal, total, ...order }) => ({ id: _id.toHexString(), ...order, member: Boolean(order.customerId), customerId: undefined, amount: isAdmin ? (grandTotal ?? total) : null })),
    messages: { unread, recent: recentMessages.map(({ _id, ...message }) => ({ id: _id.toHexString(), ...message })) },
    reservations: reservations.map(({ _id, ...reservation }) => ({ id: _id.toHexString(), ...reservation })),
    menu: { total: menuCount, soldOut: soldOut.map((item) => item.nameJa || item.nameEn) },
    dining: {
      enabled: Boolean(settings.diningEnabled),
      tables: tableCount,
      occupied: tableSessions.length,
      guests: tableSessions.reduce((sum, session) => sum + (Number(session.guests) || 0), 0),
      billRequested: tableSessions.filter((session) => session.status === 'BILL_REQUESTED').length,
      calls: tableSessions.reduce((sum, session) => sum + (session.calls ?? []).filter((call: { resolvedAt?: Date | null }) => !call.resolvedAt).length, 0),
    },
  });
});

// ---- Admin top bar: search and notifications -------------------------------------

const SEARCH_LIMIT = 6;
const searchQuery = z.object({ q: z.string().trim().min(1).max(100) });
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One box to find orders, members, dishes, tables and messages. Staff see what their role can open. */
router.get('/search', requireStaff, async (req, res) => {
  const { q } = searchQuery.parse(req.query);
  const isAdmin = req.user?.role === 'ADMIN';
  const text = new RegExp(escapeRegex(q), 'i');
  const digits = q.replace(/\D/g, '');
  const number = /^#?\d{1,4}$/.test(q) ? Number(q.replace('#', '')) : null;
  const phone = digits.length >= 4 ? new RegExp(digits.split('').join('[\\s()+-]*')) : null;
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [orders, members, items, tables, messages] = await Promise.all([
    db()
      .collection('PickupOrder')
      .find(
        {
          $or: [
            ...(number !== null ? [{ number, createdAt: { $gte: since } }] : []),
            { customerName: text },
            { tableNumber: q },
            ...(phone ? [{ phone }] : []),
          ],
        },
        { projection: { number: 1, status: 1, fulfillment: 1, tableNumber: 1, customerName: 1, createdAt: 1 } },
      )
      .sort({ createdAt: -1 })
      .limit(SEARCH_LIMIT)
      .toArray(),
    isAdmin
      ? db()
          .collection('Customer')
          .find({ deletedAt: { $exists: false }, $or: [{ name: text }, { nameKana: text }, { email: text }, ...(phone ? [{ phone }] : [])] }, { projection: { name: 1, email: 1, phone: 1 } })
          .limit(SEARCH_LIMIT)
          .toArray()
      : Promise.resolve([]),
    db().collection('MenuItem').find({ $or: [{ nameEn: text }, { nameJa: text }] }, { projection: { nameEn: 1, nameJa: 1, price: 1, isSoldOut: 1 } }).limit(SEARCH_LIMIT).toArray(),
    db().collection('DiningTable').find({ $or: [{ number: q }, { name: text }, { area: text }] }, { projection: { number: 1, name: 1 } }).limit(SEARCH_LIMIT).toArray(),
    isAdmin
      ? db()
          .collection('ContactMessage')
          .find({ $or: [{ name: text }, { email: text }, { message: text }] }, { projection: { name: 1, type: 1, createdAt: 1, isRead: 1 } })
          .sort({ createdAt: -1 })
          .limit(SEARCH_LIMIT)
          .toArray()
      : Promise.resolve([]),
  ]);

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    orders: orders.map((o) => ({ id: o._id.toHexString(), number: o.number, status: o.status, fulfillment: o.fulfillment ?? 'PICKUP', tableNumber: o.tableNumber ?? null, customerName: o.customerName, createdAt: o.createdAt })),
    members: members.map((m) => ({ id: m._id.toHexString(), name: m.name, email: m.email, phone: m.phone ?? '' })),
    menuItems: items.map((i) => ({ id: i._id.toHexString(), nameEn: i.nameEn, nameJa: i.nameJa ?? null, price: i.price, isSoldOut: Boolean(i.isSoldOut) })),
    tables: tables.map((t) => ({ id: t._id.toHexString(), number: t.number, name: t.name ?? null })),
    messages: messages.map((m) => ({ id: m._id.toHexString(), name: m.name, type: m.type, createdAt: m.createdAt, isRead: Boolean(m.isRead) })),
  });
});

/** Everything waiting for someone, newest problems first, for the bell in the admin top bar. */
router.get('/notifications', requireStaff, async (req, res) => {
  const isAdmin = req.user?.role === 'ADMIN';
  const settings = await loadSettings();
  const now = new Date();
  const [newOrders, late, sessions, unread, soldOut] = await Promise.all([
    db().collection('PickupOrder').find({ status: 'NEW' }, { projection: { number: 1, fulfillment: 1, tableNumber: 1, customerName: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(10).toArray(),
    db().collection('PickupOrder').countDocuments({ status: { $in: ['NEW', 'CONFIRMED'] }, pickupAt: { $lt: now } }),
    db().collection('TableSession').find({ status: { $in: ['OPEN', 'BILL_REQUESTED'] } }, { projection: { tableNumber: 1, status: 1, calls: 1 } }).toArray(),
    isAdmin ? db().collection('ContactMessage').find({ isRead: false }, { projection: { name: 1, type: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(5).toArray() : Promise.resolve([]),
    db().collection('MenuItem').find({ isSoldOut: true }, { projection: { nameEn: 1, nameJa: 1 } }).limit(20).toArray(),
  ]);

  type Note = { id: string; tone: 'critical' | 'warning' | 'info'; title: string; detail?: string; tab: string; at?: Date };
  const notes: Note[] = [];
  for (const session of sessions) {
    for (const call of (session.calls ?? []).filter((c: { resolvedAt?: Date | null }) => !c.resolvedAt)) {
      const what = call.type === 'BILL' ? 'asks for the bill' : call.type === 'WATER' ? 'asks for water' : 'is calling staff';
      notes.push({ id: `call-${call.id}`, tone: 'critical', title: `Table ${session.tableNumber} ${what}`, tab: 'Tables', at: call.createdAt });
    }
  }
  if (late > 0) notes.push({ id: 'late', tone: 'critical', title: `${late} order${late === 1 ? '' : 's'} past due time`, detail: 'Not ready yet', tab: 'Orders' });
  for (const order of newOrders) {
    const where = order.fulfillment === 'DINE_IN' ? `Table ${order.tableNumber}` : order.fulfillment === 'DELIVERY' ? `Delivery · ${order.customerName}` : `Pickup · ${order.customerName}`;
    notes.push({ id: `order-${order._id.toHexString()}`, tone: 'warning', title: `New order #${String(order.number).padStart(3, '0')}`, detail: where, tab: 'Orders', at: order.createdAt });
  }
  const paused = pausedUntil(settings, now);
  if (paused) notes.push({ id: 'paused', tone: 'warning', title: 'Online orders paused by the kitchen', detail: `Until ${paused.toLocaleTimeString('ja-JP', { timeZone: settings.timezone ?? 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}`, tab: 'Orders' });
  else if (!settings.pickupEnabled && !settings.deliveryEnabled) notes.push({ id: 'ordering-off', tone: 'info', title: 'Online ordering is off', detail: 'Pickup and delivery are both switched off', tab: 'Orders' });
  for (const message of unread) {
    notes.push({ id: `msg-${message._id.toHexString()}`, tone: 'info', title: `Message from ${message.name}`, detail: String(message.type ?? 'GENERAL').toLowerCase(), tab: 'Contact Messages', at: message.createdAt });
  }
  if (soldOut.length) notes.push({ id: 'sold-out', tone: 'info', title: `${soldOut.length} item${soldOut.length === 1 ? '' : 's'} sold out`, detail: soldOut.slice(0, 4).map((i) => i.nameJa || i.nameEn).join('、'), tab: 'Menu Management' });

  res.setHeader('Cache-Control', 'no-store');
  // The badge counts what needs action: calls, late orders, new orders and unread messages.
  res.json({ count: notes.filter((note) => note.id !== 'sold-out' && note.id !== 'ordering-off').length, items: notes });
});

const analyticsQuery = z
  .object({
    range: z.enum(RANGES).default('7d'),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((query) => query.range !== 'custom' || (query.from && query.to), 'A custom range needs from and to');

const periodFrom = async (query: unknown) => {
  const { range, from, to } = analyticsQuery.parse(query);
  const settings = await loadSettings();
  return { settings, period: periodFor(range, settings.timezone, new Date(), from && to ? { from, to } : undefined) };
};

/** Sales, orders, customers and loyalty for a period, with the previous period for comparison. */
router.get('/analytics', requireAdmin, async (req, res) => {
  const { settings, period } = await periodFrom(req.query);
  const tz = settings.timezone;
  const inPeriod = { $gte: period.start, $lt: period.end };
  const orders = db().collection('PickupOrder');

  const [current, previous, membersTotal, newMembers, previousNewMembers, newsletter, points, stamps, rewardsEarned, rewardsUsed, messages, outstanding] = await Promise.all([
    orders.find({ createdAt: inPeriod }, { projection: ORDER_FIELDS }).toArray() as unknown as Promise<OrderFact[]>,
    orders.find({ createdAt: { $gte: period.previousStart, $lt: period.previousEnd } }, { projection: ORDER_FIELDS }).toArray() as unknown as Promise<OrderFact[]>,
    db().collection('Customer').countDocuments({ deletedAt: { $exists: false } }),
    db().collection('Customer').countDocuments({ createdAt: inPeriod }),
    db().collection('Customer').countDocuments({ createdAt: { $gte: period.previousStart, $lt: period.previousEnd } }),
    db().collection('Customer').countDocuments({ newsletterOptIn: true, deletedAt: { $exists: false } }),
    db()
      .collection('PointTransaction')
      .aggregate<{ _id: string; points: number }>([{ $match: { createdAt: inPeriod } }, { $group: { _id: '$type', points: { $sum: '$points' } } }])
      .toArray(),
    db().collection('Stamp').countDocuments({ createdAt: inPeriod }),
    db().collection('StampReward').countDocuments({ earnedAt: inPeriod }),
    db().collection('StampReward').countDocuments({ usedAt: inPeriod }),
    db()
      .collection('ContactMessage')
      .aggregate<{ _id: string; count: number }>([{ $match: { createdAt: inPeriod } }, { $group: { _id: '$type', count: { $sum: 1 } } }])
      .toArray(),
    db()
      .collection('Customer')
      .aggregate<{ points: number }>([{ $match: { deletedAt: { $exists: false } } }, { $group: { _id: null, points: { $sum: '$points' } } }])
      .toArray(),
  ]);

  // Returning members: ordered in this period and had completed an order before it.
  const memberIds = [...new Set(current.filter((order) => order.status === 'COMPLETED' && order.customerId).map((order) => String(order.customerId)))];
  const buyers = current.filter((order) => order.status === 'COMPLETED' && order.customerId).map((order) => order.customerId as unknown as ObjectId);
  const returning = memberIds.length
    ? (await orders.distinct('customerId', { customerId: { $in: buyers }, status: 'COMPLETED', createdAt: { $lt: period.start } })).length
    : 0;

  const now = headline(current);
  const before = headline(previous);
  const pointsBy = (type: string) => points.find((entry) => entry._id === type)?.points ?? 0;

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    period: { range: period.range, start: period.start, end: period.end, previousStart: period.previousStart, bucket: period.bucket, days: period.days, timezone: tz ?? 'Asia/Tokyo' },
    headline: now,
    previous: before,
    change: {
      sales: change(now.sales, before.sales),
      orders: change(now.orders, before.orders),
      averageOrder: change(now.averageOrder, before.averageOrder),
      newMembers: change(newMembers, previousNewMembers),
    },
    series: salesSeries(current, period, tz),
    busyHours: busyHours(current, tz),
    topItems: topItems(current),
    fulfillment: fulfillmentSplit(current),
    promotions: promotionUse(current),
    members: {
      total: membersTotal,
      new: newMembers,
      previousNew: previousNewMembers,
      newsletter,
      buyers: memberIds.length,
      returning,
    },
    loyalty: {
      pointsEarned: pointsBy('EARN') + pointsBy('BONUS'),
      pointsRedeemed: -pointsBy('REDEEM') - pointsBy('REFUND'),
      pointsOutstanding: outstanding[0]?.points ?? 0,
      stampsGiven: stamps,
      rewardsEarned,
      rewardsUsed,
    },
    messages: Object.fromEntries(messages.map((entry) => [entry._id ?? 'GENERAL', entry.count])),
  });
});

// Cells starting with these would run as formulas when the file is opened in Excel.
const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Every order in the period as a spreadsheet (opens in Excel / Numbers / Google Sheets). */
router.get('/analytics/orders.csv', requireAdmin, async (req, res) => {
  const { settings, period } = await periodFrom(req.query);
  const rows = await db()
    .collection('PickupOrder')
    .find({ createdAt: { $gte: period.start, $lt: period.end } }, { projection: { ...ORDER_FIELDS, phone: 1 } })
    .sort({ createdAt: 1 })
    .limit(MAX_EXPORT_ROWS)
    .toArray();
  const when = (date: unknown) => (date instanceof Date ? date.toLocaleString('ja-JP', { timeZone: settings.timezone ?? 'Asia/Tokyo' }) : '');
  const header = ['Placed', 'Order no.', 'Status', 'Type', 'Due', 'Customer', 'Member', 'Items', 'Subtotal', 'Offer discount', 'Stamp reward', 'Points used (¥)', 'Tax', 'Delivery fee', 'Paid (tax incl.)'];
  const lines = rows.map((order) =>
    [
      when(order.createdAt),
      order.number,
      order.status,
      order.fulfillment === 'DELIVERY' ? 'Delivery' : 'Pickup',
      when(order.pickupAt),
      order.customerName,
      order.customerId ? 'yes' : 'no',
      (order.items ?? []).map((line: { quantity: number; nameEn: string }) => `${line.quantity}x ${line.nameEn}`).join(' / '),
      order.subtotal ?? order.total,
      order.offer?.discount ?? 0,
      order.reward?.discount ?? 0,
      order.pointsDiscount ?? 0,
      order.tax ?? 0,
      order.deliveryFee ?? 0,
      paidAmount(order as unknown as OrderFact),
    ]
      .map(csvCell)
      .join(','),
  );
  const name = `kalpana-orders-${period.days[0]}_${period.days[period.days.length - 1]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  // The BOM makes Excel read the Japanese names correctly.
  res.send(`﻿${[header.join(','), ...lines].join('\r\n')}`);
});

export default router;
