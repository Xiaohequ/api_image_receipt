import { createClient, RedisClientType } from 'redis';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { ExtractedReceiptData } from '../types';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compress?: boolean;
}

class CacheService {
  private client: RedisClientType;
  private isInitialized = false;
  private readonly defaultTTL = 3600; // 1 hour default TTL

  /**
   * Get Redis client for external use (e.g., rate limiting)
   */
  get redisClient(): RedisClientType {
    if (!this.isInitialized || !this.client) {
      throw new Error('Cache service not initialized');
    }
    return this.client;
  }

  constructor() {
    this.client = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
      },
      password: config.redis.password,
    });

    this.setupEventHandlers();
  }

  /**
   * Initialize the cache service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.client.connect();
      this.isInitialized = true;
      
      logger.info('Cache service initialized successfully', {
        redisHost: config.redis.host,
        redisPort: config.redis.port,
      });
    } catch (error) {
      logger.error('Failed to initialize cache service', { error });
      throw error;
    }
  }

  /**
   * Cache extracted receipt data
   */
  async cacheExtractedData(
    requestId: string, 
    data: ExtractedReceiptData, 
    options: CacheOptions = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const key = this.getExtractedDataKey(requestId);
      const ttl = options.ttl || this.defaultTTL;
      
      await this.client.setEx(key, ttl, JSON.stringify(data));
      
      logger.debug('Cached extracted data', { requestId, ttl });
    } catch (error) {
      logger.error('Failed to cache extracted data', { requestId, error });
      // Don't throw - caching failures shouldn't break the flow
    }
  }

  /**
   * Get cached extracted receipt data
   */
  async getCachedExtractedData(requestId: string): Promise<ExtractedReceiptData | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const key = this.getExtractedDataKey(requestId);
      const cached = await this.client.get(key);
      
      if (cached) {
        logger.debug('Cache hit for extracted data', { requestId });
        return JSON.parse(cached) as ExtractedReceiptData;
      }
      
      logger.debug('Cache miss for extracted data', { requestId });
      return null;
    } catch (error) {
      logger.error('Failed to get cached extracted data', { requestId, error });
      return null;
    }
  }

  /**
   * Cache processing status
   */
  async cacheStatus(
    requestId: string, 
    status: any, 
    options: CacheOptions = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const key = this.getStatusKey(requestId);
      const ttl = options.ttl || 300; // 5 minutes for status
      
      await this.client.setEx(key, ttl, JSON.stringify(status));
      
      logger.debug('Cached status', { requestId, ttl });
    } catch (error) {
      logger.error('Failed to cache status', { requestId, error });
    }
  }

  /**
   * Get cached processing status
   */
  async getCachedStatus(requestId: string): Promise<any | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const key = this.getStatusKey(requestId);
      const cached = await this.client.get(key);
      
      if (cached) {
        logger.debug('Cache hit for status', { requestId });
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get cached status', { requestId, error });
      return null;
    }
  }

  /**
   * Cache OCR results to avoid reprocessing identical images
   */
  async cacheOCRResult(
    imageHash: string, 
    ocrResult: string, 
    options: CacheOptions = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const key = this.getOCRKey(imageHash);
      const ttl = options.ttl || 7200; // 2 hours for OCR results
      
      await this.client.setEx(key, ttl, ocrResult);
      
      logger.debug('Cached OCR result', { imageHash, ttl });
    } catch (error) {
      logger.error('Failed to cache OCR result', { imageHash, error });
    }
  }

  /**
   * Get cached OCR result
   */
  async getCachedOCRResult(imageHash: string): Promise<string | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const key = this.getOCRKey(imageHash);
      const cached = await this.client.get(key);
      
      if (cached) {
        logger.debug('Cache hit for OCR result', { imageHash });
        return cached;
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get cached OCR result', { imageHash, error });
      return null;
    }
  }

  /**
   * Cache API response for frequent queries
   */
  async cacheAPIResponse(
    endpoint: string, 
    params: string, 
    response: any, 
    options: CacheOptions = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const key = this.getAPIResponseKey(endpoint, params);
      const ttl = options.ttl || 600; // 10 minutes for API responses
      
      await this.client.setEx(key, ttl, JSON.stringify(response));
      
      logger.debug('Cached API response', { endpoint, params, ttl });
    } catch (error) {
      logger.error('Failed to cache API response', { endpoint, params, error });
    }
  }

  /**
   * Get cached API response
   */
  async getCachedAPIResponse(endpoint: string, params: string): Promise<any | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const key = this.getAPIResponseKey(endpoint, params);
      const cached = await this.client.get(key);
      
      if (cached) {
        logger.debug('Cache hit for API response', { endpoint, params });
        return JSON.parse(cached);
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to get cached API response', { endpoint, params, error });
      return null;
    }
  }

  /**
   * Invalidate cache for a specific request
   */
  async invalidateRequest(requestId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const keys = [
        this.getExtractedDataKey(requestId),
        this.getStatusKey(requestId),
      ];
      
      await Promise.all(keys.map(key => this.client.del(key)));
      
      logger.debug('Invalidated cache for request', { requestId });
    } catch (error) {
      logger.error('Failed to invalidate cache', { requestId, error });
    }
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.client.flushAll();
      logger.info('Cleared all cache');
    } catch (error) {
      logger.error('Failed to clear cache', { error });
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate?: number;
    connected: boolean;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const info = await this.client.info('memory');
      const dbSize = await this.client.dbSize();
      
      // Parse memory usage from Redis info
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'unknown';
      
      return {
        totalKeys: dbSize,
        memoryUsage,
        connected: this.client.isReady,
      };
    } catch (error) {
      logger.error('Failed to get cache stats', { error });
      return {
        totalKeys: 0,
        memoryUsage: 'unknown',
        connected: false,
      };
    }
  }

  /**
   * Health check for cache service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    connected: boolean;
    responseTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Simple ping to test connection
      await this.client.ping();
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        connected: true,
        responseTime,
      };
    } catch (error) {
      logger.error('Cache health check failed', { error });
      
      return {
        status: 'unhealthy',
        connected: false,
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Generic get method for cache
   */
  async get(key: string): Promise<string | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Failed to get cache value', { key, error });
      return null;
    }
  }

  /**
   * Generic set method for cache
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error('Failed to set cache value', { key, error });
    }
  }

  /**
   * Generic delete method for cache
   */
  async delete(key: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.client.del(key);
    } catch (error) {
      logger.error('Failed to delete cache value', { key, error });
    }
  }

  /**
   * Increment a numeric value in cache
   */
  async increment(key: string, ttl?: number): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = await this.client.incr(key);
      if (ttl && result === 1) {
        // Set TTL only on first increment
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      logger.error('Failed to increment cache value', { key, error });
      return 0;
    }
  }

  /**
   * Decrement a numeric value in cache
   */
  async decrement(key: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      return await this.client.decr(key);
    } catch (error) {
      logger.error('Failed to decrement cache value', { key, error });
      return 0;
    }
  }

  /**
   * Gracefully close the cache connection
   */
  async close(): Promise<void> {
    if (this.client && this.isInitialized) {
      await this.client.quit();
      this.isInitialized = false;
      logger.info('Cache service closed');
    }
  }

  /**
   * Setup Redis event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error', { error });
    });

    this.client.on('end', () => {
      logger.info('Redis client connection ended');
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  /**
   * Generate cache key for extracted data
   */
  private getExtractedDataKey(requestId: string): string {
    return `receipt:extracted:${requestId}`;
  }

  /**
   * Generate cache key for status
   */
  private getStatusKey(requestId: string): string {
    return `receipt:status:${requestId}`;
  }

  /**
   * Generate cache key for OCR results
   */
  private getOCRKey(imageHash: string): string {
    return `ocr:result:${imageHash}`;
  }

  /**
   * Generate cache key for API responses
   */
  private getAPIResponseKey(endpoint: string, params: string): string {
    return `api:response:${endpoint}:${params}`;
  }
}

// Export singleton instance
export const cacheService = new CacheService();