import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { db } from '../lib/mongo.js';
import { optionalCustomer } from '../middleware/customerAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { isPushEndpoint, removeSubscription, saveSubscription, vapidKeys } from '../services/push.js';

// Customers turn on "tell me when my food is ready" notifications here.

const router = express.Router();

const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpoint, 'Not a browser push address'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
const subscribeSchema = z.object({
  subscription: subscriptionSchema,
  /** The order page's token, so this browser is told when that order is ready. */
  orderToken: z.string().regex(/^[A-Za-z0-9_-]{22}$/).optional(),
  /** Table guests: the table's QR code and the current visit, so every round at the table notifies. */
  tableToken: z.string().regex(/^[A-Za-z0-9_-]{16}$/).optional(),
  sessionId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, key: (req) => `push|${req.ip}` });

router.get('/key', async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({ publicKey: (await vapidKeys()).publicKey });
});

router.post('/subscribe', limiter, optionalCustomer, async (req, res) => {
  const { subscription, orderToken, tableToken, sessionId: sessionText } = subscribeSchema.parse(req.body);
  let orderId;
  let sessionId;
  if (tableToken && sessionText) {
    const table = await db().collection('DiningTable').findOne({ qrToken: tableToken }, { projection: { _id: 1 } });
    const session = table && (await db().collection('TableSession').findOne({ _id: new ObjectId(sessionText), tableId: table._id, status: { $ne: 'CLOSED' } }, { projection: { _id: 1 } }));
    if (!session) throw new AppError(404, 'NOT_FOUND', 'Table visit not found');
    sessionId = session._id;
  }
  if (orderToken) {
    const order = await db().collection('PickupOrder').findOne({ token: orderToken }, { projection: { _id: 1 } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    orderId = order._id;
  }
  if (!orderId && !sessionId && !req.customer) throw new AppError(400, 'NOTHING_TO_FOLLOW', 'Sign in or open an order to turn on notifications');
  await saveSubscription(subscription, { orderId, sessionId, customerId: req.customer?.id });
  res.status(201).json({ success: true });
});

router.post('/unsubscribe', limiter, async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
  await removeSubscription(endpoint);
  res.json({ success: true });
});

export default router;
