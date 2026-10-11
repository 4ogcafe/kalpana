import 'dotenv/config';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { closeMongo } from './lib/mongo.js';
import { prisma } from './lib/prisma.js';

const server = createApp().listen(config.port, () => {
  logger.info(`API server running on http://localhost:${config.port}`);
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void Promise.allSettled([closeMongo(), prisma.$disconnect()]).then(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
