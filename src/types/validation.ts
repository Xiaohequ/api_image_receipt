import { ReceiptStatus, ReceiptType, ImageFormat, ErrorCode } from './index';

// Import Joi with basic typing
declare const require: any;
const Joi = require('joi');

// Constants for validation
export const VALIDATION_CONSTANTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_FORMATS: Object.values(ImageFormat),
  MAX_FILENAME_LENGTH: 255,
  MIN_CONFIDENCE: 0,
  MAX_CONFIDENCE: 1,
  MAX_PROCESSING_TIME: 300000, // 5 minutes in milliseconds
  MAX_SUMMARY_LENGTH: 1000,
  MAX_ITEM_NAME_LENGTH: 200,
  MAX_MERCHANT_NAME_LENGTH: 100,
  SUPPORTED_CURRENCIES: ['EUR', 'USD', 'GBP', 'CAD', 'CHF'],
  MAX_AMOUNT: 999999.99,
  MIN_AMOUNT: 0
} as const;

// Base schemas
export const imageMetadataSchema: any = Joi.object({
  format: Joi.string().valid(...Object.values(ImageFormat)).required(),
  size: Joi.number().integer().min(1).max(VALIDATION_CONSTANTS.MAX_FILE_SIZE).required(),
  dimensions: Joi.object({
    width: Joi.number().integer().min(1).max(10000).required(),
    height: Joi.number().integer().min(1).max(10000).required()
  }).required(),
  originalName: Joi.string().max(VALIDATION_CONSTANTS.MAX_FILENAME_LENGTH).optional(),
  mimeType: Joi.string().pattern(/^image\/(jpeg|jpg|png)|application\/pdf$/).required()
});

export const extractedFieldSchema: any = Joi.object({
  value: Joi.any().required(),
  confidence: Joi.number().min(VALIDATION_CONSTANTS.MIN_CONFIDENCE).max(VALIDATION_CONSTANTS.MAX_CONFIDENCE).required(),
  rawText: Joi.string().optional(),
  boundingBox: Joi.object({
    x: Joi.number().min(0).required(),
    y: Joi.number().min(0).required(),
    width: Joi.number().min(0).required(),
    height: Joi.number().min(0).required()
  }).optional()
});

export const receiptItemSchema: any = Joi.object({
  name: Joi.string().min(1).max(VALIDATION_CONSTANTS.MAX_ITEM_NAME_LENGTH).required(),
  quantity: Joi.number().min(0).optional(),
  unitPrice: Joi.number().min(0).max(VALIDATION_CONSTANTS.MAX_AMOUNT).optional(),
  totalPrice: Joi.number().min(0).max(VALIDATION_CONSTANTS.MAX_AMOUNT).optional(),
  category: Joi.string().max(50).optional()
});

// Request validation schemas
export const uploadRequestSchema: any = Joi.object({
  clientId: Joi.string().uuid().optional(),
  metadata: Joi.object({
    source: Joi.string().max(50).optional(),
    expectedType: Joi.string().valid(...Object.values(ReceiptType)).optional()
  }).optional()
});

export const receiptAnalysisRequestSchema: any = Joi.object({
  id: Joi.string().uuid().required(),
  clientId: Joi.string().uuid().required(),
  imageUrl: Joi.string().uri().required(),
  imageMetadata: imageMetadataSchema.required(),
  status: Joi.string().valid(...Object.values(ReceiptStatus)).required(),
  createdAt: Joi.date().required(),
  updatedAt: Joi.date().required(),
  metadata: Joi.object({
    source: Joi.string().max(50).optional(),
    expectedType: Joi.string().valid(...Object.values(ReceiptType)).optional(),
    priority: Joi.string().valid('low', 'normal', 'high').optional()
  }).optional()
});

export const extractedReceiptDataSchema: any = Joi.object({
  requestId: Joi.string().uuid().required(),
  receiptType: Joi.string().valid(...Object.values(ReceiptType)).required(),
  extractedFields: Joi.object({
    totalAmount: extractedFieldSchema.keys({
      value: Joi.number().min(VALIDATION_CONSTANTS.MIN_AMOUNT).max(VALIDATION_CONSTANTS.MAX_AMOUNT).required(),
      currency: Joi.string().valid(...VALIDATION_CONSTANTS.SUPPORTED_CURRENCIES).required()
    }).required(),
    date: extractedFieldSchema.keys({
      value: Joi.string().isoDate().required()
    }).required(),
    merchantName: extractedFieldSchema.keys({
      value: Joi.string().min(1).max(VALIDATION_CONSTANTS.MAX_MERCHANT_NAME_LENGTH).required()
    }).required(),
    items: Joi.array().items(receiptItemSchema).min(0).max(100).required(),
    summary: Joi.string().max(VALIDATION_CONSTANTS.MAX_SUMMARY_LENGTH).required(),
    taxAmount: extractedFieldSchema.keys({
      value: Joi.number().min(0).max(VALIDATION_CONSTANTS.MAX_AMOUNT).required()
    }).optional(),
    subtotal: extractedFieldSchema.keys({
      value: Joi.number().min(0).max(VALIDATION_CONSTANTS.MAX_AMOUNT).required()
    }).optional(),
    paymentMethod: extractedFieldSchema.keys({
      value: Joi.string().max(50).required()
    }).optional(),
    receiptNumber: extractedFieldSchema.keys({
      value: Joi.string().max(50).required()
    }).optional()
  }).required(),
  processingMetadata: Joi.object({
    processingTime: Joi.number().integer().min(0).max(VALIDATION_CONSTANTS.MAX_PROCESSING_TIME).required(),
    ocrConfidence: Joi.number().min(VALIDATION_CONSTANTS.MIN_CONFIDENCE).max(VALIDATION_CONSTANTS.MAX_CONFIDENCE).required(),
    aiConfidence: Joi.number().min(VALIDATION_CONSTANTS.MIN_CONFIDENCE).max(VALIDATION_CONSTANTS.MAX_CONFIDENCE).required(),
    imagePreprocessed: Joi.boolean().required(),
    detectedLanguage: Joi.string().length(2).optional()
  }).required(),
  extractedAt: Joi.date().required()
});

// Response validation schemas
export const uploadResponseSchema: any = Joi.object({
  requestId: Joi.string().uuid().required(),
  status: Joi.string().valid(...Object.values(ReceiptStatus)).required(),
  estimatedProcessingTime: Joi.number().integer().min(0).required(),
  message: Joi.string().required()
});

export const statusResponseSchema: any = Joi.object({
  requestId: Joi.string().uuid().required(),
  status: Joi.string().valid(...Object.values(ReceiptStatus)).required(),
  progress: Joi.number().min(0).max(100).optional(),
  estimatedTimeRemaining: Joi.number().integer().min(0).optional(),
  message: Joi.string().optional()
});

export const resultResponseSchema: any = Joi.object({
  requestId: Joi.string().uuid().required(),
  status: Joi.string().valid(...Object.values(ReceiptStatus)).required(),
  data: extractedReceiptDataSchema.optional(),
  createdAt: Joi.date().required(),
  completedAt: Joi.date().optional()
});

// Error validation schemas
export const apiErrorSchema: any = Joi.object({
  code: Joi.string().valid(...Object.values(ErrorCode)).required(),
  message: Joi.string().required(),
  details: Joi.object().optional(),
  timestamp: Joi.date().required(),
  requestId: Joi.string().uuid().optional()
});

export const validationErrorSchema: any = apiErrorSchema.keys({
  code: Joi.string().valid(ErrorCode.INVALID_REQUEST).required(),
  details: Joi.array().items(
    Joi.object({
      field: Joi.string().required(),
      value: Joi.any().required(),
      constraint: Joi.string().required()
    })
  ).required()
});

export const analysisResponseSchema: any = Joi.object({
  success: Joi.boolean().required(),
  requestId: Joi.string().uuid().required(),
  data: Joi.any().optional(),
  error: apiErrorSchema.optional(),
  processingTime: Joi.number().integer().min(0).required(),
  timestamp: Joi.date().required()
});

// Health check validation schema
export const healthCheckResponseSchema: any = Joi.object({
  status: Joi.string().valid('healthy', 'unhealthy', 'degraded').required(),
  timestamp: Joi.date().required(),
  services: Joi.object({
    database: Joi.string().valid('up', 'down').required(),
    redis: Joi.string().valid('up', 'down').required(),
    ocr: Joi.string().valid('up', 'down').required(),
    storage: Joi.string().valid('up', 'down').required()
  }).required(),
  version: Joi.string().required(),
  uptime: Joi.number().integer().min(0).required()
});

// Rate limiting validation schema
export const rateLimitInfoSchema: any = Joi.object({
  limit: Joi.number().integer().min(1).required(),
  remaining: Joi.number().integer().min(0).required(),
  resetTime: Joi.date().required(),
  retryAfter: Joi.number().integer().min(0).optional()
});

// File upload validation schema (for multer)
export const fileUploadSchema: any = Joi.object({
  fieldname: Joi.string().required(),
  originalname: Joi.string().max(VALIDATION_CONSTANTS.MAX_FILENAME_LENGTH).required(),
  encoding: Joi.string().required(),
  mimetype: Joi.string().pattern(/^image\/(jpeg|jpg|png)|application\/pdf$/).required(),
  size: Joi.number().integer().min(1).max(VALIDATION_CONSTANTS.MAX_FILE_SIZE).required(),
  buffer: Joi.binary().required()
});

// Query parameter validation schemas
export const paginationSchema: any = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'status'),
  sortOrder: Joi.string().valid('asc', 'desc')
});

export const requestIdParamSchema: any = Joi.object({
  requestId: Joi.string().uuid().required()
});

// Custom validation functions
export const validateImageFormat = (filename: string): boolean => {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension ? VALIDATION_CONSTANTS.SUPPORTED_FORMATS.includes(extension as ImageFormat) : false;
};

export const validateCurrency = (currency: string): boolean => {
  return VALIDATION_CONSTANTS.SUPPORTED_CURRENCIES.includes(currency as any);
};

export const validateConfidenceScore = (confidence: number): boolean => {
  return confidence >= VALIDATION_CONSTANTS.MIN_CONFIDENCE && confidence <= VALIDATION_CONSTANTS.MAX_CONFIDENCE;
};

// Validation helper functions
export const createValidationError = (field: string, value: any, constraint: string) => ({
  field,
  value,
  constraint
});

export const formatJoiError = (error: any): { field: string; value: any; constraint: string }[] => {
  return error.details.map((detail: any) => ({
    field: detail.path.join('.'),
    value: detail.context?.value,
    constraint: detail.message
  }));
};