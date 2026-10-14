import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { db } from '../lib/mongo.js';
import { PICKUP_HOURS_PATTERN } from '../lib/pickup.js';
import { MAX_STAMPS_PER_CARD, MIN_STAMPS_PER_CARD, STAMP_REWARD_KINDS } from '../lib/stamps.js';
import { definedOnly, httpsUrl, imageUrl, optionalText } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { publicCache } from '../middleware/cache.js';

const router = express.Router();

const SHORT_TEXT = 300;
const LONG_TEXT = 5000;

const text = (max = SHORT_TEXT) => optionalText(max);
const image = imageUrl.nullable().optional();
const jsonObject = z.record(z.string(), z.unknown()).optional();
const MAX_LEAD_MINUTES = 24 * 60;
const MAX_CLOSED_DATES = 100;
const MAX_YEN = 1_000_000;
const MAX_DELIVERY_AREAS = 100;
const MAX_COOLDOWN_HOURS = 24 * 30;
const MAX_REWARD_DAYS = 3650;

const stampRewardSchema = z.object({
  at: z.number().int().min(1).max(MAX_STAMPS_PER_CARD),
  titleJa: z.string().trim().min(1).max(100),
  kind: z.enum(STAMP_REWARD_KINDS),
  amount: z.number().int().min(0).max(MAX_YEN).nullable().optional(),
});

// The admin UI posts the whole settings document; unknown keys (e.g. _id) are dropped by Zod.
const settingsSchema = z.object({
  name: text(),
  email: z.union([z.literal(''), z.email().max(254)]).nullable().optional(),
  phone: text(50),
  addressEn: text(),
  addressJa: text(),
  weeklyHours: jsonObject,
  holidays: jsonObject,
  socials: jsonObject,
  // Any https link is stored; the site only embeds it when it is a Google Maps embed URL.
  mapUrl: httpsUrl.nullable().optional(),
  googleMapsLink: httpsUrl.nullable().optional(),
  aboutEn: text(LONG_TEXT),
  aboutJa: text(LONG_TEXT),
  aboutStoryJa: text(LONG_TEXT),
  aboutStoryLabelJa: text(),
  aboutStoryTitleJa: text(),
  aboutSpiceLabelJa: text(),
  aboutSpiceTitleJa: text(),
  aboutSpiceDescJa: text(LONG_TEXT),
  aboutSpiceImage: image,
  aboutChefLabelJa: text(),
  aboutChefTitleJa: text(),
  aboutChefDescJa: text(LONG_TEXT),
  aboutChefImage: image,
  welcomeTitleEn: text(),
  welcomeTitleJa: text(),
  welcomeTextJa: text(LONG_TEXT),
  storeSectionLabelJa: text(),
  storeSectionTitleJa: text(),
  storeSectionSubJa: text(LONG_TEXT),
  storeLocationJa: text(),
  storeBadgeJa: text(),
  storeReviewScore: text(10),
  storeReviewText: text(),
  storeReviewLink: httpsUrl.nullable().optional(),
  // Footer (Page Settings → Footer). Contact details come from the fields above.
  footerLogo: image,
  footerBrand: text(60),
  footerTaglineJa: text(500),
  footerCopyright: text(200),
  footerLinks: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(40),
        // A page on this site (/menu/grand) or a full https link.
        url: z.string().trim().max(300).refine((value) => /^\/[^/]/.test(value) || value === '/' || /^https:\/\//.test(value), 'Use a path like /menu/grand or an https:// link'),
      }),
    )
    .max(12)
    .optional(),
  footerShowHours: z.boolean().optional(),
  footerShowSocials: z.boolean().optional(),
  // Google reviews: the restaurant's Google Place ID ('' = not connected) and the lowest star rating to show.
  googlePlaceId: z.string().trim().max(300).regex(/^[A-Za-z0-9_-]*$/, 'Invalid Google Place ID').optional(),
  googleReviewsMinRating: z.number().int().min(1).max(5).optional(),
  // Shown until Google is connected: the total number of Google reviews, and reviews copied from the listing.
  storeReviewCount: z.number().int().min(0).max(1_000_000).nullable().optional(),
  featuredReviews: z
    .array(
      z.object({
        authorName: z.string().trim().min(1).max(60),
        rating: z.number().int().min(1).max(5),
        text: z.string().trim().min(1).max(1000),
        dateLabel: z.string().trim().max(30).optional().default(''),
      }),
    )
    .max(12)
    .optional(),
  aboutHeroImage: image,
  contactHeroImage: image,
  grandMenuHeroImage: image,
  lunchMenuHeroImage: image,
  takeoutMenuHeroImage: image,
  // Pickup ordering. Hours are structured (unlike weeklyHours, which is display text) so slots can be computed.
  pickupEnabled: z.boolean().optional(),
  pickupHours: z
    .string()
    .trim()
    .max(SHORT_TEXT)
    .refine((value) => value === '' || PICKUP_HOURS_PATTERN.test(value), 'Use the format 11:30-14:30, 17:00-21:30')
    .optional(),
  pickupClosedDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  pickupClosedDates: z.array(z.iso.date()).max(MAX_CLOSED_DATES).optional(),
  pickupLeadMinutes: z.number().int().min(0).max(MAX_LEAD_MINUTES).optional(),
  pickupNoteJa: text(1000),
  // Delivery: its own switch, hours and notice; fees are in yen (the fee is tax-included).
  deliveryEnabled: z.boolean().optional(),
  deliveryHours: z
    .string()
    .trim()
    .max(SHORT_TEXT)
    .refine((value) => value === '' || PICKUP_HOURS_PATTERN.test(value), 'Use the format 11:30-14:30, 17:00-21:30')
    .optional(),
  deliveryLeadMinutes: z.number().int().min(0).max(MAX_LEAD_MINUTES).optional(),
  deliveryFee: z.number().int().min(0).max(MAX_YEN).optional(),
  deliveryFreeOver: z.number().int().min(0).max(MAX_YEN).optional(),
  deliveryMinOrder: z.number().int().min(0).max(MAX_YEN).optional(),
  deliveryAreas: z.array(z.string().trim().min(1).max(50)).max(MAX_DELIVERY_AREAS).optional(),
  deliveryNoteJa: text(1000),
  // The website address printed in table QR codes, e.g. https://kalpana.example ('' = use the admin's own address).
  publicSiteUrl: z
    .string()
    .trim()
    .max(200)
    .refine((value) => value === '' || /^https?:\/\/[^\s/?#]+(:\d+)?\/?$/.test(value), 'Use a site address like https://kalpana.example')
    .transform((value) => value.replace(/\/$/, ''))
    .optional(),
  // Dine-in: ordering from the table QR codes.
  diningEnabled: z.boolean().optional(),
  diningSelfOpen: z.boolean().optional(),
  diningTargetMinutes: z.number().int().min(5).max(120).optional(),
  // Member points: earned per ¥100 paid, each point worth pointValueYen at checkout.
  pointsEnabled: z.boolean().optional(),
  pointsPer100Yen: z.number().int().min(0).max(100).optional(),
  pointValueYen: z.number().int().min(1).max(100).optional(),
  signupBonusPoints: z.number().int().min(0).max(100_000).optional(),
  taxRatePercent: z.number().int().min(0).max(25).optional(),
  // Stamp card: one stamp per qualifying purchase, at most one per cooldown, rewards at chosen stamps.
  stampCardEnabled: z.boolean().optional(),
  stampsPerCard: z.number().int().min(MIN_STAMPS_PER_CARD).max(MAX_STAMPS_PER_CARD).optional(),
  stampMinAmount: z.number().int().min(0).max(MAX_YEN).optional(),
  stampCooldownHours: z.number().int().min(0).max(MAX_COOLDOWN_HOURS).optional(),
  stampRewardValidDays: z.number().int().min(0).max(MAX_REWARD_DAYS).optional(),
  stampRewards: z
    .array(stampRewardSchema)
    .max(MAX_STAMPS_PER_CARD)
    .refine((rewards) => new Set(rewards.map((reward) => reward.at)).size === rewards.length, 'Only one reward per stamp')
    .refine((rewards) => rewards.every((reward) => reward.kind !== 'AMOUNT_OFF' || (reward.amount ?? 0) > 0), 'A discount reward needs an amount')
    .optional(),
});

// Used only the first time settings are saved.
const INITIAL_SETTINGS = {
  lat: 36.1473,
  lng: 139.3886,
  timezone: 'Asia/Tokyo',
  currency: 'JPY',
  weeklyHours: { monday: '11:00-15:00, 17:00-22:00' },
  holidays: { regular: 'Tuesday' },
  socials: { instagram: '@kalpana_restro' },
};

router.get('/', publicCache, async (_req, res) => {
  const settings = await db().collection('Settings').findOne({});
  res.json(settings ?? {});
});

router.put('/', requireAdmin, async (req, res) => {
  const fields = definedOnly(settingsSchema.parse(req.body));
  const perCard = fields.stampsPerCard;
  if (perCard !== undefined && fields.stampRewards?.some((reward) => reward.at > perCard)) {
    throw new AppError(400, 'VALIDATION_ERROR', `Rewards must be on stamps 1–${perCard}.`);
  }
  const collection = db().collection('Settings');
  const existing = await collection.findOne({}, { projection: { _id: 1 } });

  // Only fields the client sent are written, so a partial save never wipes other settings.
  if (existing) {
    await collection.updateOne({ _id: existing._id }, { $set: { ...fields, updatedAt: new Date() } });
  } else {
    await collection.insertOne({ _id: new ObjectId(), ...INITIAL_SETTINGS, ...fields, updatedAt: new Date() });
  }

  res.json(await collection.findOne({}));
});

export default router;
