import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { CustomError } from './errorHandler';
import { sanitize, validate } from '../utils/security';
import { logger } from '../utils/logger';

/**
 * Enhanced validation middleware with input sanitization
 */
export const validateRequest = (schema: {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
  sanitize?: boolean;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];
    const sanitizeInputs = schema.sanitize !== false; // Default to true

    try {
      // Sanitize inputs before validation if enabled
      if (sanitizeInputs) {
        req.body = sanitizeObject(req.body);
        req.query = sanitizeObject(req.query);
        req.params = sanitizeObject(req.params);
      }

      // Validate request body
      if (schema.body) {
        const { error, value } = schema.body.validate(req.body, { 
          abortEarly: false,
          stripUnknown: true 
        });
        if (error) {
          errors.push(`Body: ${error.details.map(d => d.message).join(', ')}`);
        } else {
          req.body = value; // Use validated and cleaned value
        }
      }

      // Validate query parameters
      if (schema.query) {
        const { error, value } = schema.query.validate(req.query, { 
          abortEarly: false,
          stripUnknown: true 
        });
        if (error) {
          errors.push(`Query: ${error.details.map(d => d.message).join(', ')}`);
        } else {
          req.query = value;
        }
      }

      // Validate path parameters
      if (schema.params) {
        const { error, value } = schema.params.validate(req.params, { 
          abortEarly: false,
          stripUnknown: true 
        });
        if (error) {
          errors.push(`Params: ${error.details.map(d => d.message).join(', ')}`);
        } else {
          req.params = value;
        }
      }

      if (errors.length > 0) {
        logger.warn('Validation failed', {
          path: req.path,
          method: req.method,
          clientId: req.clientId,
          errors,
          ip: req.ip
        });

        throw new CustomError(
          'Validation des données échouée',
          400,
          'VALIDATION_ERROR',
          { validationErrors: errors }
        );
      }

      next();
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }
      
      logger.error('Validation middleware error', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        method: req.method
      });
      
      throw new CustomError(
        'Erreur de validation interne',
        500,
        'INTERNAL_VALIDATION_ERROR'
      );
    }
  };
};

/**
 * Sanitize object recursively
 */
const sanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitize.text(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = sanitize.text(key, 100); // Limit key length
      if (sanitizedKey) {
        sanitized[sanitizedKey] = sanitizeObject(value);
      }
    }
    return sanitized;
  }

  return obj;
};

/**
 * Input sanitization middleware
 */
export const sanitizeInputs = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Sanitize common input fields
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }
    
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    // Sanitize headers (but preserve original for authentication)
    const sensitiveHeaders = ['x-api-key', 'authorization'];
    const sanitizedHeaders: any = {};
    
    Object.entries(req.headers).forEach(([key, value]) => {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitizedHeaders[key] = value; // Keep original for auth
      } else if (typeof value === 'string') {
        sanitizedHeaders[key] = sanitize.text(value, 500);
      } else {
        sanitizedHeaders[key] = value;
      }
    });

    // Store sanitized headers for logging (don't replace original)
    req.sanitizedHeaders = sanitizedHeaders;

    next();
  } catch (error) {
    logger.error('Input sanitization failed', {
      error: error instanceof Error ? error.message : String(error),
      path: req.path,
      method: req.method
    });
    
    throw new CustomError(
      'Erreur de traitement des données d\'entrée',
      400,
      'INPUT_SANITIZATION_ERROR'
    );
  }
};

// Enhanced validation schemas with security considerations
export const schemas = {
  receiptId: Joi.object({
    id: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'L\'ID doit être un UUID valide',
        'any.required': 'L\'ID est requis',
        'string.empty': 'L\'ID ne peut pas être vide'
      })
  }),
  
  analyzeRequest: Joi.object({
    clientId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.guid': 'L\'ID client doit être un UUID valide'
      }),
    metadata: Joi.object({
      source: Joi.string()
        .max(50)
        .pattern(/^[a-zA-Z0-9_\-\s]+$/)
        .optional()
        .messages({
          'string.max': 'La source ne peut pas dépasser 50 caractères',
          'string.pattern.base': 'La source contient des caractères non autorisés'
        }),
      expectedType: Joi.string()
        .valid('retail', 'card_payment', 'cash_register')
        .optional()
        .messages({
          'any.only': 'Le type attendu doit être: retail, card_payment, ou cash_register'
        })
    }).optional()
  }).options({ allowUnknown: false }),

  // API Key validation
  apiKey: Joi.string()
    .pattern(/^[a-zA-Z0-9_\-]{16,}$/)
    .required()
    .messages({
      'string.pattern.base': 'Format de clé API invalide',
      'any.required': 'Clé API requise',
      'string.empty': 'La clé API ne peut pas être vide'
    }),

  // File upload validation
  fileUpload: Joi.object({
    originalname: Joi.string()
      .max(255)
      .pattern(/^[a-zA-Z0-9._\-\s]+$/)
      .required()
      .messages({
        'string.max': 'Le nom de fichier ne peut pas dépasser 255 caractères',
        'string.pattern.base': 'Le nom de fichier contient des caractères non autorisés',
        'any.required': 'Nom de fichier requis'
      }),
    mimetype: Joi.string()
      .valid('image/jpeg', 'image/jpg', 'image/png', 'application/pdf')
      .required()
      .messages({
        'any.only': 'Type de fichier non supporté. Formats acceptés: JPEG, PNG, PDF',
        'any.required': 'Type de fichier requis'
      }),
    size: Joi.number()
      .max(10485760) // 10MB
      .positive()
      .required()
      .messages({
        'number.max': 'La taille du fichier ne peut pas dépasser 10MB',
        'number.positive': 'La taille du fichier doit être positive',
        'any.required': 'Taille de fichier requise'
      })
  }),

  // Query parameters validation
  statusQuery: Joi.object({
    includeMetadata: Joi.boolean()
      .optional()
      .default(false),
    format: Joi.string()
      .valid('json', 'summary')
      .optional()
      .default('json')
  }),

  // Pagination validation
  pagination: Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .max(1000)
      .optional()
      .default(1)
      .messages({
        'number.min': 'Le numéro de page doit être au moins 1',
        'number.max': 'Le numéro de page ne peut pas dépasser 1000'
      }),
    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .messages({
        'number.min': 'La limite doit être au moins 1',
        'number.max': 'La limite ne peut pas dépasser 100'
      })
  }),

  // Health check validation
  healthCheck: Joi.object({
    detailed: Joi.boolean()
      .optional()
      .default(false)
  }),

  // Admin operations validation
  adminOperation: Joi.object({
    action: Joi.string()
      .valid('reset_rate_limit', 'clear_cache', 'get_stats')
      .required()
      .messages({
        'any.only': 'Action non autorisée',
        'any.required': 'Action requise'
      }),
    target: Joi.string()
      .when('action', {
        is: 'reset_rate_limit',
        then: Joi.string().uuid().required(),
        otherwise: Joi.optional()
      })
      .messages({
        'string.guid': 'L\'ID cible doit être un UUID valide',
        'any.required': 'Cible requise pour cette action'
      })
  })
};

/**
 * Custom Joi extensions for additional validation
 */
export const customValidators = {
  /**
   * Validate that a string doesn't contain SQL injection patterns
   */
  noSqlInjection: (value: string): boolean => {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(--|\/\*|\*\/|;|'|")/,
      /(\b(OR|AND)\b.*=.*)/i
    ];
    
    return !sqlPatterns.some(pattern => pattern.test(value));
  },

  /**
   * Validate that a string doesn't contain XSS patterns
   */
  noXss: (value: string): boolean => {
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<[^>]*>/g
    ];
    
    return !xssPatterns.some(pattern => pattern.test(value));
  },

  /**
   * Validate file extension against allowed types
   */
  allowedFileExtension: (filename: string, allowedExtensions: string[]): boolean => {
    const ext = filename.toLowerCase().split('.').pop();
    return ext ? allowedExtensions.includes(ext) : false;
  }
};