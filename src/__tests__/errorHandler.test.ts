import request from 'supertest';
import express from 'express';
import { errorHandler, notFoundHandler, CustomError } from '../middleware/errorHandler';
import { 
  AppError, 
  ErrorCode, 
  createInvalidFormatError,
  createProcessingError 
} from '../types/errors';

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Test routes that throw different types of errors
  app.get('/test/app-error', (req, res, next) => {
    const error = createInvalidFormatError('BMP', req);
    next(error);
  });
  
  app.get('/test/custom-error', (req, res, next) => {
    const error = new CustomError('Test custom error', 400, 'TEST_ERROR');
    next(error);
  });
  
  app.get('/test/standard-error', (req, res, next) => {
    const error = new Error('Standard JavaScript error');
    next(error);
  });
  
  app.get('/test/processing-error', (req, res, next) => {
    const originalError = new Error('OCR service failed');
    const error = createProcessingError(originalError, req);
    next(error);
  });
  
  // Add error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);
  
  return app;
};

describe('Error Handler Middleware', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = createTestApp();
  });
  
  describe('AppError handling', () => {
    it('should handle AppError with proper French message and status code', async () => {
      const response = await request(app)
        .get('/test/app-error')
        .expect(400);
      
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: ErrorCode.INVALID_FORMAT,
          message: expect.stringContaining('Format d\'image "BMP" non supporté')
        }
      });
      
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
  
  describe('CustomError handling', () => {
    it('should handle CustomError with proper status code', async () => {
      const response = await request(app)
        .get('/test/custom-error')
        .expect(400);
      
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test custom error'
        }
      });
      
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
  
  describe('Standard Error handling', () => {
    it('should handle standard JavaScript errors as 500', async () => {
      const response = await request(app)
        .get('/test/standard-error')
        .expect(500);
      
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Erreur interne du serveur'
        }
      });
      
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
  
  describe('Processing Error handling', () => {
    it('should handle processing errors with context', async () => {
      const response = await request(app)
        .get('/test/processing-error')
        .expect(500);
      
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: ErrorCode.PROCESSING_ERROR,
          message: expect.stringContaining('Erreur lors du traitement')
        }
      });
      
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
  
  describe('404 Not Found handling', () => {
    it('should handle 404 errors with French message', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .expect(404);
      
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint non trouvé'
        }
      });
      
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
  
  describe('Error response format', () => {
    it('should include all required fields in error response', async () => {
      const response = await request(app)
        .get('/test/app-error')
        .expect(400);
      
      // Check required fields
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('timestamp');
      
      // Check error object structure
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      
      // Validate timestamp format (ISO 8601)
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
    
    it('should include details for errors that have them', async () => {
      const response = await request(app)
        .get('/test/app-error')
        .expect(400);
      
      expect(response.body.error).toHaveProperty('details');
      expect(response.body.error.details).toHaveProperty('receivedFormat', 'BMP');
      expect(response.body.error.details).toHaveProperty('supportedFormats');
    });
  });
  
  describe('Request ID handling', () => {
    it('should use provided request ID from headers', async () => {
      const testRequestId = 'test-request-123';
      
      const response = await request(app)
        .get('/test/app-error')
        .set('x-request-id', testRequestId)
        .expect(400);
      
      expect(response.body.requestId).toBe(testRequestId);
    });
    
    it('should generate request ID when not provided', async () => {
      const response = await request(app)
        .get('/test/app-error')
        .expect(400);
      
      expect(response.body.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });
  });
});

describe('Error Utility Functions', () => {
  describe('French error messages', () => {
    it('should provide detailed French messages for all error codes', () => {
      const testCases = [
        { code: ErrorCode.INVALID_FORMAT, expectedText: 'Format d\'image' },
        { code: ErrorCode.FILE_TOO_LARGE, expectedText: 'Taille de fichier' },
        { code: ErrorCode.POOR_IMAGE_QUALITY, expectedText: 'Qualité d\'image' },
        { code: ErrorCode.NO_TEXT_DETECTED, expectedText: 'Aucun texte détecté' },
        { code: ErrorCode.RATE_LIMIT_EXCEEDED, expectedText: 'Limite de' },
        { code: ErrorCode.PROCESSING_ERROR, expectedText: 'Erreur lors du' },
        { code: ErrorCode.SERVICE_UNAVAILABLE, expectedText: 'temporairement indisponible' },
        { code: ErrorCode.UNAUTHORIZED, expectedText: 'Accès non autorisé' }
      ];
      
      testCases.forEach(({ code, expectedText }) => {
        const error = new AppError(code, 'Test message', 400);
        expect(error.message).toContain(expectedText);
      });
    });
  });
});