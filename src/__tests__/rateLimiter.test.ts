import request from 'supertest';
import express from 'express';
import { apiRateLimiter, analysisRateLimiter, getRateLimitStatus, resetRateLimit } from '../middleware/rateLimiter';
import { cacheService } from '../services/cacheService';
import { config } from '../config/config';

// Mock dependencies
jest.mock('../services/cacheService');
jest.mock('../utils/logger');

const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('Rate Limiter Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock cache service
    mockCacheService.increment.mockResolvedValue(1);
    mockCacheService.decrement.mockResolvedValue();
    mockCacheService.delete.mockResolvedValue();
    mockCacheService.get.mockResolvedValue('0');
    
    jest.clearAllMocks();
  });

  describe('API Rate Limiter', () => {
    beforeEach(() => {
      app.use('/api', apiRateLimiter);
      app.get('/api/test', (req, res) => {
        res.json({ success: true, clientId: req.clientId });
      });
    });

    it('should allow requests within rate limit', async () => {
      mockCacheService.increment.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });

    it('should block requests exceeding rate limit', async () => {
      mockCacheService.increment.mockResolvedValue(101); // Exceed limit

      const response = await request(app)
        .get('/api/test')
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.body.error.message).toContain('100 requêtes par heure');
    });

    it('should use client ID for authenticated requests', async () => {
      mockCacheService.increment.mockResolvedValue(1);

      // Mock authenticated request
      app.use((req, res, next) => {
        req.clientId = 'test-client-123';
        next();
      });

      await request(app)
        .get('/api/test')
        .expect(200);

      // Verify cache key includes client ID
      expect(mockCacheService.increment).toHaveBeenCalledWith(
        expect.stringContaining('client:test-client-123'),
        expect.any(Number)
      );
    });

    it('should use IP address for unauthenticated requests', async () => {
      mockCacheService.increment.mockResolvedValue(1);

      await request(app)
        .get('/api/test')
        .set('X-Forwarded-For', '192.168.1.100')
        .expect(200);

      // Verify cache key includes IP
      expect(mockCacheService.increment).toHaveBeenCalledWith(
        expect.stringContaining('ip:192.168.1.100'),
        expect.any(Number)
      );
    });

    it('should include rate limit headers in response', async () => {
      mockCacheService.increment.mockResolvedValue(5);

      const response = await request(app)
        .get('/api/test')
        .expect(200);

      expect(response.headers['ratelimit-limit']).toBe(config.rateLimit.maxRequests.toString());
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
    });
  });

  describe('Analysis Rate Limiter', () => {
    beforeEach(() => {
      app.use('/api/analyze', analysisRateLimiter);
      app.post('/api/analyze', (req, res) => {
        res.json({ success: true, requestId: 'test-request-123' });
      });
    });

    it('should have stricter limits for analysis endpoint', async () => {
      mockCacheService.increment.mockResolvedValue(21); // Exceed analysis limit

      const response = await request(app)
        .post('/api/analyze')
        .expect(429);

      expect(response.body.error.code).toBe('ANALYSIS_RATE_LIMIT_EXCEEDED');
      expect(response.body.error.message).toContain('20 analyses par heure');
    });

    it('should allow analysis requests within limit', async () => {
      mockCacheService.increment.mockResolvedValue(10);

      await request(app)
        .post('/api/analyze')
        .expect(200);
    });
  });

  describe('Rate Limit Utilities', () => {
    describe('getRateLimitStatus', () => {
      it('should return current rate limit status', async () => {
        mockCacheService.get.mockResolvedValue('25');

        const mockReq = {
          clientId: 'test-client',
          ip: '127.0.0.1'
        } as any;

        const status = await getRateLimitStatus(mockReq);

        expect(status.limit).toBe(config.rateLimit.maxRequests);
        expect(status.used).toBe(25);
        expect(status.remaining).toBe(config.rateLimit.maxRequests - 25);
        expect(status.resetTime).toBeInstanceOf(Date);
      });

      it('should handle missing cache data', async () => {
        mockCacheService.get.mockResolvedValue(null);

        const mockReq = {
          clientId: 'test-client',
          ip: '127.0.0.1'
        } as any;

        const status = await getRateLimitStatus(mockReq);

        expect(status.used).toBe(0);
        expect(status.remaining).toBe(config.rateLimit.maxRequests);
      });
    });

    describe('resetRateLimit', () => {
      it('should reset rate limit for specific client', async () => {
        await resetRateLimit('test-client');

        expect(mockCacheService.delete).toHaveBeenCalledWith(
          expect.stringContaining('test-client')
        );
      });
    });
  });

  describe('Rate Limit Error Handling', () => {
    beforeEach(() => {
      app.use('/api', apiRateLimiter);
      app.get('/api/test', (req, res) => {
        res.json({ success: true });
      });
    });

    it('should include retry-after header when rate limited', async () => {
      mockCacheService.increment.mockResolvedValue(101);

      const response = await request(app)
        .get('/api/test')
        .expect(429);

      expect(response.headers['retry-after']).toBeDefined();
      expect(parseInt(response.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('should include detailed error information', async () => {
      mockCacheService.increment.mockResolvedValue(101);

      const response = await request(app)
        .get('/api/test')
        .expect(429);

      expect(response.body.error).toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
        message: expect.stringContaining('100 requêtes par heure'),
        limit: config.rateLimit.maxRequests,
        windowMs: config.rateLimit.windowMs,
        resetTime: expect.any(String),
        retryAfter: expect.any(Number)
      });
    });
  });

  describe('Rate Limit Configuration', () => {
    it('should use configuration values', () => {
      expect(config.rateLimit.maxRequests).toBe(100);
      expect(config.rateLimit.windowMs).toBe(3600000); // 1 hour
    });

    it('should handle different rate limit windows', async () => {
      // Test that the rate limiter respects the configured window
      mockCacheService.increment.mockResolvedValue(1);

      await request(app)
        .get('/api/test')
        .expect(200);

      expect(mockCacheService.increment).toHaveBeenCalledWith(
        expect.any(String),
        config.rateLimit.windowMs / 1000 // TTL in seconds
      );
    });
  });

  describe('Concurrent Requests', () => {
    beforeEach(() => {
      app.use('/api', apiRateLimiter);
      app.get('/api/test', (req, res) => {
        res.json({ success: true });
      });
    });

    it('should handle concurrent requests correctly', async () => {
      let requestCount = 0;
      mockCacheService.increment.mockImplementation(async () => {
        return ++requestCount;
      });

      // Send multiple concurrent requests
      const promises = Array(5).fill(null).map(() =>
        request(app).get('/api/test')
      );

      const responses = await Promise.all(promises);

      // All should succeed if within limit
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      expect(mockCacheService.increment).toHaveBeenCalledTimes(5);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      app.use('/api', apiRateLimiter);
      app.get('/api/test', (req, res) => {
        res.json({ success: true });
      });
    });

    it('should handle cache service errors gracefully', async () => {
      mockCacheService.increment.mockRejectedValue(new Error('Cache error'));

      // Should still process request but may not enforce rate limiting
      const response = await request(app)
        .get('/api/test');

      // The behavior depends on how the rate limiter handles cache errors
      // It should either succeed (if it fails open) or return 500
      expect([200, 500]).toContain(response.status);
    });

    it('should handle missing IP address', async () => {
      mockCacheService.increment.mockResolvedValue(1);

      // Request without IP information
      const response = await request(app)
        .get('/api/test')
        .expect(200);

      expect(mockCacheService.increment).toHaveBeenCalledWith(
        expect.stringContaining('unknown'),
        expect.any(Number)
      );
    });
  });
});