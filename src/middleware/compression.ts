import compression from 'compression';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Compression middleware configuration
 */
export const compressionMiddleware = compression({
  // Only compress responses that are larger than 1kb
  threshold: 1024,
  
  // Compression level (1-9, where 9 is best compression but slowest)
  level: 6,
  
  // Only compress specific content types
  filter: (req: Request, res: Response): boolean => {
    // Don't compress if the client doesn't support it
    if (!compression.filter(req, res)) {
      return false;
    }

    // Don't compress images or already compressed files
    const contentType = res.getHeader('content-type') as string;
    if (contentType) {
      const type = contentType.toLowerCase();
      if (type.includes('image/') || 
          type.includes('video/') || 
          type.includes('audio/') ||
          type.includes('application/zip') ||
          type.includes('application/gzip')) {
        return false;
      }
    }

    // Compress JSON, text, and other compressible content
    return true;
  },
  
  // Memory level (1-9, where 9 uses more memory but is faster)
  memLevel: 8,
  
  // Window size for compression algorithm
  windowBits: 15,
  
  // Compression strategy
  strategy: compression.constants.Z_DEFAULT_STRATEGY,
});

/**
 * Custom compression middleware with logging
 */
export const compressionWithLogging = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  // Track original response size
  let originalSize = 0;
  let compressedSize = 0;
  
  // Override res.send to track size
  res.send = function(body: any) {
    if (body) {
      originalSize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body.toString());
    }
    return originalSend.call(this, body);
  };
  
  // Override res.json to track size
  res.json = function(obj: any) {
    if (obj) {
      const jsonString = JSON.stringify(obj);
      originalSize = Buffer.byteLength(jsonString);
    }
    return originalJson.call(this, obj);
  };
  
  // Hook into the response finish event to log compression stats
  res.on('finish', () => {
    const contentEncoding = res.getHeader('content-encoding');
    const isCompressed = contentEncoding === 'gzip' || contentEncoding === 'deflate';
    
    if (isCompressed && originalSize > 0) {
      // Estimate compressed size from content-length header
      const contentLength = res.getHeader('content-length');
      compressedSize = contentLength ? parseInt(contentLength.toString()) : 0;
      
      const compressionRatio = compressedSize > 0 ? 
        ((originalSize - compressedSize) / originalSize * 100).toFixed(1) : 0;
      
      logger.debug('Response compressed', {
        path: req.path,
        method: req.method,
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio}%`,
        encoding: contentEncoding,
      });
    }
  });
  
  next();
};

/**
 * Selective compression based on response size and type
 */
export const selectiveCompression = (req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json;
  
  res.json = function(obj: any) {
    if (obj) {
      const jsonString = JSON.stringify(obj);
      const size = Buffer.byteLength(jsonString);
      
      // Only enable compression for responses larger than 2KB
      if (size > 2048) {
        // Set compression header to indicate this response should be compressed
        res.setHeader('x-should-compress', 'true');
      }
    }
    
    return originalJson.call(this, obj);
  };
  
  next();
};