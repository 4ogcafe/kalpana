import express from 'express';
import { prisma } from '../lib/prisma.js';
import { MongoClient, ObjectId } from 'mongodb';

const router = express.Router();
const getClient = () => new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/kalpanarestro');

// GET all users (for dashboard)
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } // don't send password
    });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user (e.g. change role or status)
router.put('/:id', async (req, res) => {
  const client = getClient();
  try {
    const { role, isActive } = req.body;
    await client.connect();
    const db = client.db();
    
    await db.collection('User').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role, isActive: !!isActive, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update user natively' });
  } finally {
    await client.close();
  }
});

export default router;
