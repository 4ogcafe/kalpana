import express from 'express';
import { prisma } from '../lib/prisma.js';
import { MongoClient } from 'mongodb';

const router = express.Router();
const getClient = () => new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/kalpanarestro');

router.get('/stats', async (req, res) => {
  const client = getClient();
  try {
    await client.connect();
    const db = client.db();
    
    const [menuItemsCount, categoriesCount, carouselsCount, unreadMessagesCount] = await Promise.all([
      db.collection('MenuItem').countDocuments(),
      db.collection('Category').countDocuments(),
      db.collection('Carousel').countDocuments({ isActive: true }),
      db.collection('ContactMessage').countDocuments({ isRead: false })
    ]);
    
    // Some mock data for the chart, e.g. visits or views
    const chartData = [
      { name: 'Mon', visits: 120 },
      { name: 'Tue', visits: 132 },
      { name: 'Wed', visits: 101 },
      { name: 'Thu', visits: 170 },
      { name: 'Fri', visits: 210 },
      { name: 'Sat', visits: 250 },
      { name: 'Sun', visits: 220 },
    ];

    res.json({
      menuItemsCount,
      categoriesCount,
      carouselsCount,
      unreadMessagesCount,
      chartData
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  } finally {
    await client.close();
  }
});

export default router;
