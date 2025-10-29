import { Router } from 'express';
import receiptsRouter from './receipts';
import healthRouter from './health';

const router = Router();

// API version 1 routes
router.use('/api/v1/receipts', receiptsRouter);
router.use('/health', healthRouter);

// Root endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'Receipt Analyzer API',
    version: '1.0.0',
    status: 'running',
    documentation: '/api/v1',
    endpoints: {
      analyze: 'POST /api/v1/receipts/analyze',
      status: 'GET /api/v1/receipts/:id/status',
      result: 'GET /api/v1/receipts/:id/result',
      health: 'GET /health'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;