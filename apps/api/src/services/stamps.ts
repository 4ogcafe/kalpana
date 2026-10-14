import { MongoServerError, ObjectId } from 'mongodb';
import { AppError } from '../lib/errors.js';
import { db } from '../lib/mongo.js';
import {
  cooldownCutoff,
  newMemberCode,
  nextStampAt,
  rewardExpiry,
  rewardsForStamp,
  stampConfig,
  type StampConfig,
  type StampRewardKind,
} from '../lib/stamps.js';
import { loadSettings } from './settings-store.js';

const DUPLICATE_KEY = 11000;
const HISTORY_LIMIT = 50;

let indexesReady: Promise<unknown> | undefined;
const ensureIndexes = () =>
  (indexesReady ??= Promise.all([
    db().collection('Customer').createIndex({ memberCode: 1 }, { unique: true, partialFilterExpression: { memberCode: { $type: 'string' } } }),
    db().collection('Stamp').createIndex({ customerId: 1, createdAt: -1 }),
    db().collection('Stamp').createIndex({ orderId: 1 }, { unique: true, partialFilterExpression: { orderId: { $type: 'objectId' } } }),
    db().collection('StampReward').createIndex({ customerId: 1, status: 1, earnedAt: -1 }),
  ]));

/** The member's in-store code, created the first time it is needed. */
export async function memberCodeFor(customerId: ObjectId): Promise<string> {
  await ensureIndexes();
  const existing = await db().collection('Customer').findOne({ _id: customerId }, { projection: { memberCode: 1 } });
  if (typeof existing?.memberCode === 'string') return existing.memberCode;
  for (;;) {
    const code = newMemberCode();
    try {
      const updated = await db()
        .collection('Customer')
        .findOneAndUpdate({ _id: customerId, memberCode: { $exists: false } }, { $set: { memberCode: code } }, { returnDocument: 'after' });
      if (updated) return code;
      // Another request created it first.
      const again = await db().collection('Customer').findOne({ _id: customerId }, { projection: { memberCode: 1 } });
      return String(again?.memberCode);
    } catch (err) {
      if (!(err instanceof MongoServerError && err.code === DUPLICATE_KEY)) throw err;
    }
  }
}

export type StampSource = 'ORDER' | 'STAFF';

export type StampResult =
  | { status: 'AWARDED'; position: number; perCard: number; cardCompleted: boolean; rewards: { titleJa: string; kind: StampRewardKind; amount: number }[] }
  | { status: 'DISABLED' }
  | { status: 'BELOW_MINIMUM'; minAmount: number }
  | { status: 'TOO_SOON'; nextAt: Date }
  | { status: 'NOT_FOUND' };

/**
 * Gives a member one stamp if the amount qualifies and the minimum gap since their last stamp has
 * passed. The gap check and the stamp are one atomic update, so a stamp can never be given twice.
 */
export async function awardStamp(
  customerId: ObjectId,
  input: { source: StampSource; amount: number; orderId?: ObjectId; orderNumber?: number; userId?: string; note?: string },
  config?: StampConfig,
  now: Date = new Date(),
): Promise<StampResult> {
  const settings = config ?? stampConfig(await loadSettings());
  if (!settings.enabled) return { status: 'DISABLED' };
  if (input.amount < settings.minAmount) return { status: 'BELOW_MINIMUM', minAmount: settings.minAmount };
  await ensureIndexes();

  const cutoff = cooldownCutoff(settings, now);
  const customers = db().collection('Customer');
  const updated = await customers.findOneAndUpdate(
    {
      _id: customerId,
      deletedAt: { $exists: false },
      $or: [{ lastStampAt: { $exists: false } }, { lastStampAt: null }, { lastStampAt: { $lte: cutoff } }],
    },
    { $inc: { stampCount: 1, stampTotal: 1 }, $set: { lastStampAt: now, updatedAt: now } },
    { returnDocument: 'after' },
  );
  if (!updated) {
    const customer = await customers.findOne({ _id: customerId, deletedAt: { $exists: false } }, { projection: { lastStampAt: 1 } });
    if (!customer) return { status: 'NOT_FOUND' };
    return { status: 'TOO_SOON', nextAt: nextStampAt(customer.lastStampAt, settings, now) ?? now };
  }

  // If the admin made cards shorter, a card already past the new length is completed by this stamp.
  const count = Number(updated.stampCount);
  const position = Math.min(count, settings.perCard);
  const card = (Number(updated.stampCardsCompleted) || 0) + 1;
  const cardCompleted = position >= settings.perCard;

  await db().collection('Stamp').insertOne({
    _id: new ObjectId(),
    customerId,
    card,
    position,
    source: input.source,
    amount: input.amount,
    orderId: input.orderId ?? null,
    orderNumber: input.orderNumber ?? null,
    userId: input.userId ? new ObjectId(input.userId) : null,
    note: input.note ?? null,
    createdAt: now,
  });

  const rewards = rewardsForStamp(position, settings).map((rule) => ({ titleJa: rule.titleJa, kind: rule.kind, amount: rule.kind === 'AMOUNT_OFF' ? (rule.amount ?? 0) : 0 }));
  if (rewards.length > 0) {
    await db()
      .collection('StampReward')
      .insertMany(
        rewards.map((reward) => ({
          _id: new ObjectId(),
          customerId,
          ...reward,
          card,
          at: position,
          status: 'AVAILABLE',
          earnedAt: now,
          expiresAt: rewardExpiry(now, settings),
          usedAt: null,
          orderId: null,
        })),
      );
  }

  if (cardCompleted) {
    await customers.updateOne({ _id: customerId, stampCount: count }, { $set: { stampCount: 0 }, $inc: { stampCardsCompleted: 1 } });
  }
  return { status: 'AWARDED', position, perCard: settings.perCard, cardCompleted, rewards };
}

/** A reward the member holds that can be used now (not used, not expired). */
export const usableRewardFilter = (customerId: ObjectId, now: Date = new Date()) => ({
  customerId,
  status: 'AVAILABLE',
  $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
});

export async function findUsableReward(rewardId: ObjectId, customerId: ObjectId) {
  const reward = await db().collection('StampReward').findOne({ _id: rewardId, ...usableRewardFilter(customerId) });
  if (!reward) throw new AppError(409, 'REWARD_UNAVAILABLE', 'このスタンプ特典はご利用いただけません。');
  return reward;
}

/** Marks a reward used, atomically, so it can't be used on two orders. Returns false if it was already used. */
export async function useReward(rewardId: ObjectId, customerId: ObjectId, meta: { orderId?: ObjectId; orderNumber?: number; userId?: string }) {
  const result = await db()
    .collection('StampReward')
    .updateOne(
      { _id: rewardId, ...usableRewardFilter(customerId) },
      {
        $set: {
          status: 'USED',
          usedAt: new Date(),
          orderId: meta.orderId ?? null,
          orderNumber: meta.orderNumber ?? null,
          usedBy: meta.userId ? new ObjectId(meta.userId) : null,
        },
      },
    );
  return result.modifiedCount === 1;
}

/** Gives a reward back when the order it was used on is cancelled (or could not be saved). */
export async function releaseReward(orderId: ObjectId) {
  await db()
    .collection('StampReward')
    .updateOne({ orderId, status: 'USED' }, { $set: { status: 'AVAILABLE', usedAt: null, orderId: null, orderNumber: null } });
}

const publicReward = (reward: Record<string, unknown>) => ({
  id: String(reward._id),
  titleJa: reward.titleJa,
  kind: reward.kind,
  amount: Number(reward.amount) || 0,
  at: reward.at,
  card: reward.card,
  status: reward.status,
  earnedAt: reward.earnedAt,
  expiresAt: reward.expiresAt ?? null,
  usedAt: reward.usedAt ?? null,
});

/** Everything the member's stamp card page (and staff at the counter) need. */
export async function stampCardFor(customerId: ObjectId) {
  const config = stampConfig(await loadSettings());
  const now = new Date();
  const [customer, history, rewards] = await Promise.all([
    db().collection('Customer').findOne({ _id: customerId }, { projection: { stampCount: 1, stampTotal: 1, stampCardsCompleted: 1, lastStampAt: 1 } }),
    db().collection('Stamp').find({ customerId }).sort({ createdAt: -1 }).limit(HISTORY_LIMIT).toArray(),
    db().collection('StampReward').find({ customerId }).sort({ earnedAt: -1 }).limit(HISTORY_LIMIT).toArray(),
  ]);
  const isUsable = (reward: Record<string, unknown>) =>
    reward.status === 'AVAILABLE' && !(reward.expiresAt instanceof Date && reward.expiresAt <= now);

  return {
    enabled: config.enabled,
    memberCode: await memberCodeFor(customerId),
    perCard: config.perCard,
    stamps: Math.min(Number(customer?.stampCount) || 0, config.perCard),
    totalStamps: Number(customer?.stampTotal) || 0,
    completedCards: Number(customer?.stampCardsCompleted) || 0,
    lastStampAt: customer?.lastStampAt ?? null,
    nextStampAt: nextStampAt(customer?.lastStampAt, config, now),
    rules: { minAmount: config.minAmount, cooldownHours: config.cooldownHours, rewardValidDays: config.rewardValidDays },
    milestones: config.rewards.map(({ at, titleJa, kind, amount }) => ({ at, titleJa, kind, amount: kind === 'AMOUNT_OFF' ? (amount ?? 0) : 0 })),
    rewards: rewards.filter(isUsable).map(publicReward),
    pastRewards: rewards.filter((reward) => !isUsable(reward)).map((reward) => ({ ...publicReward(reward), status: reward.status === 'AVAILABLE' ? 'EXPIRED' : reward.status })),
    history: history.map((stamp) => ({
      id: stamp._id.toHexString(),
      card: stamp.card,
      position: stamp.position,
      source: stamp.source,
      amount: stamp.amount,
      orderNumber: stamp.orderNumber,
      createdAt: stamp.createdAt,
    })),
  };
}
