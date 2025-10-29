import { Request } from 'express';
import { logger, logError, logSecurityEvent } from './logger';
import { 
  AppError, 
  ErrorCode, 
  getDetailedErrorMessage, 
  getErrorSuggestion,
  createInvalidFormatError,
  createFileTooLargeError,
  createPoorImageQualityError,
  createNoTextDetectedError,
  createRateLimitExceededError,
  createProcessingError,
  createServiceUnavailableError,
  createUnauthorizedError
} from '../types/errors';

/**
 * Utility functions for consistent error handling across the application
 */

// Generate unique request ID
export const generateRequestId = (req?: Request): string => {
  const existingId = req?.headers['x-request-id'] as string || 
                    req?.headers['x-correlation-id'] as string;
  
  if (existingId) {
    return existingId;
  }
  
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Extract client information from request
export const extractClientInfo = (req: Request) => {
  return {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    method: req.method,
    url: req.url,
    headers: sanitizeHeaders(req.headers)
  };
};

// Sanitize sensitive information from headers
export const sanitizeHeaders = (headers: any): any => {
  const sanitized = { ...headers };
  const sensitiveHeaders = [
    'authorization', 
    'x-api-key', 
    'cookie', 
    'x-auth-token',
    'x-access-token',
    'bearer'
  ];
  
  sensitiveHeaders.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

// Enhanced error factory with automatic logging
export const createAndLogError = (
  code: ErrorCode,
  message: string,
  req?: Request,
  details?: Record<string, any>,
  originalError?: Error
): AppError => {
  const requestId = generateRequestId(req);
  const clientInfo = req ? extractClientInfo(req) : undefined;
  
  // Create the error with detailed message
  const detailedMessage = getDetailedErrorMessage(code, details);
  const error = new AppError(code, detailedMessage, getStatusCodeFromErrorCode(code), details, requestId);
  
  // Log the error with context
  logger.error('Application Error Created', {
    requestId,
    errorCode: code,
    message: detailedMessage,
    originalMessage: message,
    details,
    clientInfo,
    suggestion: getErrorSuggestion(code),
    ...(originalError && {
      originalError: {
        name: originalError.name,
        message: originalError.message,
        stack: originalError.stack
      }
    })
  });
  
  return error;
};

// Get HTTP status code from error code
export const getStatusCodeFromErrorCode = (code: ErrorCode): number => {
  const statusMap: Record<ErrorCode, number> = {
    [ErrorCode.INVALID_FORMAT]: 400,
    [ErrorCode.FILE_TOO_LARGE]: 400,
    [ErrorCode.INVALID_REQUEST]: 400,
    [ErrorCode.UNAUTHORIZED]: 401,
    [ErrorCode.POOR_IMAGE_QUALITY]: 422,
    [ErrorCode.NO_TEXT_DETECTED]: 422,
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
    [ErrorCode.PROCESSING_ERROR]: 500,
    [ErrorCode.SERVICE_UNAVAILABLE]: 503
  };

  return statusMap[code] || 500;
};

// Specific error creators with enhanced logging
export const handleFileValidationError = (
  format: string, 
  req?: Request
): AppError => {
  logSecurityEvent('Invalid file format attempted', {
    requestId: generateRequestId(req),
    attemptedFormat: format,
    clientInfo: req ? extractClientInfo(req) : undefined
  });
  
  return createAndLogError(
    ErrorCode.INVALID_FORMAT,
    'Invalid file format',
    req,
    { receivedFormat: format, supportedFormats: ['JPEG', 'PNG', 'PDF'] }
  );
};

export const handleFileSizeError = (
  size: number, 
  maxSize: number, 
  req?: Request
): AppError => {
  return createAndLogError(
    ErrorCode.FILE_TOO_LARGE,
    'File too large',
    req,
    { receivedSize: size, maxSize }
  );
};

export const handleImageQualityError = (
  confidence: number, 
  req?: Request
): AppError => {
  return createAndLogError(
    ErrorCode.POOR_IMAGE_QUALITY,
    'Poor image quality',
    req,
    { ocrConfidence: confidence, minimumRequired: 0.3 }
  );
};

export const handleNoTextError = (req?: Request): AppError => {
  return createAndLogError(
    ErrorCode.NO_TEXT_DETECTED,
    'No text detected',
    req
  );
};

export const handleRateLimitError = (
  limit: number, 
  resetTime: Date, 
  req?: Request
): AppError => {
  logSecurityEvent('Rate limit exceeded', {
    requestId: generateRequestId(req),
    limit,
    resetTime,
    clientInfo: req ? extractClientInfo(req) : undefined
  });
  
  return createAndLogError(
    ErrorCode.RATE_LIMIT_EXCEEDED,
    'Rate limit exceeded',
    req,
    { 
      limit, 
      resetTime, 
      retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000) 
    }
  );
};

export const handleProcessingError = (
  originalError: Error, 
  req?: Request,
  service?: string
): AppError => {
  return createAndLogError(
    ErrorCode.PROCESSING_ERROR,
    'Processing error',
    req,
    { service, originalError: originalError.message },
    originalError
  );
};

export const handleServiceUnavailableError = (
  service: string, 
  req?: Request
): AppError => {
  return createAndLogError(
    ErrorCode.SERVICE_UNAVAILABLE,
    'Service unavailable',
    req,
    { unavailableService: service, retryAfter: 300 }
  );
};

export const handleAuthenticationError = (
  reason: string, 
  req?: Request
): AppError => {
  logSecurityEvent('Authentication failed', {
    requestId: generateRequestId(req),
    reason,
    clientInfo: req ? extractClientInfo(req) : undefined
  });
  
  return createAndLogError(
    ErrorCode.UNAUTHORIZED,
    'Authentication failed',
    req,
    { reason }
  );
};

// Error recovery suggestions
export const getRecoveryActions = (code: ErrorCode): string[] => {
  const actions: Record<ErrorCode, string[]> = {
    [ErrorCode.INVALID_FORMAT]: [
      'Convertir l\'image en format JPEG, PNG ou PDF',
      'Vérifier l\'extension du fichier',
      'Utiliser un outil de conversion d\'image'
    ],
    [ErrorCode.FILE_TOO_LARGE]: [
      'Compresser l\'image avant l\'upload',
      'Réduire la résolution de l\'image',
      'Utiliser un format plus efficace (JPEG au lieu de PNG)'
    ],
    [ErrorCode.POOR_IMAGE_QUALITY]: [
      'Prendre une nouvelle photo avec un meilleur éclairage',
      'Éviter le flou de mouvement',
      'S\'assurer que le texte est lisible à l\'œil nu'
    ],
    [ErrorCode.NO_TEXT_DETECTED]: [
      'Vérifier que l\'image contient bien un reçu',
      'Améliorer la qualité de l\'image',
      'S\'assurer que le reçu est entièrement visible'
    ],
    [ErrorCode.RATE_LIMIT_EXCEEDED]: [
      'Attendre avant de faire une nouvelle requête',
      'Contacter le support pour augmenter la limite',
      'Optimiser l\'utilisation de l\'API'
    ],
    [ErrorCode.PROCESSING_ERROR]: [
      'Réessayer la requête',
      'Vérifier la qualité de l\'image',
      'Contacter le support technique si le problème persiste'
    ],
    [ErrorCode.SERVICE_UNAVAILABLE]: [
      'Réessayer dans quelques minutes',
      'Vérifier le statut des services',
      'Implémenter une logique de retry avec backoff'
    ],
    [ErrorCode.UNAUTHORIZED]: [
      'Vérifier la clé API',
      'Renouveler les tokens d\'authentification',
      'Contacter l\'administrateur pour les permissions'
    ],
    [ErrorCode.INVALID_REQUEST]: [
      'Vérifier les paramètres de la requête',
      'Consulter la documentation API',
      'Valider le format des données envoyées'
    ]
  };

  return actions[code] || ['Consulter la documentation', 'Contacter le support technique'];
};

// Performance monitoring for error patterns
export const trackErrorPattern = (code: ErrorCode, req?: Request) => {
  const clientInfo = req ? extractClientInfo(req) : undefined;
  
  logger.info('Error Pattern Tracked', {
    errorCode: code,
    timestamp: new Date().toISOString(),
    clientInfo,
    pattern: 'error_occurrence'
  });
};

// Error context enrichment
export const enrichErrorContext = (
  error: AppError, 
  additionalContext?: Record<string, any>
): AppError => {
  if (additionalContext) {
    // Create a new error with enriched context since details is readonly
    return new AppError(
      error.code,
      error.message,
      error.statusCode,
      {
        ...error.details,
        ...additionalContext
      },
      error.requestId
    );
  }
  
  return error;
};