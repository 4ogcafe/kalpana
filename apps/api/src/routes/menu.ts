import express from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { notFound, AppError } from '../lib/errors.js';
import { db, toObjectId } from '../lib/mongo.js';
import { prisma } from '../lib/prisma.js';
import { definedOnly, idParam, imageUrl, objectIdString, optionalNumber, optionalText } from '../lib/schemas.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import { publicCache } from '../middleware/cache.js';

const router = express.Router();

const MAX_PRICE = 10_000_000;

const categoryCreateSchema = z.object({
  nameEn: z.string().trim().min(1).max(100),
  nameJa: optionalText(100),
  parentId: objectIdString.nullable().optional(),
});

const categoryUpdateSchema = z.object({
  nameEn: z.string().trim().min(1).max(100).optional(),
  nameJa: optionalText(100),
  sortOrder: optionalNumber(z.number().int().min(0).max(10_000)),
  parentId: z.preprocess((value) => (value === '' ? null : value), objectIdString.nullable().optional()),
  // Table QR menu: true = show, false = hide, null = automatic (follow the parent / hide takeout-only).
  dineIn: z.boolean().nullable().optional(),
});

const itemFields = {
  nameEn: z.string().trim().min(1).max(200),
  nameJa: optionalText(200),
  descriptionEn: optionalText(2000),
  descriptionJa: optionalText(2000),
  price: z.coerce.number().int().min(0).max(MAX_PRICE),
  imageUrl: imageUrl.optional(),
  rating: optionalNumber(z.number().min(0).max(5)),
  isRecommended: z.boolean().optional(),
  isVegetarian: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  isGlutenFree: z.boolean().optional(),
  isSoldOut: z.boolean().optional(),
};

const itemCreateSchema = z.object({
  ...itemFields,
  categoryName: z.string().trim().min(1).max(100),
});

const itemUpdateSchema = z.object({
  ...itemFields,
  nameEn: itemFields.nameEn.optional(),
  price: itemFields.price.optional(),
  optionGroupIds: z.array(objectIdString).optional(),
});

// ---- Categories ----------------------------------------------------------

router.get('/categories', publicCache, async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json(categories);
});

router.post('/categories', requireAdmin, async (req, res) => {
  const { nameEn, nameJa, parentId } = categoryCreateSchema.parse(req.body);
  const now = new Date();
  const category = {
    _id: new ObjectId(),
    nameEn,
    nameJa: nameJa ?? nameEn,
    sortOrder: 0,
    ...(parentId ? { parentId: toObjectId(parentId, 'parentId') } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await db().collection('Category').insertOne(category);
  res.status(201).json({ ...category, id: category._id.toHexString() });
});

router.put('/categories/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const { parentId, ...fields } = categoryUpdateSchema.parse(req.body);
  if (parentId && parentId === id.toHexString()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A category cannot be its own parent');
  }

  const update: Record<string, unknown> = { ...definedOnly(fields), updatedAt: new Date() };
  if (parentId !== undefined) update.parentId = parentId ? toObjectId(parentId, 'parentId') : null;

  const result = await db().collection('Category').updateOne({ _id: id }, { $set: update });
  if (result.matchedCount === 0) throw notFound('Category');
  res.json({ success: true });
});

/** The category plus every descendant, so deletes never leave orphaned subcategories or items. */
async function categoryTree(rootId: ObjectId): Promise<ObjectId[]> {
  const ids = [rootId];
  for (let frontier = [rootId]; frontier.length > 0; ) {
    const children = await db()
      .collection('Category')
      .find({ parentId: { $in: frontier } }, { projection: { _id: 1 } })
      .toArray();
    frontier = children.map((child) => child._id).filter((childId) => !ids.some((known) => known.equals(childId)));
    ids.push(...frontier);
  }
  return ids;
}

router.delete('/categories/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const exists = await db().collection('Category').countDocuments({ _id: id }, { limit: 1 });
  if (!exists) throw notFound('Category');

  const ids = await categoryTree(id);
  // Items first: an item pointing at a deleted category breaks every menu read.
  await db().collection('MenuItem').deleteMany({ categoryId: { $in: ids } });
  await db().collection('Category').deleteMany({ _id: { $in: ids } });
  res.json({ success: true });
});

// ---- Items ---------------------------------------------------------------

router.get('/items', publicCache, async (_req, res) => {
  const items = await prisma.menuItem.findMany({
    include: { category: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(items);
});

router.post('/items', requireStaff, async (req, res) => {
  const { categoryName, ...fields } = itemCreateSchema.parse(req.body);
  const categories = db().collection('Category');

  let category = await categories.findOne({ nameEn: categoryName });
  if (!category) {
    const now = new Date();
    category = { _id: new ObjectId(), nameEn: categoryName, nameJa: categoryName, sortOrder: 0, createdAt: now, updatedAt: now };
    await categories.insertOne(category);
  }

  const now = new Date();
  // Every field Prisma's MenuItem model requires gets a value, so reads never fail on this document.
  const item = {
    _id: new ObjectId(),
    categoryId: category._id,
    menuTypes: [],
    nameEn: fields.nameEn,
    nameJa: fields.nameJa ?? null,
    descriptionEn: fields.descriptionEn ?? '',
    descriptionJa: fields.descriptionJa ?? null,
    price: fields.price,
    imageUrl: fields.imageUrl ?? '',
    rating: fields.rating ?? null,
    spiceLevel: 0,
    allergens: [],
    isRecommended: fields.isRecommended ?? false,
    isVegetarian: fields.isVegetarian ?? false,
    isVegan: fields.isVegan ?? false,
    isHalal: false,
    isGlutenFree: fields.isGlutenFree ?? false,
    isSoldOut: false,
    isActive: true,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db().collection('MenuItem').insertOne(item);
  res.status(201).json({ ...item, id: item._id.toHexString() });
});

router.put('/items/:id', requireStaff, async (req, res) => {
  const id = idParam(req.params);
  const { optionGroupIds, ...rest } = definedOnly(itemUpdateSchema.parse(req.body));
  const update: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (optionGroupIds !== undefined) {
    update.optionGroupIds = optionGroupIds.map((gid: string) => new ObjectId(gid));
  }
  const result = await db()
    .collection('MenuItem')
    .updateOne({ _id: id }, { $set: update });
  if (result.matchedCount === 0) throw notFound('Menu item');
  res.json({ success: true });
});

router.delete('/items/:id', requireAdmin, async (req, res) => {
  const result = await db().collection('MenuItem').deleteOne({ _id: idParam(req.params) });
  if (result.deletedCount === 0) throw notFound('Menu item');
  res.json({ success: true });
});

// ---- Option Groups ---------------------------------------------------------

const optionChoiceSchema = z.object({
  id: z.string().trim().min(1).max(50),
  nameJa: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  priceAdjust: z.coerce.number().int().min(-100000).max(100000).default(0),
});

const optionGroupSchema = z.object({
  nameJa: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().min(1).max(100),
  type: z.enum(['RADIO', 'CHECKBOX']).default('RADIO'),
  required: z.boolean().default(true),
  options: z.array(optionChoiceSchema).min(1).max(30),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

const optionGroups = () => db().collection('OptionGroup');

router.get('/option-groups', publicCache, async (_req, res) => {
  const groups = await optionGroups().find({}).sort({ sortOrder: 1, createdAt: 1 }).toArray();
  res.json(groups.map(g => ({ id: g._id.toHexString(), nameJa: g.nameJa, nameEn: g.nameEn, type: g.type, required: g.required, options: g.options, sortOrder: g.sortOrder })));
});

router.post('/option-groups', requireAdmin, async (req, res) => {
  const data = optionGroupSchema.parse(req.body);
  const now = new Date();
  const result = await optionGroups().insertOne({ ...data, createdAt: now, updatedAt: now });
  res.status(201).json({ id: result.insertedId.toHexString(), ...data });
});

router.put('/option-groups/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const group = await optionGroups().findOne({ _id: id });
  if (!group) throw notFound('OptionGroup');
  const data = optionGroupSchema.partial().parse(req.body);
  await optionGroups().updateOne({ _id: group._id }, { $set: { ...data, updatedAt: new Date() } });
  res.json({ id: group._id.toHexString(), ...group, ...data, _id: undefined });
});

router.delete('/option-groups/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const group = await optionGroups().findOne({ _id: id });
  if (!group) throw notFound('OptionGroup');
  await optionGroups().deleteOne({ _id: group._id });
  res.status(204).end();
});

export default router;
