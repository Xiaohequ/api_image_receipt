import {
  ReceiptStatus,
  ReceiptType,
  ImageFormat,
  ErrorCode,
  ReceiptAnalysisRequest,
  ExtractedReceiptData,
  AnalysisResponse,
  ApiError,
  ValidationError,
  HealthCheckResponse,
  ImageMetadata,
  ExtractedField,
  ReceiptItem
} from './index';

// Type guard functions for runtime type checking

export const isReceiptStatus = (value: any): value is ReceiptStatus => {
  return Object.values(ReceiptStatus).includes(value);
};

export const isReceiptType = (value: any): value is ReceiptType => {
  return Object.values(ReceiptType).includes(value);
};

export const isImageFormat = (value: any): value is ImageFormat => {
  return Object.values(ImageFormat).includes(value);
};

export const isErrorCode = (value: any): value is ErrorCode => {
  return Object.values(ErrorCode).includes(value);
};

export const isImageMetadata = (value: any): value is ImageMetadata => {
  return (
    typeof value === 'object' &&
    value !== null &&
    isImageFormat(value.format) &&
    typeof value.size === 'number' &&
    typeof value.dimensions === 'object' &&
    typeof value.dimensions.width === 'number' &&
    typeof value.dimensions.height === 'number' &&
    typeof value.mimeType === 'string'
  );
};

export const isExtractedField = <T>(value: any): value is ExtractedField<T> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof value.confidence === 'number' &&
    value.confidence >= 0 &&
    value.confidence <= 1
  );
};

export const isReceiptItem = (value: any): value is ReceiptItem => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    (value.quantity === undefined || typeof value.quantity === 'number') &&
    (value.unitPrice === undefined || typeof value.unitPrice === 'number') &&
    (value.totalPrice === undefined || typeof value.totalPrice === 'number')
  );
};

export const isReceiptAnalysisRequest = (value: any): value is ReceiptAnalysisRequest => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.id === 'string' &&
    typeof value.clientId === 'string' &&
    typeof value.imageUrl === 'string' &&
    isImageMetadata(value.imageMetadata) &&
    isReceiptStatus(value.status) &&
    value.createdAt instanceof Date &&
    value.updatedAt instanceof Date
  );
};

export const isExtractedReceiptData = (value: any): value is ExtractedReceiptData => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.requestId === 'string' &&
    isReceiptType(value.receiptType) &&
    typeof value.extractedFields === 'object' &&
    value.extractedFields !== null &&
    isExtractedField(value.extractedFields.totalAmount) &&
    typeof value.extractedFields.totalAmount.currency === 'string' &&
    isExtractedField(value.extractedFields.date) &&
    isExtractedField(value.extractedFields.merchantName) &&
    Array.isArray(value.extractedFields.items) &&
    value.extractedFields.items.every(isReceiptItem) &&
    typeof value.extractedFields.summary === 'string' &&
    typeof value.processingMetadata === 'object' &&
    value.processingMetadata !== null &&
    typeof value.processingMetadata.processingTime === 'number' &&
    typeof value.processingMetadata.ocrConfidence === 'number' &&
    typeof value.processingMetadata.aiConfidence === 'number' &&
    typeof value.processingMetadata.imagePreprocessed === 'boolean' &&
    value.extractedAt instanceof Date
  );
};

export const isApiError = (value: any): value is ApiError => {
  return (
    typeof value === 'object' &&
    value !== null &&
    isErrorCode(value.code) &&
    typeof value.message === 'string' &&
    value.timestamp instanceof Date
  );
};

export const isValidationError = (value: any): value is ValidationError => {
  return (
    isApiError(value) &&
    value.code === ErrorCode.INVALID_REQUEST &&
    Array.isArray(value.details) &&
    value.details.every((detail: any) =>
      typeof detail === 'object' &&
      detail !== null &&
      typeof detail.field === 'string' &&
      typeof detail.constraint === 'string'
    )
  );
};

export const isAnalysisResponse = <T>(value: any): value is AnalysisResponse<T> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.success === 'boolean' &&
    typeof value.requestId === 'string' &&
    typeof value.processingTime === 'number' &&
    value.timestamp instanceof Date &&
    (value.error === undefined || isApiError(value.error))
  );
};

export const isHealthCheckResponse = (value: any): value is HealthCheckResponse => {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['healthy', 'unhealthy', 'degraded'].includes(value.status) &&
    value.timestamp instanceof Date &&
    typeof value.services === 'object' &&
    value.services !== null &&
    ['up', 'down'].includes(value.services.database) &&
    ['up', 'down'].includes(value.services.redis) &&
    ['up', 'down'].includes(value.services.ocr) &&
    ['up', 'down'].includes(value.services.storage) &&
    typeof value.version === 'string' &&
    typeof value.uptime === 'number'
  );
};

// Utility functions for type conversion and validation

export const parseReceiptStatus = (value: string): ReceiptStatus | null => {
  return isReceiptStatus(value) ? value : null;
};

export const parseReceiptType = (value: string): ReceiptType | null => {
  return isReceiptType(value) ? value : null;
};

export const parseImageFormat = (value: string): ImageFormat | null => {
  const normalized = value.toLowerCase();
  return isImageFormat(normalized as ImageFormat) ? (normalized as ImageFormat) : null;
};

export const isValidUUID = (value: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

export const isValidISODate = (value: string): boolean => {
  const date = new Date(value);
  return !isNaN(date.getTime()) && value === date.toISOString();
};

export const isValidCurrency = (value: string): boolean => {
  const supportedCurrencies = ['EUR', 'USD', 'GBP', 'CAD', 'CHF'];
  return supportedCurrencies.includes(value.toUpperCase());
};

export const isValidConfidence = (value: number): boolean => {
  return typeof value === 'number' && value >= 0 && value <= 1;
};

export const isValidAmount = (value: number): boolean => {
  return typeof value === 'number' && value >= 0 && value <= 999999.99 && Number.isFinite(value);
};

export const isValidImageSize = (size: number): boolean => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  return typeof size === 'number' && size > 0 && size <= maxSize;
};

export const isValidMimeType = (mimeType: string): boolean => {
  const validMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/pdf'
  ];
  return validMimeTypes.includes(mimeType.toLowerCase());
};

// Helper functions for data transformation

export const normalizeImageFormat = (format: string): ImageFormat | null => {
  const normalized = format.toLowerCase().replace('.', '');
  switch (normalized) {
    case 'jpg':
    case 'jpeg':
      return ImageFormat.JPEG;
    case 'png':
      return ImageFormat.PNG;
    case 'pdf':
      return ImageFormat.PDF;
    default:
      return null;
  }
};

export const normalizeCurrency = (currency: string): string => {
  return currency.toUpperCase();
};

export const roundConfidence = (confidence: number): number => {
  return Math.round(confidence * 1000) / 1000; // Round to 3 decimal places
};

export const roundAmount = (amount: number): number => {
  return Math.round(amount * 100) / 100; // Round to 2 decimal places
};

// Validation helper functions

export const validateAndParseDate = (dateString: string): Date | null => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch {
    return null;
  }
};

export const sanitizeString = (value: string, maxLength?: number): string => {
  let sanitized = value.trim().replace(/\s+/g, ' '); // Normalize whitespace
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).trim();
  }
  return sanitized;
};

export const extractFileExtension = (filename: string): string | null => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || null : null;
};