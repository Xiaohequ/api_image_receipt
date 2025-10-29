import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config/config';
import { RateLimitError, ErrorCode } from '../types/errors';
import { logger } from '../utils/logger';
import { cacheService } from '../services/cacheService';

/**
 * Custom key generator that uses client ID from authentication
 * Falls back to IP address if no client ID is available
 */
const generateRateLimitKey = (req: Request): string => {
  // Use client ID if authenticated, otherwise use IP
  const clientId = req.clientId;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (clientId) {
    return `rate_limit:client:${clientId}`;
  }
  
  return `rate_limit:ip:${ip}`;
};

/**
 * Enhanced rate limiter with Redis store and client-based limiting
 */
const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  errorCode: string;
  errorMessage: string;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    
    // Use Redis store for distributed rate limiting
    store: {
      incr: async (key: string) => {
        const fullKey = `${options.keyPrefix}:${key}`;
        const current = await cacheService.increment(fullKey, options.windowMs / 1000);
        return {
          totalHits: current,
          resetTime: new Date(Date.now() + options.windowMs)
        };
      },
      decrement: async (key: string) => {
        const fullKey = `${options.keyPrefix}:${key}`;
        await cacheService.decrement(fullKey);
      },
      resetKey: async (key: string) => {
        const fullKey = `${options.keyPrefix}:${key}`;
        await cacheService.delete(fullKey);
      }
    },
    
    // Custom key generator
    keyGenerator: generateRateLimitKey,
    
    // Skip successful requests for certain endpoints
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    
    // Headers configuration
    standardHeaders: true,
    legacyHeaders: false,
    
    // Custom handler with proper error formatting
    handler: (req: Request, res: Response) => {
      const resetTime = new Date(Date.now() + options.windowMs);
      const clientId = req.clientId || 'anonymous';
      
      logger.warn('Rate limit exceeded', {
        clientId,
        ip: req.ip,
        path: req.path,
        method: req.method,
        limit: options.max,
        resetTime: resetTime.toISOString(),
        userAgent: req.get('User-Agent')
      });
      
      throw new RateLimitError(
        options.errorMessage,
        ErrorCode.RATE_LIMIT_EXCEEDED,
        {
          limit: options.max,
          windowMs: options.windowMs,
          resetTime: resetTime.toISOString(),
          clientId,
          retryAfter: Math.ceil(options.windowMs / 1000)
        }
      );
    },
    
    // Custom message for non-error responses
    message: {
      success: false,
      error: {
        code: options.errorCode,
        message: options.errorMessage,
        limit: options.max,
        windowMs: options.windowMs
      },
      timestamp: new Date().toISOString()
    }
  });
};

// Main API rate limiter (100 requests per hour per client)
export const apiRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  keyPrefix: 'api_rate_limit',
  errorCode: 'RATE_LIMIT_EXCEEDED',
  errorMessage: 'Limite de requêtes dépassée. Maximum 100 requêtes par heure autorisées.'
});

// Stricter rate limiter for analysis endpoint (20 requests per hour)
export const analysisRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: 20, // Stricter limit for resource-intensive operations
  keyPrefix: 'analysis_rate_limit',
  errorCode: 'ANALYSIS_RATE_LIMIT_EXCEEDED',
  errorMessage: 'Limite d\'analyses dépassée. Maximum 20 analyses par heure autorisées.'
});

// Health check rate limiter (more permissive)
export const healthCheckRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 1 request per second
  keyPrefix: 'health_rate_limit',
  errorCode: 'HEALTH_CHECK_RATE_LIMIT_EXCEEDED',
  errorMessage: 'Limite de vérifications de santé dépassée.'
});

/**
 * Get current rate limit status for a client
 */
export const getRateLimitStatus = async (req: Request, keyPrefix: string = 'api_rate_limit'): Promise<{
  limit: number;
  remaining: number;
  resetTime: Date;
  used: number;
}> => {
  const key = generateRateLimitKey(req);
  const fullKey = `${keyPrefix}:${key}`;
  
  const current = await cacheService.get(fullKey);
  const used = current ? parseInt(current.toString()) : 0;
  const limit = config.rateLimit.maxRequests;
  const remaining = Math.max(0, limit - used);
  const resetTime = new Date(Date.now() + config.rateLimit.windowMs);
  
  return {
    limit,
    remaining,
    resetTime,
    used
  };
};

/**
 * Reset rate limit for a specific client (admin function)
 */
export const resetRateLimit = async (clientId: string, keyPrefix: string = 'api_rate_limit'): Promise<void> => {
  const key = `${keyPrefix}:rate_limit:client:${clientId}`;
  await cacheService.delete(key);
  
  logger.info('Rate limit reset', {
    clientId,
    keyPrefix,
    adminAction: true
  });
};