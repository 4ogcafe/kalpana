import { ObjectId } from 'mongodb';
import { AppError } from '../lib/errors.js';
import { deliveryFeeFor, type Fulfillment } from '../lib/fulfillment.js';
import { isOfferLive, loyaltyConfig, offerDiscount, priceBreakdown, type OfferRule, type PriceBreakdown } from '../lib/loyalty.js';
import { db } from '../lib/mongo.js';
import type { StampRewardKind } from '../lib/stamps.js';
import { consumptionTax, taxRatePercent } from '../lib/tax.js';
import type { StoredSettings } from './settings-store.js';
import { findUsableReward } from './stamps.js';

export const MAX_QUANTITY = 20;

export interface OrderLineOption {
  groupId: string;
  groupNameJa: string;
  optionId: string;
  nameJa: string;
  priceAdjust: number;
}

export interface OrderLine {
  itemId: ObjectId;
  nameEn: string;
  nameJa: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  options?: OrderLineOption[];
}

export interface AppliedOffer {
  id: ObjectId;
  titleJa: string;
  discount: number;
}

export interface AppliedReward {
  id: ObjectId;
  titleJa: string;
  kind: StampRewardKind;
  discount: number;
}

export interface TaxBreakdown {
  taxRate: number;
  tax: number;
  /** Delivery fee, tax included; 0 for pickup. */
  deliveryFee: number;
  /** For delivery: how much more food is needed to reach the minimum order (0 when met). */
  minOrderShortfall: number;
  /** What the customer pays on receipt, tax included. */
  grandTotal: number;
}

export interface OrderQuote {
  lines: OrderLine[];
  breakdown: PriceBreakdown & TaxBreakdown;
  offer: AppliedOffer | null;
  reward: AppliedReward | null;
}

/** Prices and availability come from the database, never from the client. */
export async function priceLines(
  requested: { itemId: string; quantity: number; optionAdjust?: number; options?: OrderLineOption[] }[]
): Promise<OrderLine[]> {
  const quantities = new Map<string, number>();
  const optionAdjusts = new Map<string, number>();
  const optionsByItemId = new Map<string, OrderLineOption[]>();
  for (const req of requested) {
    quantities.set(req.itemId, (quantities.get(req.itemId) ?? 0) + req.quantity);
    if (req.optionAdjust) optionAdjusts.set(req.itemId, req.optionAdjust);
    if (req.options) optionsByItemId.set(req.itemId, req.options);
  }

  const ids = [...quantities.keys()].map((id) => new ObjectId(id));
  const items = await db().collection('MenuItem').find({ _id: { $in: ids } }).toArray();

  return [...quantities].map(([id, requestedQuantity]) => {
    const item = items.find((candidate) => candidate._id.toHexString() === id);
    // Every active item on any menu can be ordered for pickup unless staff marked it sold out.
    const orderable = item && item.isActive !== false && !item.isSoldOut;
    if (!item || !orderable) {
      const name = item?.nameJa || item?.nameEn || id;
      throw new AppError(409, 'ITEM_UNAVAILABLE', `「${name}」は現在ご注文いただけません。カートから削除してください。`, { itemId: id });
    }
    const quantity = Math.min(requestedQuantity, MAX_QUANTITY);
    const optionAdjust = optionAdjusts.get(id) ?? 0;
    const unitPrice = (Number(item.price) || 0) + optionAdjust;
    const options = optionsByItemId.get(id);
    return { itemId: item._id, nameEn: item.nameEn, nameJa: item.nameJa ?? null, unitPrice, quantity, lineTotal: unitPrice * quantity, ...(options ? { options } : {}) };
  });
}

/** Has this customer already used a once-per-customer offer on an order that wasn't cancelled? */
export async function offerAlreadyUsed(offerId: ObjectId, customerId: ObjectId): Promise<boolean> {
  const used = await db()
    .collection('PickupOrder')
    .countDocuments({ customerId, 'offer.id': offerId, status: { $ne: 'CANCELLED' } }, { limit: 1 });
  return used > 0;
}

async function usableOffer(offerId: string, customerId: ObjectId) {
  const offer = await db().collection('Offer').findOne({ _id: new ObjectId(offerId) });
  if (!offer || !isOfferLive(offer as unknown as OfferRule)) {
    throw new AppError(409, 'OFFER_UNAVAILABLE', 'この特典は現在ご利用いただけません。');
  }
  if (offer.oncePerCustomer && (await offerAlreadyUsed(offer._id, customerId))) {
    throw new AppError(409, 'OFFER_USED', 'この特典はすでにご利用済みです。');
  }
  return offer;
}

/** The full price of a cart for this customer (or guest), with the chosen offer and points applied. */
export async function quoteOrder(input: {
  items: { itemId: string; quantity: number; optionAdjust?: number; options?: OrderLineOption[] }[];
  offerId?: string | null;
  rewardId?: string | null;
  pointsToUse?: number;
  customerId?: ObjectId;
  fulfillment?: Fulfillment;
  settings: StoredSettings;
}): Promise<OrderQuote> {
  const lines = await priceLines(input.items);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const isMember = Boolean(input.customerId);

  if ((input.offerId || input.rewardId || input.pointsToUse) && !input.customerId) {
    throw new AppError(401, 'UNAUTHENTICATED', '特典やポイントのご利用には会員ログインが必要です。');
  }

  const offerDoc = input.offerId && input.customerId ? await usableOffer(input.offerId, input.customerId) : null;
  const rule = offerDoc as unknown as OfferRule | null;
  if (rule && offerDiscount(rule, subtotal) === 0) {
    throw new AppError(409, 'OFFER_MIN_SUBTOTAL', `この特典は¥${(rule.minSubtotal ?? 0).toLocaleString('ja-JP')}以上のご注文でご利用いただけます。`);
  }

  const rewardDoc = input.rewardId && input.customerId ? await findUsableReward(new ObjectId(input.rewardId), input.customerId) : null;

  const customer = input.customerId
    ? await db().collection('Customer').findOne({ _id: input.customerId }, { projection: { points: 1 } })
    : null;

  const breakdown = priceBreakdown({
    subtotal,
    offer: rule,
    rewardAmount: rewardDoc?.kind === 'AMOUNT_OFF' ? Number(rewardDoc.amount) || 0 : 0,
    pointsRequested: input.pointsToUse,
    pointsBalance: Number(customer?.points) || 0,
    loyalty: loyaltyConfig(input.settings),
    isMember,
  });

  // Discounts and points reduce the taxable amount, so tax is charged on what is actually paid.
  const taxRate = taxRatePercent(input.settings);
  const tax = consumptionTax(breakdown.total, taxRate);
  // The fee is entered tax-included and charged on top of the food; it earns no points.
  const isDelivery = input.fulfillment === 'DELIVERY';
  const deliveryFee = isDelivery ? deliveryFeeFor(input.settings, subtotal) : 0;
  const minOrderShortfall = isDelivery ? Math.max(0, (input.settings.deliveryMinOrder ?? 0) - subtotal) : 0;

  return {
    lines,
    breakdown: { ...breakdown, taxRate, tax, deliveryFee, minOrderShortfall, grandTotal: breakdown.total + tax + deliveryFee },
    offer: offerDoc ? { id: offerDoc._id, titleJa: String(offerDoc.titleJa), discount: breakdown.offerDiscount } : null,
    reward: rewardDoc
      ? { id: rewardDoc._id, titleJa: String(rewardDoc.titleJa), kind: rewardDoc.kind as StampRewardKind, discount: breakdown.rewardDiscount }
      : null,
  };
}

/** Price fields shown to customers; orders placed before member pricing have only `total`. */
export function pricingSummary(order: Record<string, unknown>) {
  const total = Number(order.total) || 0;
  const offer = order.offer as { titleJa?: string; discount?: number } | null | undefined;
  const reward = order.reward as { titleJa?: string; kind?: string; discount?: number } | null | undefined;
  return {
    subtotal: typeof order.subtotal === 'number' ? order.subtotal : total,
    offerTitle: offer?.titleJa ?? null,
    offerDiscount: offer?.discount ?? 0,
    rewardTitle: reward?.titleJa ?? null,
    rewardKind: reward?.kind ?? null,
    rewardDiscount: reward?.discount ?? 0,
    pointsUsed: Number(order.pointsUsed) || 0,
    pointsDiscount: Number(order.pointsDiscount) || 0,
    total,
    // Orders from before tax was recorded show no tax line and their tax-excluded total.
    taxRate: typeof order.taxRate === 'number' ? order.taxRate : null,
    tax: Number(order.tax) || 0,
    grandTotal: typeof order.grandTotal === 'number' ? order.grandTotal : total,
    pointsEarned: Number(order.pointsEarned) || 0,
    // Orders from before delivery existed are pickups.
    fulfillment: order.fulfillment === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
    deliveryFee: Number(order.deliveryFee) || 0,
    deliveryAddress: (order.deliveryAddress as Record<string, string> | null | undefined) ?? null,
  };
}
