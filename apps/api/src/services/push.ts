import { ObjectId } from 'mongodb';
import webpush from 'web-push';
import { logger } from '../lib/logger.js';
import { db } from '../lib/mongo.js';
import { loadSettings } from './settings-store.js';

// Web push: "your food is ready" notifications that reach the customer's phone or computer even when
// the order page is closed. The VAPID key pair comes from the environment, or is created once and
// kept in the database, so it works without setup.

interface Keys {
  publicKey: string;
  privateKey: string;
}

let keysReady: Promise<Keys> | undefined;
export function vapidKeys(): Promise<Keys> {
  keysReady ??= (async () => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    }
    const secrets = db().collection<{ _id: string } & Keys>('AppSecret');
    const saved = await secrets.findOne({ _id: 'vapid' });
    if (saved) return { publicKey: saved.publicKey, privateKey: saved.privateKey };
    const generated = webpush.generateVAPIDKeys();
    // Insert-if-missing, so two servers starting together end up with the same pair.
    await secrets.updateOne({ _id: 'vapid' }, { $setOnInsert: generated }, { upsert: true });
    const stored = await secrets.findOne({ _id: 'vapid' });
    return { publicKey: stored!.publicKey, privateKey: stored!.privateKey };
  })();
  return keysReady;
}

/** Only the browsers' own push services: the server never posts to any other address. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const subscriptions = () => db().collection('PushSubscription');

let indexReady: Promise<unknown> | undefined;
const ensureIndexes = () =>
  (indexReady ??= Promise.all([
    subscriptions().createIndex({ endpoint: 1 }, { unique: true }),
    subscriptions().createIndex({ orderIds: 1 }),
    subscriptions().createIndex({ customerId: 1 }),
    subscriptions().createIndex({ sessionIds: 1 }),
  ]));

/** Remembers this browser for an order (and for the member, so their next orders notify too). */
export async function saveSubscription(subscription: PushSubscriptionInput, link: { orderId?: ObjectId; customerId?: ObjectId; sessionId?: ObjectId }) {
  await ensureIndexes();
  const now = new Date();
  await subscriptions().updateOne(
    { endpoint: subscription.endpoint },
    {
      $set: { keys: subscription.keys, updatedAt: now, ...(link.customerId ? { customerId: link.customerId } : {}) },
      $setOnInsert: { createdAt: now },
      ...(link.orderId || link.sessionId
        ? { $addToSet: { ...(link.orderId ? { orderIds: link.orderId } : {}), ...(link.sessionId ? { sessionIds: link.sessionId } : {}) } }
        : {}),
    },
    { upsert: true },
  );
}

export async function removeSubscription(endpoint: string) {
  await subscriptions().deleteOne({ endpoint });
}

/** The words for each kind of order when it becomes ready. */
export function readyMessage(order: { number?: unknown; fulfillment?: unknown; tableNumber?: unknown; token?: unknown }, shopName: string) {
  const number = `#${String(order.number ?? '').padStart(3, '0')}`;
  if (order.fulfillment === 'DELIVERY') {
    return { title: `${shopName}：配達に出発しました 🛵`, body: `ご注文 ${number} をお届けに向かっています。まもなく到着します。` };
  }
  if (order.fulfillment === 'DINE_IN') {
    return { title: `${shopName}：お料理ができました 🍛`, body: `テーブル ${order.tableNumber ?? ''} にまもなくお持ちします。` };
  }
  return { title: `${shopName}：ご注文の準備ができました 🎉`, body: `受付番号 ${number}。店頭でお受け取りください。` };
}

/** Sends "your food is ready" to every browser linked to the order or its member. Never throws. */
export async function notifyOrderReady(order: Record<string, unknown>): Promise<number> {
  try {
    const orderId = order._id as ObjectId;
    const customerId = order.customerId instanceof ObjectId ? order.customerId : null;
    const sessionId = order.sessionId instanceof ObjectId ? order.sessionId : null;
    const targets = await subscriptions()
      .find({ $or: [{ orderIds: orderId }, ...(customerId ? [{ customerId }] : []), ...(sessionId ? [{ sessionIds: sessionId }] : [])] })
      .toArray();
    if (targets.length === 0) return 0;

    const [keys, settings] = await Promise.all([vapidKeys(), loadSettings() as Promise<{ name?: string; email?: string | null }>]);
    const subject = process.env.VAPID_SUBJECT || (settings.email ? `mailto:${settings.email}` : 'mailto:noreply@kalpana.invalid');
    const shopName = settings.name?.trim() || 'カルパナ';
    const url = order.fulfillment === 'DINE_IN' ? '/' : `/order/${String(order.token)}`;
    const payload = JSON.stringify({ ...readyMessage(order, shopName), url, tag: `order-${orderId.toHexString()}` });

    let sent = 0;
    await Promise.all(
      targets.map(async (target) => {
        try {
          await webpush.sendNotification({ endpoint: target.endpoint, keys: target.keys }, payload, {
            vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
            TTL: 60 * 60,
            urgency: 'high',
          });
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // The browser unsubscribed or the subscription expired: forget it.
          if (status === 404 || status === 410) await removeSubscription(target.endpoint);
          else logger.warn({ status, err: (err as Error).message }, 'Push notification failed');
        }
      }),
    );
    return sent;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Ready notification skipped');
    return 0;
  }
}
