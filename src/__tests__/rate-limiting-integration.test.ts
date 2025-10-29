import request from 'supertest';
import app from '../index';
import { cacheService } from '../services/cacheService';
import { resetRateLimit } from '../middleware/rateLimiter';

// Mock all services to avoid actual connections
jest.mock('../services/cacheService');
jest.mock('../services/databaseService');
jest.mock('../services/queueService');
jest.mock('../services/workerService');
jest.mock('../services/uploadService');
jest.mock('../utils/logger');

const mockCacheService = cacheService as jest.Mocked<typeof cacheService>;

describe('Rate Limiting Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock cache service methods
    mockCacheService.initialize.mockResolvedValue();
    mockCacheService.close.mockResolvedValue();
    mockCacheService.get.mockResolvedValue('0');
    mockCacheService.increment.mockResolvedValue(1);
    mockCacheService.decrement.mockResolvedValue();
    mockCacheService.delete.mockResolvedValue();
  });

  describe('API Rate Limiting', () => {
    it('should enforce rate limits on API endpoints', async () => {
      // Mock exceeding rate limit
      mockCacheService.increment.mockResolvedValue(101);

      const response = await request(app)
        .get('/health')
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers['retry-after']).toBeDefined();
    });

    it('should allow requests within rate limit', async () => {
      mockCacheService.increment.mockResolvedValue(50);

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBeDefined();
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });

    it('should track rate limits per client ID when authenticated', async () => {
      mockCacheService.increment.mockResolvedValue(1);

      await request(app)
        .post('/api/v1/receipts/analyze')
        .set('X-API-Key', 'dev-api-key-12345')
        .attach('image', Buffer.from('fake-image-data'), 'receipt.jpg')
        .expect(400); // Will fail validation but should pass rate limiting

      // Verify cache key includes client ID
      expect(mockCacheService.increment).toHaveBeenCalledWith(
        expect.stringContaining('client:dev-client'),
        expect.any(Number)
      );
    });

    it('should track rate limits per IP when not authenticated', async () => {
      mockCacheService.increment.mockResolvedValue(1);

      await request(app)
        .get('/health')
        .set('X-Forwarded-For', '192.168.1.100')
        .expect(200);

      expect(mockCacheService.increment).toHaveBeenCalledWith(
        expect.stringContaining('ip:192.168.1.100'),
        expect.any(Number)
      );
    });
  });

  describe('Analysis Endpoint Rate Limiting', () => {
    it('should have stricter limits for analysis endpoint', async () => {
      // Mock exceeding analysis rate limit (21 > 20)
      mockCacheService.increment.mockResolvedValue(21);

      const response = await request(app)
        .post('/api/v1/receipts/analyze')
        .set('X-API-Key', 'dev-api-key-12345')
        .expect(429);

      expect(response.body.error.code).toBe('ANALYSIS_RATE_LIMIT_EXCEEDED');
      expect(response.body.error.message).toContain('20 analyses par heure');
    });

    it('should allow analysis requests within limit', async () => {
      mockCacheService.increment.mockResolvedValue(10);

      // This will fail due to missing file, but should pass rate limiting
      await request(app)
        .post('/api/v1/receipts/analyze')
        .set('X-API-Key', 'dev-api-key-12345')
        .expect(400); // Bad request due to missing file
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include rate limit information in headers', async () => {
      mockCacheService.increment.mockResolvedValue(25);

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['ratelimit-limit']).toBe('100');
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
    });

    it('should include retry-after header when rate limited', async () => {
      mockCacheService.increment.mockResolvedValue(101);

      const response = await request(app)
        .get('/health')
        .expect(429);

      expect(response.headers['retry-after']).toBeDefined();
      const retryAfter = parseInt(response.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(3600); // Max 1 hour
    });
  });

  describe('Rate Limit Error Responses', () => {
    it('should return proper error format when rate limited', async () => {
      mockCacheService.increment.mockResolvedValue(101);

      const response = await request(app)
        .get('/health')
        .expect(429);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: expect.stringContaining('100 requêtes par heure'),
          limit: 100,
          windowMs: 3600000,
          resetTime: expect.any(String),
          retryAfter: expect.any(Number)
        },
        timestamp: expect.any(String)
      });
    });

    it('should include client information in rate limit errors', async () => {
      mockCacheService.increment.mockResolvedValue(101);

      const response = await request(app)
        .get('/health')
        .set('X-API-Key', 'dev-api-key-12345')
        .expect(429);

      expect(response.body.error.clientId).toBe('dev-client');
    });
  });

  describe('Input Sanitization Integration', () => {
    it('should sanitize inputs before processing', async () => {
      mockCacheService.increment.mockResolvedValue(1);

      // This request will be sanitized but still fail validation
      const response = await request(app)
        .post('/api/v1/receipts/analyze')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({
          metadata: {
            source: '<script>alert("xss")</script>mobile-app'
          }
        })
        .expect(400);

      // Should fail validation but not due to XSS (input was sanitized)
      expect(response.body.message).not.toContain('<script>');
    });
  });

  describe('Security Headers Integration', () => {
    it('should include security headers in all responses', async () => {
      mockCacheService.increment.mockResolvedValue(1);

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });
  });

  describe('Rate Limit Reset Functionality', () => {
    it('should allow admin to reset rate limits', async () => {
      // This would typically be called by an admin endpoint
      await resetRateLimit('test-client');

      expect(mockCacheService.delete).toHaveBeenCalledWith(
        expect.stringContaining('test-client')
      );
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests correctly', async () => {
      let requestCount = 0;
      mockCacheService.increment.mockImplementation(async () => {
        return ++requestCount;
      });

      // Send 5 concurrent requests
      const promises = Array(5).fill(null).map((_, index) =>
        request(app)
          .get('/health')
          .set('X-Test-Request', index.toString())
      );

      const responses = await Promise.all(promises);

      // All should succeed if within limit
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      expect(mockCacheService.increment).toHaveBeenCalledTimes(5);
    });

    it('should properly handle mixed success and rate-limited requests', async () => {
      let requestCount = 0;
      mockCacheService.increment.mockImplementation(async () => {
        return ++requestCount;
      });

      // Send requests that will exceed limit
      const promises = Array(105).fill(null).map(() =>
        request(app).get('/health')
      );

      const responses = await Promise.all(promises);

      const successResponses = responses.filter(r => r.status === 200);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      expect(successResponses.length).toBe(100); // First 100 should succeed
      expect(rateLimitedResponses.length).toBe(5); // Last 5 should be rate limited
    });
  });

  describe('Error Handling in Rate Limiting', () => {
    it('should handle cache service errors gracefully', async () => {
      mockCacheService.increment.mockRejectedValue(new Error('Cache connection failed'));

      // Should either succeed (fail open) or return 500, but not crash
      const response = await request(app)
        .get('/health');

      expect([200, 500]).toContain(response.status);
    });
  });
});