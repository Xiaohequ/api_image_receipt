import { databaseService } from '../services/databaseService';
import { receiptAnalysisRequestRepository, extractedReceiptDataRepository } from '../repositories';
import { ReceiptStatus, ReceiptType, ImageFormat } from '../types';

describe('Database Service', () => {
  beforeAll(async () => {
    // Initialize database for testing
    await databaseService.initialize();
  });

  afterAll(async () => {
    // Clean up and disconnect
    await databaseService.disconnect();
  });

  describe('Database Connection', () => {
    it('should connect to database successfully', async () => {
      const healthCheck = await databaseService.healthCheck();
      expect(healthCheck.status).toBe('up');
    });

    it('should return database stats', async () => {
      const stats = await databaseService.getStats();
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('totalExtractedData');
      expect(stats).toHaveProperty('processingStats');
      expect(stats).toHaveProperty('analytics');
    });
  });

  describe('Receipt Analysis Request Repository', () => {
    const testRequestData = {
      id: 'test-request-123',
      clientId: 'test-client',
      imageUrl: '/uploads/test-image.jpg',
      imageMetadata: {
        format: ImageFormat.JPEG,
        size: 1024000,
        dimensions: { width: 800, height: 600 },
        originalName: 'test-receipt.jpg',
        mimeType: 'image/jpeg',
      },
      status: ReceiptStatus.PENDING,
    };

    it('should create a new receipt analysis request', async () => {
      const request = await receiptAnalysisRequestRepository.create(testRequestData);
      expect(request.id).toBe(testRequestData.id);
      expect(request.clientId).toBe(testRequestData.clientId);
      expect(request.status).toBe(ReceiptStatus.PENDING);
    });

    it('should find request by ID', async () => {
      const request = await receiptAnalysisRequestRepository.findByRequestId('test-request-123');
      expect(request).toBeTruthy();
      expect(request?.id).toBe('test-request-123');
    });

    it('should update request status', async () => {
      const updatedRequest = await receiptAnalysisRequestRepository.updateStatus(
        'test-request-123',
        ReceiptStatus.PROCESSING
      );
      expect(updatedRequest?.status).toBe(ReceiptStatus.PROCESSING);
    });

    it('should get processing stats', async () => {
      const stats = await receiptAnalysisRequestRepository.getProcessingStats();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('processing');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('successRate');
    });
  });

  describe('Extracted Receipt Data Repository', () => {
    const testExtractedData = {
      requestId: 'test-request-123',
      receiptType: ReceiptType.RETAIL,
      extractedFields: {
        totalAmount: {
          value: 25.99,
          currency: 'EUR',
          confidence: 95,
        },
        date: {
          value: '2024-01-15T10:30:00Z',
          confidence: 90,
        },
        merchantName: {
          value: 'Test Store',
          confidence: 88,
        },
        items: [
          {
            name: 'Test Item',
            quantity: 1,
            unitPrice: 25.99,
            totalPrice: 25.99,
          },
        ],
        summary: 'Purchase at Test Store for €25.99',
      },
      processingMetadata: {
        processingTime: 2500,
        ocrConfidence: 85,
        aiConfidence: 90,
        imagePreprocessed: true,
        detectedLanguage: 'fr',
      },
    };

    it('should create extracted receipt data', async () => {
      const extractedData = await extractedReceiptDataRepository.create(testExtractedData);
      expect(extractedData.requestId).toBe(testExtractedData.requestId);
      expect(extractedData.receiptType).toBe(ReceiptType.RETAIL);
      expect(extractedData.extractedFields.totalAmount.value).toBe(25.99);
    });

    it('should find extracted data by request ID', async () => {
      const extractedData = await extractedReceiptDataRepository.findByRequestId('test-request-123');
      expect(extractedData).toBeTruthy();
      expect(extractedData?.requestId).toBe('test-request-123');
    });

    it('should search by merchant name', async () => {
      const results = await extractedReceiptDataRepository.searchByMerchant('Test Store');
      expect(Array.isArray(results)).toBe(true);
      if (Array.isArray(results) && results.length > 0) {
        expect(results[0].extractedFields.merchantName.value).toContain('Test Store');
      }
    });

    it('should get analytics data', async () => {
      const analytics = await extractedReceiptDataRepository.getAnalytics();
      expect(analytics).toHaveProperty('totalReceipts');
      expect(analytics).toHaveProperty('averageAmount');
      expect(analytics).toHaveProperty('totalAmount');
      expect(analytics).toHaveProperty('receiptTypeDistribution');
      expect(analytics).toHaveProperty('averageProcessingTime');
      expect(analytics).toHaveProperty('averageConfidence');
    });
  });
});