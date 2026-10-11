import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Hardcoded bypass for local testing without MongoDB Replica Set
    if (email === 'admin@example.com' && password === 'admin123') {
      const token = jwt.sign({ id: 'mock-admin-id', role: 'ADMIN' }, JWT_SECRET, { expiresIn: '1d' });
      return res.json({ 
        token, 
        user: { id: 'mock-admin-id', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' } 
      });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create initial admin user if none exists (for testing purposes)
router.post('/setup', async (req, res) => {
  const count = await prisma.user.count();
  if (count > 0) return res.status(400).json({ error: 'Admin already exists' });
  
  const passwordHash = await bcrypt.hash('admin123', 10);
  const user = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      passwordHash,
      name: 'Admin',
      role: 'ADMIN'
    }
  });
  res.json({ success: true, user: { id: user.id, email: user.email } });
});

export default router;
