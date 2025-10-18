import dotenv from 'dotenv';

// Load .env file
const result = dotenv.config();
if (result.error) {
  console.error('Error loading .env file:', result.error);
} else {
  console.log('.env file loaded successfully');
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { WebSocketServer } from './websocket/server.js';
import { apiRoutes } from './api/routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { initializeServices } from './services/index.js';

// Debug: Check if environment variables are loaded
logger.info('Environment check:', {
  PG_DSN: process.env.PG_DSN ? 'Set (length: ' + process.env.PG_DSN.length + ')' : 'NOT SET',
  SUPABASE_URL: process.env.SUPABASE_URL ? 'Set' : 'NOT SET',
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY ? 'Set' : 'NOT SET',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Set' : 'NOT SET'
});

const app = Fastify({
  logger: logger,
  bodyLimit: 50 * 1024 * 1024 // 50MB for audio uploads
});

async function start() {
  try {
    await initializeServices();

    await app.register(cors, {
      origin: (origin, cb) => {
        const allowedOrigins = [
          'chrome-extension://*',
          'http://localhost:5173',
          'http://localhost:5174',
          process.env.ADMIN_URL
        ].filter(Boolean);

        if (!origin || allowedOrigins.some(allowed => 
          origin.startsWith(allowed.replace('*', ''))
        )) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    });

    // await app.register(websocket);

    app.setErrorHandler(errorHandler);

    await app.register(apiRoutes, { prefix: '/api' });

    // const wsServer = new WebSocketServer(app);
    // await wsServer.initialize();

    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });

    logger.info(`Server running on ${host}:${port}`);
  } catch (error: any) {
    logger.error('Failed to start server:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await app.close();
  process.exit(0);
});

start();