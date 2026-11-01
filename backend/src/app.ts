import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';
import apiRouter from './routes';
import { errorHandler } from './middlewares/error.middleware';

dotenv.config();

const app = express();

app.disable('x-powered-by');

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header means a non-browser client, which CORS doesn't apply to.
      callback(null, !origin || allowedOrigins.includes(origin));
    },
  })
);

app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { status: 'error', statusCode: 429, message: 'Too many requests. Please slow down.' },
  })
);

app.use(express.json({ limit: '100kb' }));

// Mount all API routes under /api
app.use('/api', apiRouter);

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    statusCode: 404,
    message: `Cannot ${req.method} ${req.originalUrl} - Route not found`,
  });
});

// Centralized error handling middleware
app.use(errorHandler);

export default app;
