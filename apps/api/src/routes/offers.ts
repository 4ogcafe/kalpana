import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { isOfferLive, type OfferRule } from '../lib/loyalty.js';
import { db } from '../lib/mongo.js';
import { idParam, imageUrl, optionalText } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

const MAX_DISCOUNT_YEN = 1_000_000;
const MAX_PERCENT = 100;

const optionalDate = z.preprocess(
  (value) => (value === '' || value === null ? null : value),
  z.coerce.date().nullable().optional(),
);

const offerSchema = z
  .object({
    titleJa: z.string().trim().min(1).max(100),
    descriptionJa: optionalText(1000),
    imageUrl: imageUrl.nullable().optional(),
    discountType: z.enum(['PERCENT', 'AMOUNT']),
    discountValue: z.number().int().min(1).max(MAX_DISCOUNT_YEN),
    minSubtotal: z.number().int().min(0).max(MAX_DISCOUNT_YEN).default(0),
    startsAt: optionalDate,
    endsAt: optionalDate,
    oncePerCustomer: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((offer) => offer.discountType !== 'PERCENT' || offer.discountValue <= MAX_PERCENT, {
    message: 'A percentage discount must be 100 or less',
    path: ['discountValue'],
  })
  .refine((offer) => !offer.startsAt || !offer.endsAt || offer.startsAt < offer.endsAt, {
    message: 'The end date must be after the start date',
    path: ['endsAt'],
  });

const toJson = ({ _id, ...offer }: Record<string, unknown>) => ({ id: String(_id), ...offer });

async function audit(userId: string | undefined, action: string, entityId: ObjectId, diff: unknown) {
  await db().collection('AuditLog').insertOne({
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    action,
    entity: 'Offer',
    entityId: entityId.toHexString(),
    diff,
    createdAt: new Date(),
  });
}

/** Live member offers, for the public site to advertise. Using one still requires a member login. */
router.get('/', async (_req, res) => {
  const offers = await db().collection('Offer').find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).toArray();
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(
    offers
      .filter((offer) => isOfferLive(offer as unknown as OfferRule))
      .map((offer) => ({
        id: offer._id.toHexString(),
        titleJa: offer.titleJa,
        descriptionJa: offer.descriptionJa ?? '',
        imageUrl: offer.imageUrl ?? '',
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        minSubtotal: offer.minSubtotal ?? 0,
        endsAt: offer.endsAt ?? null,
      })),
  );
});

router.get('/all', requireAdmin, async (_req, res) => {
  const offers = await db().collection('Offer').find({}).sort({ createdAt: -1 }).toArray();
  const usage = await db()
    .collection('PickupOrder')
    .aggregate<{ _id: ObjectId; uses: number }>([
      { $match: { 'offer.id': { $in: offers.map((offer) => offer._id) }, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: '$offer.id', uses: { $sum: 1 } } },
    ])
    .toArray();
  const uses = new Map(usage.map((entry) => [entry._id.toHexString(), entry.uses]));
  res.setHeader('Cache-Control', 'no-store');
  res.json(offers.map((offer) => ({ ...toJson(offer), uses: uses.get(offer._id.toHexString()) ?? 0 })));
});

router.post('/', requireAdmin, async (req, res) => {
  const input = offerSchema.parse(req.body);
  const now = new Date();
  const offer = { _id: new ObjectId(), ...input, descriptionJa: input.descriptionJa ?? null, imageUrl: input.imageUrl ?? null, createdAt: now, updatedAt: now };
  await db().collection('Offer').insertOne(offer);
  await audit(req.user?.id, 'offer.create', offer._id, input);
  res.status(201).json(toJson(offer));
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const input = offerSchema.parse(req.body);
  const result = await db().collection('Offer').updateOne({ _id: id }, { $set: { ...input, updatedAt: new Date() } });
  if (result.matchedCount === 0) throw notFound('Offer');
  await audit(req.user?.id, 'offer.update', id, input);
  res.json({ success: true });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  // Orders keep a copy of the offer title, so deleting an offer never changes past receipts.
  const result = await db().collection('Offer').deleteOne({ _id: id });
  if (result.deletedCount === 0) throw notFound('Offer');
  await audit(req.user?.id, 'offer.delete', id, null);
  res.json({ success: true });
});

export default router;
