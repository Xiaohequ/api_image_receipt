import request from 'supertest';
import express from 'express';
import { validateRequest, sanitizeInputs, schemas, customValidators } from '../middleware/validation';

// Mock dependencies
jest.mock('../utils/logger');

describe('Enhanced Validation Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Input Sanitization', () => {
    beforeEach(() => {
      app.use(sanitizeInputs);
      app.post('/test', (req, res) => {
        res.json({ 
          body: req.body, 
          query: req.query,
          sanitizedHeaders: req.sanitizedHeaders 
        });
      });
    });

    it('should sanitize HTML in request body', async () => {
      const response = await request(app)
        .post('/test')
        .send({
          message: '<script>alert("xss")</script>Hello World',
          description: 'Normal text with <b>bold</b> tags'
        })
        .expect(200);

      expect(response.body.body.message).toBe('Hello World');
      expect(response.body.body.description).toBe('Normal text with  tags');
    });

    it('should sanitize nested objects', async () => {
      const response = await request(app)
        .post('/test')
        .send({
          user: {
            name: '<script>evil</script>John',
            profile: {
              bio: 'Hello<>&\'"World'
            }
          }
        })
        .expect(200);

      expect(response.body.body.user.name).toBe('John');
      expect(response.body.body.user.profile.bio).toBe('HelloWorld');
    });

    it('should sanitize arrays', async () => {
      const response = await request(app)
        .post('/test')
        .send({
          tags: ['<script>tag1</script>', 'normal-tag', '<b>tag3</b>']
        })
        .expect(200);

      expect(response.body.body.tags).toEqual(['tag1', 'normal-tag', 'tag3']);
    });

    it('should sanitize query parameters', async () => {
      const response = await request(app)
        .post('/test?search=<script>alert(1)</script>&filter=normal')
        .expect(200);

      expect(response.body.query.search).toBe('alert(1)');
      expect(response.body.query.filter).toBe('normal');
    });

    it('should sanitize headers while preserving auth headers', async () => {
      const response = await request(app)
        .post('/test')
        .set('X-API-Key', 'secret-key-123')
        .set('User-Agent', '<script>evil</script>Mozilla')
        .set('Custom-Header', 'normal-value')
        .expect(200);

      expect(response.body.sanitizedHeaders['x-api-key']).toBe('secret-key-123');
      expect(response.body.sanitizedHeaders['user-agent']).toBe('Mozilla');
      expect(response.body.sanitizedHeaders['custom-header']).toBe('normal-value');
    });
  });

  describe('Enhanced Validation', () => {
    describe('Receipt ID validation', () => {
      beforeEach(() => {
        app.get('/receipt/:id', 
          validateRequest({ params: schemas.receiptId }),
          (req, res) => res.json({ id: req.params.id })
        );
      });

      it('should accept valid UUID', async () => {
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        await request(app)
          .get(`/receipt/${uuid}`)
          .expect(200);
      });

      it('should reject invalid UUID', async () => {
        const response = await request(app)
          .get('/receipt/invalid-id')
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
        expect(response.body.details.validationErrors[0]).toContain('UUID valide');
      });

      it('should reject empty ID', async () => {
        await request(app)
          .get('/receipt/')
          .expect(404); // Route not found
      });
    });

    describe('Analyze request validation', () => {
      beforeEach(() => {
        app.post('/analyze',
          validateRequest({ body: schemas.analyzeRequest }),
          (req, res) => res.json({ success: true, data: req.body })
        );
      });

      it('should accept valid analyze request', async () => {
        const validRequest = {
          clientId: '123e4567-e89b-12d3-a456-426614174000',
          metadata: {
            source: 'mobile-app',
            expectedType: 'retail'
          }
        };

        const response = await request(app)
          .post('/analyze')
          .send(validRequest)
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should reject invalid client ID format', async () => {
        const response = await request(app)
          .post('/analyze')
          .send({ clientId: 'invalid-uuid' })
          .expect(400);

        expect(response.body.details.validationErrors[0]).toContain('UUID valide');
      });

      it('should reject invalid source with special characters', async () => {
        const response = await request(app)
          .post('/analyze')
          .send({
            metadata: {
              source: 'mobile<script>alert(1)</script>app'
            }
          })
          .expect(400);

        expect(response.body.details.validationErrors[0]).toContain('caractères non autorisés');
      });

      it('should reject invalid expected type', async () => {
        const response = await request(app)
          .post('/analyze')
          .send({
            metadata: {
              expectedType: 'invalid-type'
            }
          })
          .expect(400);

        expect(response.body.details.validationErrors[0]).toContain('retail, card_payment, ou cash_register');
      });

      it('should strip unknown fields', async () => {
        const response = await request(app)
          .post('/analyze')
          .send({
            clientId: '123e4567-e89b-12d3-a456-426614174000',
            unknownField: 'should be removed',
            metadata: {
              source: 'mobile-app',
              unknownMetadata: 'also removed'
            }
          })
          .expect(200);

        expect(response.body.data.unknownField).toBeUndefined();
        expect(response.body.data.metadata.unknownMetadata).toBeUndefined();
        expect(response.body.data.clientId).toBeDefined();
        expect(response.body.data.metadata.source).toBeDefined();
      });
    });

    describe('File upload validation', () => {
      beforeEach(() => {
        app.post('/upload',
          validateRequest({ body: schemas.fileUpload }),
          (req, res) => res.json({ success: true })
        );
      });

      it('should accept valid file metadata', async () => {
        const validFile = {
          originalname: 'receipt.jpg',
          mimetype: 'image/jpeg',
          size: 1024000 // 1MB
        };

        await request(app)
          .post('/upload')
          .send(validFile)
          .expect(200);
      });

      it('should reject unsupported file type', async () => {
        const response = await request(app)
          .post('/upload')
          .send({
            originalname: 'document.txt',
            mimetype: 'text/plain',
            size: 1024
          })
          .expect(400);

        expect(response.body.details.validationErrors[0]).toContain('JPEG, PNG, PDF');
      });

      it('should reject file too large', async () => {
        const response = await request(app)
          .post('/upload')
          .send({
            originalname: 'large-file.jpg',
            mimetype: 'image/jpeg',
            size: 20971520 // 20MB
          })
          .expect(400);

        expect(response.body.details.validationErrors[0]).toContain('10MB');
      });

      it('should reject dangerous filename', async () => {
        const response = await request(app)
          .post('/upload')
          .send({
            originalname: '../../../etc/passwd',
            mimetype: 'image/jpeg',
            size: 1024
          })
          .expect(400);

        expect(response.body.details.validationErrors[0]).toContain('caractères non autorisés');
      });
    });

    describe('Pagination validation', () => {
      beforeEach(() => {
        app.get('/items',
          validateRequest({ query: schemas.pagination }),
          (req, res) => res.json({ query: req.query })
        );
      });

      it('should apply default values', async () => {
        const response = await request(app)
          .get('/items')
          .expect(200);

        expect(response.body.query.page).toBe(1);
        expect(response.body.query.limit).toBe(20);
      });

      it('should accept valid pagination parameters', async () => {
        const response = await request(app)
          .get('/items?page=2&limit=50')
          .expect(200);

        expect(response.body.query.page).toBe(2);
        expect(response.body.query.limit).toBe(50);
      });

      it('should reject page number too high', async () => {
        const response = await request(app)
          .get('/items?page=2000')
          .expect(400);

        expect(response.body.details.validationErrors[0]).toContain('1000');
      });

      it('should reject limit too high', async () => {
        const response = await request(app)
          .get('/items?limit=500')
          .expect(400);

        expect(response.body.details.validationErrors[0]).toContain('100');
      });
    });
  });

  describe('Custom Validators', () => {
    describe('SQL Injection Detection', () => {
      it('should detect SQL injection patterns', () => {
        expect(customValidators.noSqlInjection('SELECT * FROM users')).toBe(false);
        expect(customValidators.noSqlInjection('DROP TABLE users')).toBe(false);
        expect(customValidators.noSqlInjection("'; DROP TABLE users; --")).toBe(false);
        expect(customValidators.noSqlInjection('1 OR 1=1')).toBe(false);
      });

      it('should allow safe strings', () => {
        expect(customValidators.noSqlInjection('normal search text')).toBe(true);
        expect(customValidators.noSqlInjection('user@example.com')).toBe(true);
        expect(customValidators.noSqlInjection('product-name-123')).toBe(true);
      });
    });

    describe('XSS Detection', () => {
      it('should detect XSS patterns', () => {
        expect(customValidators.noXss('<script>alert(1)</script>')).toBe(false);
        expect(customValidators.noXss('<iframe src="evil.com"></iframe>')).toBe(false);
        expect(customValidators.noXss('javascript:alert(1)')).toBe(false);
        expect(customValidators.noXss('<img onload="alert(1)">')).toBe(false);
      });

      it('should allow safe strings', () => {
        expect(customValidators.noXss('normal text content')).toBe(true);
        expect(customValidators.noXss('user@example.com')).toBe(true);
        expect(customValidators.noXss('Some text with numbers 123')).toBe(true);
      });
    });

    describe('File Extension Validation', () => {
      it('should validate allowed extensions', () => {
        const allowed = ['jpg', 'png', 'pdf'];
        
        expect(customValidators.allowedFileExtension('image.jpg', allowed)).toBe(true);
        expect(customValidators.allowedFileExtension('document.PDF', allowed)).toBe(true);
        expect(customValidators.allowedFileExtension('photo.png', allowed)).toBe(true);
      });

      it('should reject disallowed extensions', () => {
        const allowed = ['jpg', 'png'];
        
        expect(customValidators.allowedFileExtension('script.exe', allowed)).toBe(false);
        expect(customValidators.allowedFileExtension('document.pdf', allowed)).toBe(false);
        expect(customValidators.allowedFileExtension('file.txt', allowed)).toBe(false);
      });

      it('should handle files without extension', () => {
        const allowed = ['jpg', 'png'];
        
        expect(customValidators.allowedFileExtension('filename', allowed)).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      app.post('/test',
        validateRequest({ body: schemas.analyzeRequest }),
        (req, res) => res.json({ success: true })
      );
    });

    it('should provide detailed validation errors', async () => {
      const response = await request(app)
        .post('/test')
        .send({
          clientId: 'invalid-uuid',
          metadata: {
            source: 'source-with-invalid-chars!@#$',
            expectedType: 'invalid-type'
          }
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.message).toBe('Validation des données échouée');
      expect(response.body.details.validationErrors).toHaveLength(3);
    });

    it('should handle validation middleware errors gracefully', async () => {
      // Create an app that will cause validation to throw
      const errorApp = express();
      errorApp.use(express.json());
      
      // Mock a validation that throws
      errorApp.post('/error', (req, res, next) => {
        const mockValidation = validateRequest({ 
          body: null as any // This should cause an error
        });
        mockValidation(req, res, next);
      }, (req, res) => res.json({ success: true }));

      const response = await request(errorApp)
        .post('/error')
        .send({ test: 'data' })
        .expect(500);

      expect(response.body.error).toBe('INTERNAL_VALIDATION_ERROR');
    });
  });

  describe('Sanitization with Validation', () => {
    beforeEach(() => {
      app.post('/test',
        validateRequest({ 
          body: schemas.analyzeRequest,
          sanitize: true 
        }),
        (req, res) => res.json({ body: req.body })
      );
    });

    it('should sanitize before validation', async () => {
      const response = await request(app)
        .post('/test')
        .send({
          clientId: '123e4567-e89b-12d3-a456-426614174000',
          metadata: {
            source: '  mobile-app  ', // Extra whitespace
            expectedType: 'retail'
          }
        })
        .expect(200);

      expect(response.body.body.metadata.source).toBe('mobile-app');
    });

    it('should disable sanitization when requested', async () => {
      const noSanitizeApp = express();
      noSanitizeApp.use(express.json());
      
      noSanitizeApp.post('/test',
        validateRequest({ 
          body: schemas.analyzeRequest,
          sanitize: false 
        }),
        (req, res) => res.json({ body: req.body })
      );

      const response = await request(noSanitizeApp)
        .post('/test')
        .send({
          clientId: '123e4567-e89b-12d3-a456-426614174000',
          metadata: {
            source: '  mobile-app  ', // Should preserve whitespace
            expectedType: 'retail'
          }
        })
        .expect(200);

      expect(response.body.body.metadata.source).toBe('  mobile-app  ');
    });
  });
});