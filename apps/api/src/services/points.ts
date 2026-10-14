import { ObjectId } from 'mongodb';
import { db } from '../lib/mongo.js';

export type PointType = 'EARN' | 'REDEEM' | 'REFUND' | 'BONUS' | 'ADJUST';

interface PointMeta {
  orderId?: ObjectId;
  orderNumber?: number;
  note?: string;
  userId?: string;
}

/**
 * Changes a customer's balance and records why. The balance check and the change are one atomic
 * update, so two checkouts at once can't spend the same points. Returns false if the balance is too low.
 */
export async function changePoints(customerId: ObjectId, delta: number, type: PointType, meta: PointMeta = {}): Promise<boolean> {
  if (delta === 0) return true;
  const filter = delta < 0 ? { _id: customerId, points: { $gte: -delta } } : { _id: customerId };
  const updated = await db()
    .collection('Customer')
    .findOneAndUpdate(filter, { $inc: { points: delta }, $set: { updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!updated) return false;

  await db().collection('PointTransaction').insertOne({
    _id: new ObjectId(),
    customerId,
    type,
    points: delta,
    balanceAfter: updated.points,
    orderId: meta.orderId ?? null,
    orderNumber: meta.orderNumber ?? null,
    note: meta.note ?? null,
    userId: meta.userId ? new ObjectId(meta.userId) : null,
    createdAt: new Date(),
  });
  return true;
}
