import { Router } from 'express';
import receiptsRouter from './receipts';
import healthRouter from './health';
import { getRateLimitStatus } from '../middleware/simpleRateLimiter';

const router = Router();

// API version 1 routes
router.use('/api/v1/receipts', receiptsRouter);
router.use('/health', healthRouter);

// Test endpoint without middleware
router.post('/test', (req, res) => {
  res.json({
    message: 'Test endpoint working',
    timestamp: new Date().toISOString(),
    body: req.body,
    headers: req.headers
  });
});

// Test analyze endpoint with minimal middleware (not under receipts path)
router.post('/api/v1/test-analyze', (req, res) => {
  res.json({
    message: 'Analyze endpoint test working',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    hasApiKey: !!req.headers['x-api-key']
  });
});

// Test endpoint outside /api path to bypass rate limiter
router.post('/test-no-rate-limit', (req, res) => {
  res.json({
    message: 'Test endpoint without rate limiter',
    timestamp: new Date().toISOString(),
    headers: req.headers,
    hasApiKey: !!req.headers['x-api-key']
  });
});

// Rate limit status endpoint (outside /api to avoid rate limiting itself)
router.get('/rate-limit/status', async (req, res) => {
  try {
    const status = await getRateLimitStatus(req);
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get rate limit status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Simple test endpoint under /api to test rate limiting
router.get('/api/v1/test', (req, res) => {
  res.json({
    success: true,
    message: 'Test endpoint for rate limiting',
    timestamp: new Date().toISOString(),
    clientId: (req as any).clientId || 'anonymous',
    ip: req.ip
  });
});

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
      health: 'GET /health',
      test: 'POST /test'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;