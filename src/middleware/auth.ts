import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';
import { AuthenticationError, ErrorCode } from '../types/errors';
import { logger } from '../utils/logger';

// Extend Request interface to include authenticated client info
declare global {
  namespace Express {
    interface Request {
      clientId?: string;
      apiKey?: string;
    }
  }
}

// In a real application, these would be stored in a database
// For this implementation, we'll use environment variables or a simple in-memory store
interface ApiKeyInfo {
  key: string;
  clientId: string;
  name: string;
  isActive: boolean;
  rateLimit?: number;
  permissions?: string[];
  createdAt: Date;
  lastUsedAt?: Date;
}

// Simple in-memory store for API keys (in production, use database)
const API_KEYS: Map<string, ApiKeyInfo> = new Map();

// Initialize with some default API keys from environment
const initializeApiKeys = (): void => {
  // Load API keys from environment variables
  const defaultApiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : [];
  
  defaultApiKeys.forEach((keyData: string, index: number) => {
    const [key, clientId, name] = keyData.split(':');
    if (key && clientId) {
      API_KEYS.set(key, {
        key,
        clientId: clientId || `client_${index + 1}`,
        name: name || `Client ${index + 1}`,
        isActive: true,
        rateLimit: 100, // Default rate limit
        permissions: ['analyze', 'status', 'result'],
        createdAt: new Date(),
      });
    }
  });

  // Add a default development API key if none are configured
  if (API_KEYS.size === 0 && config.nodeEnv === 'development') {
    const devKey = 'dev-api-key-12345';
    API_KEYS.set(devKey, {
      key: devKey,
      clientId: 'dev-client',
      name: 'Development Client',
      isActive: true,
      rateLimit: 1000,
      permissions: ['analyze', 'status', 'result', 'stats'],
      createdAt: new Date(),
    });
    
    logger.info('Development API key initialized', { 
      apiKey: devKey.substring(0, 8) + '...',
      clientId: 'dev-client'
    });
  }
};

// Initialize API keys on module load
initializeApiKeys();

/**
 * Validates an API key and returns client information
 */
const validateApiKey = (apiKey: string): ApiKeyInfo | null => {
  const keyInfo = API_KEYS.get(apiKey);
  
  if (!keyInfo) {
    return null;
  }
  
  if (!keyInfo.isActive) {
    return null;
  }
  
  // Update last used timestamp
  keyInfo.lastUsedAt = new Date();
  
  return keyInfo;
};

/**
 * Extracts API key from request headers
 */
const extractApiKey = (req: Request): string | null => {
  const headerName = config.security.apiKeyHeader.toLowerCase();
  
  // Try different header formats
  const apiKey = req.headers[headerName] as string ||
                 req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                 req.query.api_key as string;
  
  return apiKey || null;
};

/**
 * API Key Authentication Middleware
 * Validates API key and sets client information on request
 */
export const authenticateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const apiKey = extractApiKey(req);
    
    if (!apiKey) {
      logger.warn('API key authentication failed: No API key provided', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      });
      
      throw new AuthenticationError(
        'Clé API manquante. Veuillez fournir une clé API valide dans l\'en-tête de requête.',
        ErrorCode.UNAUTHORIZED,
        { 
          reason: 'missing_api_key',
          headerName: config.security.apiKeyHeader,
          supportedMethods: ['header', 'bearer_token', 'query_parameter']
        }
      );
    }
    
    const keyInfo = validateApiKey(apiKey);
    
    if (!keyInfo) {
      logger.warn('API key authentication failed: Invalid API key', {
        apiKeyPrefix: apiKey.substring(0, 8) + '...',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method
      });
      
      throw new AuthenticationError(
        'Clé API invalide. Veuillez vérifier votre clé API et réessayer.',
        ErrorCode.UNAUTHORIZED,
        { 
          reason: 'invalid_api_key',
          apiKeyPrefix: apiKey.substring(0, 8) + '...'
        }
      );
    }
    
    // Set client information on request
    req.clientId = keyInfo.clientId;
    req.apiKey = apiKey;
    
    // Log successful authentication
    logger.info('API key authentication successful', {
      clientId: keyInfo.clientId,
      clientName: keyInfo.name,
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Permission-based authorization middleware
 * Checks if the authenticated client has required permissions
 */
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.clientId || !req.apiKey) {
        throw new AuthenticationError(
          'Authentification requise pour accéder à cette ressource.',
          ErrorCode.UNAUTHORIZED,
          { reason: 'not_authenticated' }
        );
      }
      
      const keyInfo = API_KEYS.get(req.apiKey);
      
      if (!keyInfo || !keyInfo.permissions?.includes(permission)) {
        logger.warn('Permission denied', {
          clientId: req.clientId,
          requiredPermission: permission,
          clientPermissions: keyInfo?.permissions || [],
          path: req.path,
          method: req.method
        });
        
        throw new AuthenticationError(
          `Permissions insuffisantes. L'accès à cette ressource nécessite la permission '${permission}'.`,
          ErrorCode.UNAUTHORIZED,
          { 
            reason: 'insufficient_permissions',
            requiredPermission: permission,
            clientPermissions: keyInfo?.permissions || []
          }
        );
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Optional authentication middleware
 * Authenticates if API key is provided, but doesn't require it
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = extractApiKey(req);
  
  if (apiKey) {
    const keyInfo = validateApiKey(apiKey);
    if (keyInfo) {
      req.clientId = keyInfo.clientId;
      req.apiKey = apiKey;
      
      logger.info('Optional authentication successful', {
        clientId: keyInfo.clientId,
        path: req.path,
        method: req.method
      });
    }
  }
  
  next();
};

/**
 * Admin-only authentication middleware
 * Requires special admin permissions
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.clientId || !req.apiKey) {
      throw new AuthenticationError(
        'Authentification administrateur requise.',
        ErrorCode.UNAUTHORIZED,
        { reason: 'admin_auth_required' }
      );
    }
    
    const keyInfo = API_KEYS.get(req.apiKey);
    
    if (!keyInfo || !keyInfo.permissions?.includes('admin')) {
      logger.warn('Admin access denied', {
        clientId: req.clientId,
        clientPermissions: keyInfo?.permissions || [],
        path: req.path,
        method: req.method
      });
      
      throw new AuthenticationError(
        'Accès administrateur requis pour cette ressource.',
        ErrorCode.UNAUTHORIZED,
        { 
          reason: 'admin_access_required',
          clientPermissions: keyInfo?.permissions || []
        }
      );
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Utility functions for API key management
 */
export const apiKeyUtils = {
  /**
   * Add a new API key
   */
  addApiKey: (keyInfo: Omit<ApiKeyInfo, 'createdAt'>): void => {
    API_KEYS.set(keyInfo.key, {
      ...keyInfo,
      createdAt: new Date()
    });
  },
  
  /**
   * Remove an API key
   */
  removeApiKey: (apiKey: string): boolean => {
    return API_KEYS.delete(apiKey);
  },
  
  /**
   * Deactivate an API key
   */
  deactivateApiKey: (apiKey: string): boolean => {
    const keyInfo = API_KEYS.get(apiKey);
    if (keyInfo) {
      keyInfo.isActive = false;
      return true;
    }
    return false;
  },
  
  /**
   * Get API key information (without the actual key)
   */
  getApiKeyInfo: (apiKey: string): Omit<ApiKeyInfo, 'key'> | null => {
    const keyInfo = API_KEYS.get(apiKey);
    if (keyInfo) {
      const { key, ...info } = keyInfo;
      return info;
    }
    return null;
  },
  
  /**
   * List all API keys (without actual keys)
   */
  listApiKeys: (): Array<Omit<ApiKeyInfo, 'key'>> => {
    return Array.from(API_KEYS.values()).map(({ key, ...info }) => info);
  },
  
  /**
   * Generate a new API key
   */
  generateApiKey: (prefix: string = 'ak'): string => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `${prefix}_${timestamp}_${random}`;
  }
};

// Export types for use in other modules
export type { ApiKeyInfo };