import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { 
  AppError, 
  ValidationAppError, 
  isAppError, 
  isValidationError,
  ErrorCode,
  getLocalizedErrorMessage 
} from '../types/errors';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export class CustomError extends Error implements ApiError {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'CustomError';
  }
}

export const errorHandler = (
  error: Error | ApiError | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Extract request ID from headers or generate one
  const requestId = req.headers['x-request-id'] as string || 
                   req.headers['x-correlation-id'] as string ||
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  let statusCode: number;
  let errorCode: string;
  let message: string;
  let details: any;

  // Handle AppError instances (our custom errors)
  if (isAppError(error)) {
    statusCode = error.statusCode;
    errorCode = error.code;
    message = error.message;
    details = error.details;
    
    // Enhanced logging for AppError
    logger.error('Application Error', {
      requestId: error.requestId || requestId,
      errorCode: error.code,
      message: error.message,
      statusCode: error.statusCode,
      details: error.details,
      timestamp: error.timestamp,
      stack: error.stack,
      request: {
        method: req.method,
        url: req.url,
        headers: sanitizeHeaders(req.headers),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: sanitizeRequestBody(req.body)
      }
    });
  }
  // Handle ValidationAppError specifically
  else if (isValidationError(error)) {
    statusCode = 400;
    errorCode = ErrorCode.INVALID_REQUEST;
    message = 'Erreur de validation des données';
    details = {
      validationErrors: error.validationDetails,
      totalErrors: error.validationDetails.length
    };
    
    logger.warn('Validation Error', {
      requestId: error.requestId || requestId,
      validationErrors: error.validationDetails,
      request: {
        method: req.method,
        url: req.url,
        body: sanitizeRequestBody(req.body)
      }
    });
  }
  // Handle legacy CustomError
  else if (error instanceof CustomError) {
    statusCode = error.statusCode;
    errorCode = error.code;
    message = error.message;
    details = error.details;
    
    logger.error('Custom Error', {
      requestId,
      errorCode: error.code,
      message: error.message,
      statusCode: error.statusCode,
      details: error.details,
      stack: error.stack,
      request: {
        method: req.method,
        url: req.url,
        ip: req.ip
      }
    });
  }
  // Handle standard JavaScript errors
  else {
    statusCode = 500;
    errorCode = 'INTERNAL_ERROR';
    message = 'Erreur interne du serveur';
    details = undefined;
    
    // Log full error details for debugging
    logger.error('Unhandled Error', {
      requestId,
      message: error.message,
      name: error.name,
      stack: error.stack,
      request: {
        method: req.method,
        url: req.url,
        headers: sanitizeHeaders(req.headers),
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    });
  }

  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    details = undefined;
  }

  // Prepare standardized error response
  const errorResponse = {
    success: false,
    requestId,
    error: {
      code: errorCode,
      message,
      ...(details && { details }),
      ...(isValidationError(error) && { 
        validationErrors: error.validationDetails 
      })
    },
    timestamp: new Date().toISOString()
  };

  // Add retry information for specific error types
  if (statusCode === 429 && details?.retryAfter) {
    res.set('Retry-After', details.retryAfter.toString());
  }
  
  if (statusCode === 503 && details?.retryAfter) {
    res.set('Retry-After', details.retryAfter.toString());
  }

  res.status(statusCode).json(errorResponse);
};

// Helper function to sanitize sensitive headers
const sanitizeHeaders = (headers: any): any => {
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie', 'x-auth-token'];
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

// Helper function to sanitize request body
const sanitizeRequestBody = (body: any): any => {
  if (!body || typeof body !== 'object') {
    return body;
  }
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'apiKey', 'secret'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = req.headers['x-request-id'] as string || 
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  logger.warn('Endpoint Not Found', {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    success: false,
    requestId,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint non trouvé',
      details: {
        method: req.method,
        path: req.path,
        suggestion: 'Vérifiez l\'URL et la méthode HTTP utilisées'
      }
    },
    timestamp: new Date().toISOString()
  });
};

// Async error handler wrapper
export const asyncErrorHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Request timeout handler
export const timeoutHandler = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      const requestId = req.headers['x-request-id'] as string || 
                       `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      logger.error('Request Timeout', {
        requestId,
        method: req.method,
        url: req.url,
        timeout: timeoutMs
      });

      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          requestId,
          error: {
            code: 'REQUEST_TIMEOUT',
            message: 'La requête a expiré. Veuillez réessayer.',
            details: {
              timeoutMs,
              suggestion: 'Réduisez la taille du fichier ou réessayez plus tard'
            }
          },
          timestamp: new Date().toISOString()
        });
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};