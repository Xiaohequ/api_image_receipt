// Note: crypto module should be available in Node.js environment
// If you see import errors, ensure Node.js types are properly installed
const crypto = require('crypto');
import { config } from '../config/config';
import { logger } from './logger';

/**
 * Security utilities for encryption, sanitization, and validation
 */

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Generate encryption key from JWT secret
 */
const getEncryptionKey = (): Buffer => {
  return crypto.scryptSync(config.security.jwtSecret, 'salt', KEY_LENGTH);
};

/**
 * Encrypt sensitive data
 */
export const encrypt = (text: string): string => {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher(ALGORITHM, key);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine IV, tag, and encrypted data
    const result = iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
    
    return result;
  } catch (error) {
    logger.error('Encryption failed', { error: (error as Error).message });
    throw new Error('Échec du chiffrement des données');
  }
};

/**
 * Decrypt sensitive data
 */
export const decrypt = (encryptedData: string): string => {
  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Format de données chiffrées invalide');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipher(ALGORITHM, key);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Decryption failed', { error: (error as Error).message });
    throw new Error('Échec du déchiffrement des données');
  }
};

/**
 * Hash sensitive data (one-way)
 */
export const hash = (data: string, salt?: string): string => {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha512');
  return actualSalt + ':' + hash.toString('hex');
};

/**
 * Verify hashed data
 */
export const verifyHash = (data: string, hashedData: string): boolean => {
  try {
    const parts = hashedData.split(':');
    if (parts.length !== 2) {
      return false;
    }
    
    const salt = parts[0];
    const originalHash = parts[1];
    const newHash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512').toString('hex');
    
    return originalHash === newHash;
  } catch (error) {
    logger.error('Hash verification failed', { error: (error as Error).message });
    return false;
  }
};

/**
 * Input sanitization utilities
 */
export const sanitize = {
  /**
   * Remove HTML tags and dangerous characters
   */
  html: (input: string): string => {
    if (typeof input !== 'string') {
      return '';
    }
    
    return input
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[<>'"&]/g, '') // Remove dangerous characters
      .trim();
  },
  
  /**
   * Sanitize filename to prevent path traversal
   */
  filename: (input: string): string => {
    if (typeof input !== 'string') {
      return '';
    }
    
    return input
      .replace(/[^a-zA-Z0-9._-]/g, '') // Only allow safe characters
      .replace(/\.{2,}/g, '.') // Prevent multiple dots
      .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots
      .substring(0, 255); // Limit length
  },
  
  /**
   * Sanitize API key format
   */
  apiKey: (input: string): string => {
    if (typeof input !== 'string') {
      return '';
    }
    
    return input
      .replace(/[^a-zA-Z0-9_-]/g, '') // Only allow alphanumeric, underscore, hyphen
      .trim();
  },
  
  /**
   * Sanitize client ID (UUID format)
   */
  clientId: (input: string): string => {
    if (typeof input !== 'string') {
      return '';
    }
    
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    const sanitized = input.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
    
    return uuidRegex.test(sanitized) ? sanitized : '';
  },
  
  /**
   * Sanitize general text input
   */
  text: (input: string, maxLength: number = 1000): string => {
    if (typeof input !== 'string') {
      return '';
    }
    
    return input
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
      .replace(/[<>'"&]/g, '') // Remove dangerous characters
      .trim()
      .substring(0, maxLength);
  },
  
  /**
   * Sanitize numeric input
   */
  number: (input: any): number | null => {
    const num = parseFloat(input);
    return isNaN(num) ? null : num;
  },
  
  /**
   * Sanitize boolean input
   */
  boolean: (input: any): boolean => {
    if (typeof input === 'boolean') {
      return input;
    }
    
    if (typeof input === 'string') {
      return input.toLowerCase() === 'true';
    }
    
    return Boolean(input);
  }
};

/**
 * Input validation utilities
 */
export const validate = {
  /**
   * Validate email format
   */
  email: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },
  
  /**
   * Validate UUID format
   */
  uuid: (uuid: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  },
  
  /**
   * Validate API key format
   */
  apiKey: (apiKey: string): boolean => {
    // API keys should be at least 16 characters and contain only safe characters
    const apiKeyRegex = /^[a-zA-Z0-9_-]{16,}$/;
    return apiKeyRegex.test(apiKey);
  },
  
  /**
   * Validate file extension
   */
  fileExtension: (filename: string, allowedExtensions: string[]): boolean => {
    const ext = filename.toLowerCase().split('.').pop();
    return ext ? allowedExtensions.includes(ext) : false;
  },
  
  /**
   * Validate content type
   */
  contentType: (contentType: string, allowedTypes: string[]): boolean => {
    return allowedTypes.some(type => contentType.toLowerCase().includes(type.toLowerCase()));
  },
  
  /**
   * Validate IP address
   */
  ipAddress: (ip: string): boolean => {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }
};

/**
 * Generate secure random tokens
 */
export const generateToken = {
  /**
   * Generate API key
   */
  apiKey: (prefix: string = 'ak'): string => {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(16).toString('hex');
    return `${prefix}_${timestamp}_${random}`;
  },
  
  /**
   * Generate request ID
   */
  requestId: (): string => {
    return crypto.randomUUID();
  },
  
  /**
   * Generate session token
   */
  session: (): string => {
    return crypto.randomBytes(32).toString('hex');
  }
};

/**
 * Security headers utilities
 */
export const securityHeaders = {
  /**
   * Get security headers for responses
   */
  getHeaders: () => ({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"
  }),
  
  /**
   * Remove sensitive headers from requests
   */
  sanitizeRequestHeaders: (headers: Record<string, any>): Record<string, any> => {
    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie', 'x-forwarded-for'];
    const sanitized = { ...headers };
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
};

/**
 * Rate limiting utilities
 */
export const rateLimitUtils = {
  /**
   * Calculate retry after time
   */
  calculateRetryAfter: (windowMs: number, resetTime?: Date): number => {
    if (resetTime) {
      return Math.ceil((resetTime.getTime() - Date.now()) / 1000);
    }
    return Math.ceil(windowMs / 1000);
  },
  
  /**
   * Check if rate limit should be bypassed for certain IPs
   */
  shouldBypassRateLimit: (ip: string): boolean => {
    const whitelistedIPs = config.rateLimit.whitelist || [];
    return whitelistedIPs.includes(ip) || ip === '127.0.0.1' || ip === '::1';
  }
};