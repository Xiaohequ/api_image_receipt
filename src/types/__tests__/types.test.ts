import {
  ReceiptStatus,
  ReceiptType,
  ImageFormat,
  ErrorCode,
  ReceiptAnalysisRequest,
  ExtractedReceiptData,
  isReceiptStatus,
  isReceiptType,
  isValidUUID,
  isValidAmount,
  normalizeImageFormat,
  createInvalidFormatError,
  uploadRequestSchema,
  VALIDATION_CONSTANTS
} from '../index';

describe('Type System Tests', () => {
  describe('Enums', () => {
    test('ReceiptStatus enum should have correct values', () => {
      expect(ReceiptStatus.PENDING).toBe('pending');
      expect(ReceiptStatus.PROCESSING).toBe('processing');
      expect(ReceiptStatus.COMPLETED).toBe('completed');
      expect(ReceiptStatus.FAILED).toBe('failed');
    });

    test('ReceiptType enum should have correct values', () => {
      expect(ReceiptType.RETAIL).toBe('retail');
      expect(ReceiptType.CARD_PAYMENT).toBe('card_payment');
      expect(ReceiptType.CASH_REGISTER).toBe('cash_register');
      expect(ReceiptType.UNKNOWN).toBe('unknown');
    });

    test('ImageFormat enum should have correct values', () => {
      expect(ImageFormat.JPEG).toBe('jpeg');
      expect(ImageFormat.PNG).toBe('png');
      expect(ImageFormat.PDF).toBe('pdf');
    });
  });

  describe('Type Guards', () => {
    test('isReceiptStatus should validate receipt status correctly', () => {
      expect(isReceiptStatus('pending')).toBe(true);
      expect(isReceiptStatus('invalid')).toBe(false);
    });

    test('isReceiptType should validate receipt type correctly', () => {
      expect(isReceiptType('retail')).toBe(true);
      expect(isReceiptType('invalid')).toBe(false);
    });

    test('isValidUUID should validate UUIDs correctly', () => {
      expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidUUID('invalid-uuid')).toBe(false);
    });

    test('isValidAmount should validate amounts correctly', () => {
      expect(isValidAmount(10.50)).toBe(true);
      expect(isValidAmount(-5)).toBe(false);
      expect(isValidAmount(1000000)).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    test('normalizeImageFormat should normalize formats correctly', () => {
      expect(normalizeImageFormat('JPG')).toBe(ImageFormat.JPEG);
      expect(normalizeImageFormat('png')).toBe(ImageFormat.PNG);
      expect(normalizeImageFormat('invalid')).toBe(null);
    });
  });

  describe('Error Creation', () => {
    test('createInvalidFormatError should create proper error', () => {
      const error = createInvalidFormatError('bmp', 'test-id');
      expect(error.code).toBe(ErrorCode.INVALID_FORMAT);
      expect(error.statusCode).toBe(400);
      expect(error.requestId).toBe('test-id');
    });
  });

  describe('Validation Constants', () => {
    test('VALIDATION_CONSTANTS should have expected values', () => {
      expect(VALIDATION_CONSTANTS.MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
      expect(VALIDATION_CONSTANTS.SUPPORTED_CURRENCIES).toContain('EUR');
      expect(VALIDATION_CONSTANTS.MAX_AMOUNT).toBe(999999.99);
    });
  });

  describe('Joi Schemas', () => {
    test('uploadRequestSchema should validate upload requests', () => {
      const validRequest = {
        clientId: '123e4567-e89b-12d3-a456-426614174000',
        metadata: {
          source: 'mobile_app',
          expectedType: 'retail'
        }
      };

      const { error } = uploadRequestSchema.validate(validRequest);
      expect(error).toBeUndefined();
    });

    test('uploadRequestSchema should reject invalid requests', () => {
      const invalidRequest = {
        clientId: 'invalid-uuid',
        metadata: {
          expectedType: 'invalid_type'
        }
      };

      const { error } = uploadRequestSchema.validate(invalidRequest);
      expect(error).toBeDefined();
    });
  });

  describe('Interface Compliance', () => {
    test('ReceiptAnalysisRequest interface should be properly typed', () => {
      const request: ReceiptAnalysisRequest = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        clientId: '123e4567-e89b-12d3-a456-426614174001',
        imageUrl: 'https://example.com/image.jpg',
        imageMetadata: {
          format: ImageFormat.JPEG,
          size: 1024000,
          dimensions: { width: 800, height: 600 },
          mimeType: 'image/jpeg'
        },
        status: ReceiptStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(request.id).toBeDefined();
      expect(request.status).toBe(ReceiptStatus.PENDING);
    });

    test('ExtractedReceiptData interface should be properly typed', () => {
      const data: ExtractedReceiptData = {
        requestId: '123e4567-e89b-12d3-a456-426614174000',
        receiptType: ReceiptType.RETAIL,
        extractedFields: {
          totalAmount: {
            value: 25.99,
            currency: 'EUR',
            confidence: 0.95
          },
          date: {
            value: '2023-12-01T10:30:00.000Z',
            confidence: 0.90
          },
          merchantName: {
            value: 'Test Store',
            confidence: 0.85
          },
          items: [
            {
              name: 'Test Item',
              quantity: 1,
              unitPrice: 25.99,
              totalPrice: 25.99
            }
          ],
          summary: 'Purchase at Test Store for 25.99 EUR'
        },
        processingMetadata: {
          processingTime: 5000,
          ocrConfidence: 0.88,
          aiConfidence: 0.92,
          imagePreprocessed: true
        },
        extractedAt: new Date()
      };

      expect(data.requestId).toBeDefined();
      expect(data.receiptType).toBe(ReceiptType.RETAIL);
      expect(data.extractedFields.totalAmount.value).toBe(25.99);
    });
  });
});