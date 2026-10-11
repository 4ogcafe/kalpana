import express from 'express';
import { prisma } from '../lib/prisma.js';
import { MongoClient, ObjectId } from 'mongodb';

const router = express.Router();
const getClient = () => new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/kalpanarestro');

// GET all messages (for dashboard)
router.get('/', async (req, res) => {
  try {
    const messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST a new message (from contact page)
router.post('/', async (req, res) => {
  const client = getClient();
  try {
    const { name, email, phone, message, type, date, guests } = req.body;
    await client.connect();
    const db = client.db();
    
    const newMsg = {
      _id: new ObjectId(),
      name: name || 'Anonymous',
      email: email || '',
      phone: phone || '',
      type: type || 'GENERAL',
      message: message || '',
      date: date ? new Date(date) : null,
      guests: guests ? parseInt(guests, 10) : null,
      isRead: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await db.collection('ContactMessage').insertOne(newMsg);
    res.json(newMsg);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send message natively' });
  } finally {
    await client.close();
  }
});

// Update a message (e.g. mark as read)
router.put('/:id', async (req, res) => {
  const client = getClient();
  try {
    const { isRead } = req.body;
    await client.connect();
    const db = client.db();
    
    await db.collection('ContactMessage').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { isRead: !!isRead, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update message natively' });
  } finally {
    await client.close();
  }
});

export default router;
