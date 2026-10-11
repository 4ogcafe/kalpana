import express from 'express';
import { prisma } from '../lib/prisma.js';
import { MongoClient, ObjectId } from 'mongodb';

const router = express.Router();

const getClient = () => new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/kalpanarestro');

// GET all categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' }
    });
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST a new category
router.post('/categories', async (req, res) => {
  const client = getClient();
  try {
    const { nameEn, parentId } = req.body;
    await client.connect();
    const db = client.db();
    
    const newCat: any = {
      _id: new ObjectId(),
      nameEn,
      nameJa: nameEn,
      sortOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (parentId) {
      newCat.parentId = new ObjectId(parentId);
    }
    
    await db.collection('Category').insertOne(newCat);
    res.json(newCat);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create category natively' });
  } finally {
    await client.close();
  }
});

// Update a category
router.put('/categories/:id', async (req, res) => {
  const client = getClient();
  try {
    const { nameEn, nameJa, sortOrder, parentId } = req.body;
    await client.connect();
    const db = client.db();
    const updateData: any = { nameEn, nameJa, sortOrder: parseInt(sortOrder) || 0, updatedAt: new Date() };
    if (parentId !== undefined) {
      updateData.parentId = parentId ? new ObjectId(parentId) : null;
    }
    await db.collection('Category').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update category natively' });
  } finally {
    await client.close();
  }
});

// GET all items
router.get('/items', async (req, res) => {
  try {
    const items = await prisma.menuItem.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// POST a new item
router.post('/items', async (req, res) => {
  const client = getClient();
  try {
    const { nameEn, price, categoryName, descriptionEn, imageUrl, isRecommended, rating, isVegetarian, isVegan, isGlutenFree } = req.body;
    await client.connect();
    const db = client.db();
    
    let category = await db.collection('Category').findOne({ nameEn: categoryName });
    if (!category) {
      category = { _id: new ObjectId(), nameEn: categoryName, createdAt: new Date(), updatedAt: new Date(), sortOrder: 0 };
      await db.collection('Category').insertOne(category);
    }

    const newItem = {
      _id: new ObjectId(),
      nameEn,
      price: parseInt(price) || 0,
      descriptionEn: descriptionEn || '',
      categoryId: category._id,
      imageUrl: imageUrl || '',
      rating: parseFloat(rating) || 5.0,
      isRecommended: !!isRecommended,
      isVegetarian: !!isVegetarian,
      isVegan: !!isVegan,
      isGlutenFree: !!isGlutenFree,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await db.collection('MenuItem').insertOne(newItem);
    res.json(newItem);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create item natively' });
  } finally {
    await client.close();
  }
});

// Delete a category
router.delete('/categories/:id', async (req, res) => {
  const client = getClient();
  try {
    await client.connect();
    const db = client.db();
    
    // Cascade delete all items in this category
    await db.collection('MenuItem').deleteMany({ categoryId: new ObjectId(req.params.id) });
    
    // Also cascade delete any subcategories (optional, but good practice)
    await db.collection('Category').deleteMany({ parentId: new ObjectId(req.params.id) });
    
    await db.collection('Category').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete category' });
  } finally {
    await client.close();
  }
});

// Update an item
router.put('/items/:id', async (req, res) => {
  const client = getClient();
  try {
    const { nameEn, price, descriptionEn, isRecommended, imageUrl, rating, isVegetarian, isVegan, isGlutenFree } = req.body;
    await client.connect();
    const db = client.db();
    
    await db.collection('MenuItem').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { 
        nameEn, 
        price: parseInt(price) || 0, 
        descriptionEn, 
        imageUrl: imageUrl || '',
        rating: parseFloat(rating) || 5.0,
        isRecommended: !!isRecommended,
        isVegetarian: !!isVegetarian,
        isVegan: !!isVegan,
        isGlutenFree: !!isGlutenFree,
        updatedAt: new Date() 
      } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update item natively' });
  } finally {
    await client.close();
  }
});

// Delete an item
router.delete('/items/:id', async (req, res) => {
  const client = getClient();
  try {
    await client.connect();
    const db = client.db();
    await db.collection('MenuItem').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete item' });
  } finally {
    await client.close();
  }
});

export default router;
