import request from 'supertest';
import express from 'express';
import { uploadReceiptImage, processUploadedFile } from '../middleware/upload';
import { uploadService } from '../services/uploadService';

// Mock the upload service for testing
jest.mock('../services/uploadService');
jest.mock('../utils/logger');

describe('Upload Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Test route that uses the upload middleware
    app.post('/test-upload', 
      uploadReceiptImage,
      processUploadedFile,
      (req, res) => {
        res.json({
          success: true,
          requestId: req.uploadData?.requestId,
          filename: req.uploadData?.file.originalname,
          size: req.uploadData?.file.size
        });
      }
    );
  });

  it('should reject request without file', async () => {
    const response = await request(app)
      .post('/test-upload')
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: 'INVALID_REQUEST',
        message: expect.stringContaining('Aucune image fournie')
      })
    });
  });

  it('should reject unsupported file format', async () => {
    const response = await request(app)
      .post('/test-upload')
      .attach('image', Buffer.from('fake content'), {
        filename: 'test.txt',
        contentType: 'text/plain'
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: 'INVALID_FORMAT'
      })
    });
  });

  it('should accept valid JPEG file', async () => {
    // Create a minimal JPEG header
    const jpegBuffer = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, // JPEG signature
      0x00, 0x10, // JFIF length
      0x4A, 0x46, 0x49, 0x46, 0x00, // JFIF
      0x01, 0x01, // version
      0x01, 0x00, 0x01, 0x00, 0x01, // density
      0x00, 0x00, // thumbnail
      0xFF, 0xD9 // End of image
    ]);

    const mockSaveFile = jest.spyOn(uploadService, 'saveUploadedFile')
      .mockResolvedValue('/temp/test-file.jpg');
    const mockCreateRequest = jest.spyOn(uploadService, 'createAnalysisRequest')
      .mockResolvedValue({} as any);

    const response = await request(app)
      .post('/test-upload')
      .attach('image', jpegBuffer, {
        filename: 'test.jpg',
        contentType: 'image/jpeg'
      })
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      requestId: expect.any(String),
      filename: 'test.jpg',
      size: jpegBuffer.length
    });

    mockSaveFile.mockRestore();
    mockCreateRequest.mockRestore();
  });

  it('should reject oversized file', async () => {
    // Create a buffer larger than 10MB
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
    
    const response = await request(app)
      .post('/test-upload')
      .attach('image', largeBuffer, {
        filename: 'large.jpg',
        contentType: 'image/jpeg'
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: 'FILE_TOO_LARGE'
      })
    });
  });
});