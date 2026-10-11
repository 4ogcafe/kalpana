import express from 'express';
import { prisma } from '../lib/prisma.js';
import { MongoClient, ObjectId } from 'mongodb';

const router = express.Router();
const getClient = () => new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/kalpanarestro');

router.get('/', async (req, res) => {
  try {
    const filter: any = { orderBy: { sortOrder: 'asc' } };
    if (!req.query.all) {
      filter.where = { placement: 'HOME', isActive: true };
    }
    const slides = await prisma.carouselSlide.findMany(filter);
    res.json(slides);
  } catch (error) {
    console.error('Error fetching carousels:', error);
    res.status(500).json({ error: 'Failed to fetch carousels' });
  }
});

// Update a carousel
router.put('/:id', async (req, res) => {
  const client = getClient();
  try {
    await client.connect();
    const db = client.db();
    const { titleEn, titleJa, imageUrl, isActive } = req.body;
    
    await db.collection('CarouselSlide').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { titleEn, titleJa, imageUrl, isActive, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update carousel' });
  } finally {
    await client.close();
  }
});

// Create a carousel
router.post('/', async (req, res) => {
  const client = getClient();
  try {
    await client.connect();
    const db = client.db();
    const { titleEn, titleJa, imageUrl, placement } = req.body;
    
    const count = await db.collection('CarouselSlide').countDocuments({ placement: placement || 'HOME' });
    
    const newSlide = {
      _id: new ObjectId(),
      titleEn: titleEn || '',
      titleJa: titleJa || '',
      imageUrl: imageUrl || '',
      placement: placement || 'HOME',
      isActive: true,
      sortOrder: count,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.collection('CarouselSlide').insertOne(newSlide);
    res.json(newSlide);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create carousel' });
  } finally {
    await client.close();
  }
});

export default router;
