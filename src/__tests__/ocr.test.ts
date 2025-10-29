import { OCRService } from '../services/ocrService';

// Basic test to verify OCR service can be instantiated
describe('OCRService', () => {
  it('should create OCR service instance', () => {
    const ocrService = new OCRService();
    expect(ocrService).toBeDefined();
  });

  it('should have required methods', () => {
    const ocrService = new OCRService();
    expect(typeof ocrService.extractText).toBe('function');
    expect(typeof ocrService.extractTextWithRetry).toBe('function');
    expect(typeof ocrService.healthCheck).toBe('function');
    expect(typeof ocrService.cleanup).toBe('function');
  });
});