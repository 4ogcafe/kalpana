import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { db } from '../lib/mongo.js';
import { definedOnly, httpsUrl, imageUrl, optionalText } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { publicCache } from '../middleware/cache.js';

const router = express.Router();

const SHORT_TEXT = 300;
const LONG_TEXT = 5000;

const text = (max = SHORT_TEXT) => optionalText(max);
const image = imageUrl.nullable().optional();
const jsonObject = z.record(z.string(), z.unknown()).optional();

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
  aboutHeroImage: image,
  contactHeroImage: image,
  grandMenuHeroImage: image,
  lunchMenuHeroImage: image,
  takeoutMenuHeroImage: image,
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
