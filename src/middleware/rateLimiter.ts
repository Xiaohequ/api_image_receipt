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
  const clientId = (req as any).clientId;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (clientId) {
    return `client:${clientId}`;
  }
  
  return `ip:${ip}`;
};

/**
 * Custom Redis store implementation for rate limiting
 */
class CustomRedisStore {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  async incr(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    try {
      const client = cacheService.redisClient;
      const fullKey = `${this.prefix}:${key}`;
      
      logger.info('Rate limiter incr', { key: fullKey });
      
      // Use Redis INCR with expiration
      const current = await client.incr(fullKey);
      
      // Set expiration on first increment
      if (current === 1) {
        await client.expire(fullKey, Math.ceil(config.rateLimit.windowMs / 1000));
      }
      
      const resetTime = new Date(Date.now() + config.rateLimit.windowMs);
      
      logger.info('Rate limiter incr result', { 
        key: fullKey, 
        current, 
        resetTime: resetTime.toISOString() 
      });
      
      return {
        totalHits: current,
        resetTime
      };
    } catch (error) {
      logger.error('Rate limiter incr failed', { key, error });
      throw error;
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      const client = cacheService.redisClient;
      const fullKey = `${this.prefix}:${key}`;
      
      logger.debug('Rate limiter decrement', { key: fullKey });
      await client.decr(fullKey);
    } catch (error) {
      logger.error('Rate limiter decrement failed', { key, error });
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      const client = cacheService.redisClient;
      const fullKey = `${this.prefix}:${key}`;
      
      logger.debug('Rate limiter reset', { key: fullKey });
      await client.del(fullKey);
    } catch (error) {
      logger.error('Rate limiter reset failed', { key, error });
    }
  }
}

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
  const store = new CustomRedisStore(options.keyPrefix);
  
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    
    // Use custom Redis store for distributed rate limiting
    store: {
      incr: (key: string) => store.incr(key),
      decrement: (key: string) => store.decrement(key),
      resetKey: (key: string) => store.resetKey(key)
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
      const clientId = (req as any).clientId || 'anonymous';
      
      logger.warn('Rate limit exceeded', {
        clientId,
        ip: req.ip,
        path: req.path,
        method: req.method,
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
          retryAfter: Math.ceil(options.windowMs / 1000)
        }
      );
      
      res.status(429).json({
        success: false,
        error: error.toJSON(),
        timestamp: new Date().toISOString()
      });
    },
    
    // Skip rate limiting for whitelisted IPs
    skip: (req: Request) => {
      const ip = req.ip || req.connection.remoteAddress || '';
      return config.rateLimit.whitelist.includes(ip);
    }
  });
};

// Initialize rate limiters at module load time
let apiRateLimiterInstance: any = null;
let analysisRateLimiterInstance: any = null;
let healthCheckRateLimiterInstance: any = null;

// Function to initialize rate limiters (called after cache service is ready)
export const initializeRateLimiters = () => {
  if (!apiRateLimiterInstance) {
    apiRateLimiterInstance = createRateLimiter({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.maxRequests,
      keyPrefix: 'api_rate_limit',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      errorMessage: 'Limite de requêtes dépassée. Maximum 100 requêtes par heure autorisées.'
    });
  }

  if (!analysisRateLimiterInstance) {
    analysisRateLimiterInstance = createRateLimiter({
      windowMs: config.rateLimit.windowMs,
      max: 20, // Stricter limit for resource-intensive operations
      keyPrefix: 'analysis_rate_limit',
      errorCode: 'ANALYSIS_RATE_LIMIT_EXCEEDED',
      errorMessage: 'Limite d\'analyses dépassée. Maximum 20 analyses par heure autorisées.'
    });
  }

  if (!healthCheckRateLimiterInstance) {
    healthCheckRateLimiterInstance = createRateLimiter({
      windowMs: 60 * 1000, // 1 minute
      max: 60, // 1 request per second
      keyPrefix: 'health_rate_limit',
      errorCode: 'HEALTH_CHECK_RATE_LIMIT_EXCEEDED',
      errorMessage: 'Limite de vérifications de santé dépassée.'
    });
  }
};

// Main API rate limiter (100 requests per hour per client)
export const apiRateLimiter = (req: Request, res: Response, next: any) => {
  logger.info('API Rate limiter called', { 
    url: req.url, 
    ip: req.ip,
    initialized: !!apiRateLimiterInstance 
  });
  
  if (!apiRateLimiterInstance) {
    logger.info('Initializing rate limiters');
    initializeRateLimiters();
  }
  return apiRateLimiterInstance(req, res, next);
};

// Stricter rate limiter for analysis endpoint (20 requests per hour)
export const analysisRateLimiter = (req: Request, res: Response, next: any) => {
  if (!analysisRateLimiterInstance) {
    initializeRateLimiters();
  }
  return analysisRateLimiterInstance(req, res, next);
};

// Health check rate limiter (more permissive)
export const healthCheckRateLimiter = (req: Request, res: Response, next: any) => {
  if (!healthCheckRateLimiterInstance) {
    initializeRateLimiters();
  }
  return healthCheckRateLimiterInstance(req, res, next);
};

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
    await cacheService.delete(key);
    
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
    
    // Initialize the rate limiter instances
    initializeRateLimiters();
    
    logger.info('Rate limiter initialized with Redis store');
  } catch (error) {
    logger.warn('Rate limiter initialization failed, will retry on first request', { error });
    // Don't throw - let it fail gracefully on first request
  }
};