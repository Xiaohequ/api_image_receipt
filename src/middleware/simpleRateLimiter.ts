import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';
import { RateLimitError, ErrorCode } from '../types/errors';
import { logger } from '../utils/logger';
import { cacheService } from '../services/cacheService';

/**
 * Custom key generator that uses client ID from authentication
 * Falls back to IP address if no client ID is available
 */
const generateRateLimitKey = (req: Request, prefix: string): string => {
  // Use client ID if authenticated, otherwise use IP
  const clientId = (req as any).clientId;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (clientId) {
    return `${prefix}:client:${clientId}`;
  }
  
  return `${prefix}:ip:${ip}`;
};

/**
 * Simple Redis-based rate limiter
 */
export const createSimpleRateLimiter = (options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  errorMessage: string;
}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip rate limiting for whitelisted IPs
      const ip = req.ip || req.connection.remoteAddress || '';
      if (config.rateLimit.whitelist.includes(ip)) {
        logger.debug('Rate limit skipped for whitelisted IP', { ip });
        return next();
      }

      const key = generateRateLimitKey(req, options.keyPrefix);
      const client = cacheService.redisClient;
      
      logger.info('Rate limiter check', { 
        key, 
        ip: req.ip, 
        url: req.url,
        method: req.method 
      });

      // Get current count
      const current = await client.incr(key);
      
      // Set expiration on first increment
      if (current === 1) {
        await client.expire(key, Math.ceil(options.windowMs / 1000));
      }

      // Get TTL for reset time calculation
      const ttl = await client.ttl(key);
      const resetTime = new Date(Date.now() + (ttl * 1000));

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': options.max.toString(),
        'X-RateLimit-Remaining': Math.max(0, options.max - current).toString(),
        'X-RateLimit-Reset': Math.floor(resetTime.getTime() / 1000).toString()
      });

      logger.info('Rate limiter result', { 
        key, 
        current, 
        limit: options.max, 
        remaining: Math.max(0, options.max - current),
        resetTime: resetTime.toISOString()
      });

      // Check if limit exceeded
      if (current > options.max) {
        const clientId = (req as any).clientId || 'anonymous';
        
        logger.warn('Rate limit exceeded', {
          clientId,
          ip: req.ip,
          path: req.path,
          method: req.method,
          current,
          limit: options.max,
          resetTime: resetTime.toISOString(),
          userAgent: req.get('User-Agent')
        });

        const error = new RateLimitError(
          options.errorMessage,
          ErrorCode.RATE_LIMIT_EXCEEDED,
          {
            limit: options.max,
            windowMs: options.windowMs,
            resetTime: resetTime.toISOString(),
            clientId,
            retryAfter: ttl,
            current
          }
        );

        return res.status(429).json({
          success: false,
          error: error.toJSON(),
          timestamp: new Date().toISOString()
        });
      }

      next();
    } catch (error) {
      logger.error('Rate limiter error', { error });
      // On error, allow the request to continue (fail open)
      next();
    }
  };
};

// Main API rate limiter (100 requests per hour per client)
export const apiRateLimiter = createSimpleRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  keyPrefix: 'api_rate_limit',
  errorMessage: 'Limite de requêtes dépassée. Maximum 100 requêtes par heure autorisées.'
});

// Stricter rate limiter for analysis endpoint (20 requests per hour)
export const analysisRateLimiter = createSimpleRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: 20, // Stricter limit for resource-intensive operations
  keyPrefix: 'analysis_rate_limit',
  errorMessage: 'Limite d\'analyses dépassée. Maximum 20 analyses par heure autorisées.'
});

// Health check rate limiter (more permissive)
export const healthCheckRateLimiter = createSimpleRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 1 request per second
  keyPrefix: 'health_rate_limit',
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
  try {
    const key = generateRateLimitKey(req, keyPrefix);
    const client = cacheService.redisClient;
    
    const current = await client.get(key);
    const used = current ? parseInt(current.toString()) : 0;
    const limit = config.rateLimit.maxRequests;
    const remaining = Math.max(0, limit - used);
    
    // Get TTL for reset time
    const ttl = await client.ttl(key);
    const resetTime = ttl > 0 ? 
      new Date(Date.now() + (ttl * 1000)) : 
      new Date(Date.now() + config.rateLimit.windowMs);
    
    return {
      limit,
      remaining,
      resetTime,
      used
    };
  } catch (error) {
    logger.error('Failed to get rate limit status', { error });
    // Return safe defaults on error
    return {
      limit: config.rateLimit.maxRequests,
      remaining: config.rateLimit.maxRequests,
      resetTime: new Date(Date.now() + config.rateLimit.windowMs),
      used: 0
    };
  }
};

/**
 * Reset rate limit for a specific client (admin function)
 */
export const resetRateLimit = async (clientId: string, keyPrefix: string = 'api_rate_limit'): Promise<void> => {
  try {
    const key = `${keyPrefix}:client:${clientId}`;
    const client = cacheService.redisClient;
    await client.del(key);
    
    logger.info('Rate limit reset', {
      clientId,
      keyPrefix,
      adminAction: true
    });
  } catch (error) {
    logger.error('Failed to reset rate limit', { clientId, keyPrefix, error });
    throw error;
  }
};

/**
 * Initialize rate limiter (ensure Redis connection)
 */
export const initializeRateLimiter = async (): Promise<void> => {
  try {
    // The cache service should already be initialized at this point
    // Just verify that Redis is available
    const client = cacheService.redisClient;
    await client.ping();
    
    logger.info('Simple rate limiter initialized with Redis');
  } catch (error) {
    logger.warn('Rate limiter initialization failed, will retry on first request', { error });
    // Don't throw - let it fail gracefully on first request
  }
};