// Type definitions for the Receipt Analyzer API

// Enums for better type safety
export enum ReceiptStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum ReceiptType {
  RETAIL = 'retail',
  CARD_PAYMENT = 'card_payment',
  CASH_REGISTER = 'cash_register',
  UNKNOWN = 'unknown'
}

export enum ImageFormat {
  JPEG = 'jpeg',
  JPG = 'jpg',
  PNG = 'png',
  PDF = 'pdf'
}

export enum ErrorCode {
  INVALID_FORMAT = 'INVALID_FORMAT',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  POOR_IMAGE_QUALITY = 'POOR_IMAGE_QUALITY',
  NO_TEXT_DETECTED = 'NO_TEXT_DETECTED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED'
}

// Core data interfaces
export interface ImageMetadata {
  format: ImageFormat;
  size: number;
  dimensions: {
    width: number;
    height: number;
  };
  originalName?: string;
  mimeType: string;
}

export interface ReceiptAnalysisRequest {
  id: string;
  clientId: string;
  imageUrl: string;
  imageMetadata: ImageMetadata;
  status: ReceiptStatus;
  createdAt: Date;
  updatedAt: Date;
  metadata?: {
    source?: string;
    expectedType?: ReceiptType;
    priority?: 'low' | 'normal' | 'high';
  };
}

export interface ReceiptItem {
  name: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  category?: string;
}

export interface ExtractedField<T = any> {
  value: T;
  confidence: number;
  rawText?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ExtractedReceiptData {
  requestId: string;
  receiptType: ReceiptType;
  extractedFields: {
    totalAmount: ExtractedField<number> & {
      currency: string;
    };
    date: ExtractedField<string>; // ISO 8601 format
    merchantName: ExtractedField<string>;
    items: ReceiptItem[];
    summary: string;
    taxAmount?: ExtractedField<number>;
    subtotal?: ExtractedField<number>;
    paymentMethod?: ExtractedField<string>;
    receiptNumber?: ExtractedField<string>;
  };
  processingMetadata: {
    processingTime: number;
    ocrConfidence: number;
    aiConfidence: number;
    imagePreprocessed: boolean;
    detectedLanguage?: string;
  };
  extractedAt: Date;
}

// API Request/Response interfaces
export interface UploadRequest {
  clientId?: string;
  metadata?: {
    source?: string;
    expectedType?: ReceiptType;
  };
}

export interface UploadResponse {
  requestId: string;
  status: ReceiptStatus;
  estimatedProcessingTime: number;
  message: string;
}

export interface StatusResponse {
  requestId: string;
  status: ReceiptStatus;
  progress?: number;
  estimatedTimeRemaining?: number;
  message?: string;
}

export interface ResultResponse {
  requestId: string;
  status: ReceiptStatus;
  data?: ExtractedReceiptData;
  createdAt: Date;
  completedAt?: Date;
}

// Error handling interfaces
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
  requestId?: string;
}

export interface ValidationError extends ApiError {
  code: ErrorCode.INVALID_REQUEST;
  details: {
    field: string;
    value: any;
    constraint: string;
  }[];
}

export interface AnalysisResponse<T = any> {
  success: boolean;
  requestId: string;
  data?: T;
  error?: ApiError;
  processingTime: number;
  timestamp: Date;
}

// Health check interface
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
    ocr: 'up' | 'down';
    storage: 'up' | 'down';
  };
  version: string;
  uptime: number;
}

// Rate limiting interface
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;
}

// Pagination interface
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy: 'createdAt' | 'updatedAt' | 'status';
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Processing queue interfaces
export interface QueueJob {
  id: string;
  requestId: string;
  imageUrl: string;
  priority: 'low' | 'normal' | 'high';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  failedAt?: Date;
  error?: string;
}

export interface ProcessingStats {
  totalProcessed: number;
  successRate: number;
  averageProcessingTime: number;
  queueLength: number;
  activeJobs: number;
  failedJobs: number;
}

// Export validation schemas, error classes, and type guards
export * from './validation';
export * from './errors';
export {
  isReceiptStatus,
  isReceiptType,
  isImageFormat,
  isErrorCode,
  isImageMetadata,
  isExtractedField,
  isReceiptItem,
  isReceiptAnalysisRequest,
  isExtractedReceiptData,
  isApiError,
  isAnalysisResponse,
  isHealthCheckResponse,
  parseReceiptStatus,
  parseReceiptType,
  parseImageFormat,
  isValidUUID,
  isValidISODate,
  isValidCurrency,
  isValidConfidence,
  isValidAmount,
  isValidImageSize,
  isValidMimeType,
  normalizeImageFormat,
  normalizeCurrency,
  roundConfidence,
  roundAmount,
  validateAndParseDate,
  sanitizeString,
  extractFileExtension
} from './guards';