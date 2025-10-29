import { validateImageQuality } from '../middleware/upload';
import { uploadService } from '../services/uploadService';
import { ImageFormat } from '../types';

describe('Upload Service', () => {
  describe('validateImageQuality', () => {
    it('should return true for valid image buffer', async () => {
      // Create a minimal valid image buffer (1x1 PNG)
      const validPngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x00, 0x01, // width: 1
        0x00, 0x00, 0x00, 0x01, // height: 1
        0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
        0x90, 0x77, 0x53, 0xDE, // CRC
        0x00, 0x00, 0x00, 0x0C, // IDAT chunk length
        0x49, 0x44, 0x41, 0x54, // IDAT
        0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, // compressed data
        0x02, 0x00, 0x01, // CRC
        0x00, 0x00, 0x00, 0x00, // IEND chunk length
        0x49, 0x45, 0x4E, 0x44, // IEND
        0xAE, 0x42, 0x60, 0x82  // CRC
      ]);

      const result = await validateImageQuality(validPngBuffer, 'image/png');
      expect(result).toBe(true);
    });

    it('should return true for PDF files', async () => {
      const pdfBuffer = Buffer.from('dummy pdf content');
      const result = await validateImageQuality(pdfBuffer, 'application/pdf');
      expect(result).toBe(true);
    });
  });

  describe('generateUploadResponse', () => {
    it('should generate correct upload response', () => {
      const requestId = 'test-request-id';
      const response = uploadService.generateUploadResponse(requestId, 25);

      expect(response).toEqual({
        requestId: 'test-request-id',
        status: 'pending',
        estimatedProcessingTime: 25,
        message: 'Image reçue et en cours de traitement'
      });
    });
  });

  describe('validateFileBuffer', () => {
    it('should throw error for empty buffer', () => {
      const emptyBuffer = Buffer.alloc(0);
      
      expect(() => {
        uploadService.validateFileBuffer(emptyBuffer, 1024 * 1024);
      }).toThrow('Fichier vide détecté');
    });

    it('should throw error for oversized buffer', () => {
      const largeBuffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
      const maxSize = 1024 * 1024; // 1MB
      
      expect(() => {
        uploadService.validateFileBuffer(largeBuffer, maxSize);
      }).toThrow('Taille de fichier trop importante');
    });

    it('should pass for valid buffer size', () => {
      const validBuffer = Buffer.alloc(512 * 1024); // 512KB
      const maxSize = 1024 * 1024; // 1MB
      
      expect(() => {
        uploadService.validateFileBuffer(validBuffer, maxSize);
      }).not.toThrow();
    });
  });
});