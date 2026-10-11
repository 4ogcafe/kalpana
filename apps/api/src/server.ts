import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import settingsRoutes from './routes/settings.js';
import carouselsRoutes from './routes/carousels.js';
import contactRoutes from './routes/contact.js';
import usersRoutes from './routes/users.js';
import uploadRoutes from './routes/upload.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
// Need to adjust helmet to allow cross-origin images if the frontend is on a different port
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json());

// Serve static files from public folder
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/menu', menuRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/carousels', carouselsRoutes);
app.use('/api/v1/contact', contactRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
