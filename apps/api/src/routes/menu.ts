import express from 'express';
import { z } from 'zod';
import { notFound, AppError } from '../lib/errors.js';
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
});

const itemFields = {
  nameEn: z.string().trim().min(1).max(200),
  nameJa: optionalText(200),
  descriptionEn: optionalText(2000),
  descriptionJa: optionalText(2000),
  price: z.coerce.number().int().min(0).max(MAX_PRICE),
  imageUrl: imageUrl.optional(),
  rating: optionalNumber(z.number().min(0).max(5)),
  spiceLevel: z.coerce.number().int().min(0).max(5).optional(),
  isRecommended: z.boolean().optional(),
  isVegetarian: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  isHalal: z.boolean().optional(),
  isGlutenFree: z.boolean().optional(),
  isSoldOut: z.boolean().optional(),
  isOrderable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
  menuTypes: z.array(z.enum(['LUNCH', 'TAKEOUT', 'GRAND'])).optional(),
  allergens: z.array(z.string().trim().max(50)).optional(),
};

const itemCreateSchema = z.object({
  ...itemFields,
  categoryId: objectIdString.optional(),
  categoryName: z.string().trim().min(1).max(100).optional(),
}).refine(d => d.categoryId || d.categoryName, { message: 'categoryId or categoryName is required' });

const itemUpdateSchema = z.object({
  ...itemFields,
  nameEn: itemFields.nameEn.optional(),
  price: itemFields.price.optional(),
  categoryId: objectIdString.optional(),
  optionGroupIds: z.array(objectIdString).optional(),
});

// ---- Categories ----------------------------------------------------------

router.get('/categories', publicCache, async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json(categories);
});

router.post('/categories', requireAdmin, async (req, res) => {
  const { nameEn, nameJa, parentId } = categoryCreateSchema.parse(req.body);
  const category = await prisma.category.create({
    data: {
      nameEn,
      nameJa: nameJa ?? nameEn,
      sortOrder: 0,
      parentId: parentId ?? null,
    },
  });
  res.status(201).json(category);
});

router.put('/categories/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const { parentId, ...fields } = categoryUpdateSchema.parse(req.body);
  if (parentId && parentId === id) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A category cannot be its own parent');
  }

  const data: Record<string, unknown> = { ...definedOnly(fields) };
  if (parentId !== undefined) data.parentId = parentId ?? null;

  try {
    await prisma.category.update({ where: { id }, data });
  } catch {
    throw notFound('Category');
  }
  res.json({ success: true });
});

/** The category plus every descendant so deletes never leave orphaned children. */
async function categoryTree(rootId: string): Promise<string[]> {
  const ids = [rootId];
  for (let frontier = [rootId]; frontier.length > 0; ) {
    const children = await prisma.category.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id).filter((cid) => !ids.includes(cid));
    ids.push(...frontier);
  }
  return ids;
}

router.delete('/categories/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const exists = await prisma.category.count({ where: { id } });
  if (!exists) throw notFound('Category');

  const ids = await categoryTree(id);
  // Delete items first so the FK from MenuItem to Category isn't violated.
  await prisma.menuItem.deleteMany({ where: { categoryId: { in: ids } } });
  await prisma.category.deleteMany({ where: { id: { in: ids } } });
  res.json({ success: true });
});

// ---- Items ---------------------------------------------------------------

router.get('/items', publicCache, async (_req, res) => {
  const items = await prisma.menuItem.findMany({
    include: {
      category: true,
      variants: { orderBy: { sortOrder: 'asc' } },
      optionGroups: { select: { id: true, nameJa: true, nameEn: true, type: true } },
    },
    orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  res.json(items);
});

router.post('/items', requireStaff, async (req, res) => {
  const { categoryId, categoryName, optionGroupIds, ...fields } = itemCreateSchema.parse(req.body) as any;

  let catId = categoryId as string | undefined;
  if (!catId) {
    let category = await prisma.category.findFirst({ where: { nameEn: categoryName } });
    if (!category) {
      category = await prisma.category.create({
        data: { nameEn: categoryName, nameJa: categoryName, sortOrder: 0 },
      });
    }
    catId = category.id;
  }

  const item = await prisma.menuItem.create({
    data: {
      categoryId: catId,
      menuTypes: fields.menuTypes ?? [],
      nameEn: fields.nameEn,
      nameJa: fields.nameJa ?? null,
      descriptionEn: fields.descriptionEn ?? '',
      descriptionJa: fields.descriptionJa ?? null,
      price: fields.price,
      imageUrl: fields.imageUrl ?? '',
      rating: fields.rating ?? null,
      spiceLevel: fields.spiceLevel ?? 0,
      allergens: fields.allergens ?? [],
      isRecommended: fields.isRecommended ?? false,
      isVegetarian: fields.isVegetarian ?? false,
      isVegan: fields.isVegan ?? false,
      isHalal: fields.isHalal ?? false,
      isGlutenFree: fields.isGlutenFree ?? false,
      isSoldOut: fields.isSoldOut ?? false,
      isOrderable: fields.isOrderable ?? true,
      isActive: fields.isActive ?? true,
      sortOrder: fields.sortOrder ?? 0,
      ...(optionGroupIds?.length ? { optionGroups: { connect: (optionGroupIds as string[]).map((id: string) => ({ id })) } } : {}),
    },
  });
  res.status(201).json(item);
});

router.put('/items/:id', requireStaff, async (req, res) => {
  const id = idParam(req.params);
  const { optionGroupIds, categoryId, menuTypes, allergens, ...rest } = definedOnly(itemUpdateSchema.parse(req.body));

  const data: Record<string, unknown> = { ...rest };
  if (categoryId !== undefined) data.categoryId = categoryId;
  if (menuTypes !== undefined) data.menuTypes = menuTypes;
  if (allergens !== undefined) data.allergens = allergens;

  const connectDisconnect = optionGroupIds !== undefined
    ? { optionGroups: { set: optionGroupIds.map((gid: string) => ({ id: gid })) } }
    : {};

  try {
    await prisma.menuItem.update({ where: { id }, data: { ...data, ...connectDisconnect } as any });
  } catch {
    throw notFound('Menu item');
  }
  res.json({ success: true });
});

router.delete('/items/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  try {
    await prisma.menuItem.delete({ where: { id } });
  } catch {
    throw notFound('Menu item');
  }
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

router.get('/option-groups', publicCache, async (_req, res) => {
  const groups = await prisma.optionGroup.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  res.json(groups.map((g) => ({
    id: g.id,
    nameJa: g.nameJa,
    nameEn: g.nameEn,
    type: g.type,
    required: g.required,
    options: g.options,
    sortOrder: g.sortOrder,
  })));
});

router.post('/option-groups', requireAdmin, async (req, res) => {
  const data = optionGroupSchema.parse(req.body);
  const group = await prisma.optionGroup.create({ data: { ...data, options: data.options as unknown as Parameters<typeof prisma.optionGroup.create>[0]['data']['options'] } });
  res.status(201).json({ id: group.id, ...data });
});

router.put('/option-groups/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  const group = await prisma.optionGroup.findUnique({ where: { id } });
  if (!group) throw notFound('OptionGroup');
  const data = optionGroupSchema.partial().parse(req.body);
  const updated = await prisma.optionGroup.update({
    where: { id },
    data: data.options !== undefined
      ? { ...data, options: data.options as unknown as Parameters<typeof prisma.optionGroup.update>[0]['data']['options'] }
      : data,
  });
  res.json({ id: updated.id, nameJa: updated.nameJa, nameEn: updated.nameEn, type: updated.type, required: updated.required, options: updated.options, sortOrder: updated.sortOrder });
});

router.delete('/option-groups/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params);
  try {
    await prisma.optionGroup.delete({ where: { id } });
  } catch {
    throw notFound('OptionGroup');
  }
  res.status(204).end();
});

export default router;
