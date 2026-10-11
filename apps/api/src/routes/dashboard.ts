import express from 'express';
import { db } from '../lib/mongo.js';
import { requireStaff } from '../middleware/auth.js';

const router = express.Router();

router.get('/stats', requireStaff, async (_req, res) => {
  const [menuItemsCount, soldOutItemsCount, categoriesCount, carouselsCount, unreadMessagesCount] = await Promise.all([
    db().collection('MenuItem').countDocuments(),
    db().collection('MenuItem').countDocuments({ isSoldOut: true }),
    db().collection('Category').countDocuments(),
    db().collection('CarouselSlide').countDocuments({ isActive: true }),
    db().collection('ContactMessage').countDocuments({ isRead: false }),
  ]);

  res.setHeader('Cache-Control', 'no-store');
  res.json({ menuItemsCount, soldOutItemsCount, categoriesCount, carouselsCount, unreadMessagesCount });
});

export default router;
