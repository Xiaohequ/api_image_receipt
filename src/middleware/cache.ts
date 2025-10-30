import { Request, Response, NextFunction } from 'express';
import { cacheService } from '../services/cacheService';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export interface CacheMiddlewareOptions {
  ttl?: number; // Time to live in seconds
  keyGenerator?: (req: Request) => string;
  skipCache?: (req: Request, res: Response) => boolean;
  onlySuccessful?: boolean; // Only cache successful responses (2xx status codes)
}

/**
 * Cache middleware for API responses
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  const {
    ttl = 300, // 5 minutes default
    keyGenerator = defaultKeyGenerator,
    skipCache = () => false,
    onlySuccessful = true
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip caching if specified
    if (skipCache(req, res)) {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator(req);

    try {
      // Try to get cached response
      const cachedResponse = await cacheService.getCachedAPIResponse(req.path, cacheKey);
      
      if (cachedResponse) {
        logger.debug('API cache hit', { 
          path: req.path, 
          method: req.method,
          cacheKey 
        });
        
        // Set cache headers
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Key', cacheKey);
        
        res.json(cachedResponse);
        return;
      }

      // Cache miss - continue with request processing
      logger.debug('API cache miss', { 
        path: req.path, 
        method: req.method,
        cacheKey 
      });

      // Override res.json to cache the response
      const originalJson = res.json;
      res.json = function(body: any) {
        // Cache the response if it's successful or if onlySuccessful is false
        if (!onlySuccessful || (res.statusCode >= 200 && res.statusCode < 300)) {
          cacheService.cacheAPIResponse(req.path, cacheKey, body, { ttl })
            .catch(error => {
              logger.error('Failed to cache API response', { 
                path: req.path,
                cacheKey,
                error 
              });
            });
        }

        // Set cache headers
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Key', cacheKey);
        
        return originalJson.call(this, body);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error', { 
        path: req.path,
        cacheKey,
        error 
      });
      
      // Continue without caching on error
      next();
    }
  };
}

/**
 * Default cache key generator
 */
function defaultKeyGenerator(req: Request): string {
  const keyData = {
    method: req.method,
    path: req.path,
    query: req.query,
    params: req.params,
  };
  
  const hash = crypto.createHash('md5');
  hash.update(JSON.stringify(keyData), 'utf8');
  return hash.digest('hex') as string;
}

/**
 * Cache middleware specifically for status endpoints
 */
export const statusCacheMiddleware = cacheMiddleware({
  ttl: 30, // 30 seconds for status
  skipCache: (req) => {
    // Skip caching for POST requests
    return req.method !== 'GET';
  }
});

/**
 * Cache middleware for result endpoints
 */
export const resultCacheMiddleware = cacheMiddleware({
  ttl: 3600, // 1 hour for completed results
  skipCache: (req) => {
    return req.method !== 'GET';
  }
});

/**
 * Cache middleware for statistics endpoints
 */
export const statsCacheMiddleware = cacheMiddleware({
  ttl: 300, // 5 minutes for stats
  skipCache: (req) => {
    return req.method !== 'GET';
  }
});

/**
 * Invalidate cache for a specific request
 */
export async function invalidateRequestCache(requestId: string): Promise<void> {
  try {
    await cacheService.invalidateRequest(requestId);
    logger.debug('Cache invalidated for request', { requestId });
  } catch (error) {
    logger.error('Failed to invalidate cache', { requestId, error });
  }
}