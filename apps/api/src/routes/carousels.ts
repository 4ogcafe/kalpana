import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { db } from '../lib/mongo.js';
import { prisma } from '../lib/prisma.js';
import { definedOnly, idParam, imageUrl, optionalText } from '../lib/schemas.js';
import { requireAdmin } from '../middleware/auth.js';
import { publicCache } from '../middleware/cache.js';

const router = express.Router();

const placement = z.enum(['HOME', 'CONTACT']);

const slideUpdateSchema = z.object({
  titleEn: optionalText(200),
  titleJa: optionalText(200),
  altEn: optionalText(300),
  imageUrl: imageUrl.optional(),
  isActive: z.boolean().optional(),
});

const slideCreateSchema = z.object({
  titleEn: optionalText(200),
  titleJa: optionalText(200),
  altEn: optionalText(300),
  imageUrl: imageUrl.refine((value) => value !== '', 'An image is required'),
  placement: placement.default('HOME'),
});

router.get('/', publicCache, async (req, res) => {
  // ?all=true is the admin list (every placement, inactive included); everything here is public content.
  const showAll = req.query.all === 'true';
  const slides = await prisma.carouselSlide.findMany({
    orderBy: { sortOrder: 'asc' },
    where: showAll ? undefined : { placement: placement.catch('HOME').parse(req.query.placement), isActive: true },
  });
  if (showAll) res.setHeader('Cache-Control', 'no-store');
  res.json(slides);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const fields = definedOnly(slideUpdateSchema.parse(req.body));
  // altEn is required by the schema; never let an update null it out.
  if (fields.altEn === null) fields.altEn = '';
  const result = await db()
    .collection('CarouselSlide')
    .updateOne({ _id: id }, { $set: { ...fields, updatedAt: new Date() } });
  if (result.matchedCount === 0) throw notFound('Slide');
  res.json({ success: true });
});

router.post('/', requireAdmin, async (req, res) => {
  const { titleEn, titleJa, altEn, imageUrl: image, placement: slidePlacement } = slideCreateSchema.parse(req.body);
  const slides = db().collection('CarouselSlide');
  const count = await slides.countDocuments({ placement: slidePlacement });
  const now = new Date();

  const slide = {
    _id: new ObjectId(),
    titleEn: titleEn ?? '',
    titleJa: titleJa ?? '',
    // Required by the Prisma model: a slide without it makes every carousel read fail.
    altEn: altEn || titleEn || titleJa || '',
    imageUrl: image,
    placement: slidePlacement,
    isActive: true,
    sortOrder: count,
    createdAt: now,
    updatedAt: now,
  };
  await slides.insertOne(slide);
  res.status(201).json({ ...slide, id: slide._id.toHexString() });
});

export default router;
