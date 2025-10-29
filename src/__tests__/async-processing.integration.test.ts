import request from 'supertest';
import path from 'path';
import fs from 'fs';
import app from '../index';
import { queueService } from '../services/queueService';
import { workerService } from '../services/workerService';
import { statusService } from '../services/statusService';

// Mock Bull queue for testing
jest.mock('bull', () => {
  const mockJob = {
    id: 'test-job-1',
    data: { requestId: 'test-request-1', imageUrl: './test.jpg', clientId: 'test-client' },
    progress: jest.fn().mockReturnValue(50),
    getState: jest.fn().mockResolvedValue('active'),
    timestamp: Date.now(),
    processedOn: null,
    failedOn: null,
    returnvalue: null,
    failedReason: null,
    remove: jest.fn().mockResolvedValue(true)
  };

  const mockQueue = {
    name: 'receipt-processing',
    add: jest.fn().mockResolvedValue(mockJob),
    getJobs: jest.fn().mockResolvedValue([mockJob]),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([mockJob]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    isReady: jest.fn().mockResolvedValue(true),
    clean: jest.fn().mockResolvedValue(0),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    process: jest.fn()
  };

  return jest.fn().mockImplementation(() => mockQueue);
});

// Mock file system operations
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn().mockResolvedValue(Buffer.from('mock-image-data')),
    unlink: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined)
  },
  existsSync: jest.fn().mockReturnValue(true),
  createReadStream: jest.fn(),
  createWriteStream: jest.fn()
}));

describe('Async Processing Integration', () => {
  beforeAll(async () => {
    // Initialize services
    await queueService.initialize();
    await workerService.initialize();
  });

  afterAll(async () => {
    // Cleanup services
    await workerService.shutdown();
    await queueService.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Receipt Analysis Workflow', () => {
    it('should handle complete async processing workflow', async () => {
      // Create a mock image file
      const mockImageBuffer = Buffer.from('mock-image-data');
      
      // Step 1: Submit receipt for analysis
      const analyzeResponse = await request(app)
        .post('/api/v1/receipts/analyze')
        .attach('image', mockImageBuffer, 'test-receipt.jpg')
        .field('clientId', 'test-client')
        .expect(202);

      expect(analyzeResponse.body.success).toBe(true);
      expect(analyzeResponse.body.requestId).toBeDefined();
      expect(analyzeResponse.body.data.status).toBe('pending');

      const requestId = analyzeResponse.body.requestId;

      // Step 2: Check processing status
      const statusResponse = await request(app)
        .get(`/api/v1/receipts/${requestId}/status`)
        .expect(200);

      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data.requestId).toBe(requestId);
      expect(statusResponse.body.data.status).toBeDefined();
      expect(typeof statusResponse.body.data.progress).toBe('number');
    });

    it('should return 404 for non-existent request status', async () => {
      const response = await request(app)
        .get('/api/v1/receipts/non-existent-id/status')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });

    it('should return 404 for non-existent request result', async () => {
      const response = await request(app)
        .get('/api/v1/receipts/non-existent-id/result')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
  });

  describe('Queue Statistics', () => {
    it('should return processing statistics', async () => {
      const response = await request(app)
        .get('/api/v1/receipts/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(typeof response.body.data.totalProcessed).toBe('number');
      expect(typeof response.body.data.successRate).toBe('number');
      expect(typeof response.body.data.queueLength).toBe('number');
      expect(response.body.data.queueHealth).toBeDefined();
    });
  });

  describe('Health Check', () => {
    it('should include queue and worker status in health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBeDefined();
      expect(response.body.services).toBeDefined();
      expect(response.body.services.redis).toBeDefined();
      expect(response.body.services.queue).toBeDefined();
      expect(response.body.services.worker).toBeDefined();
      expect(response.body.queue).toBeDefined();
      expect(response.body.worker).toBeDefined();
    });
  });
});

describe('Queue Service Integration', () => {
  beforeAll(async () => {
    await queueService.initialize();
  });

  afterAll(async () => {
    await queueService.close();
  });

  it('should add and track jobs', async () => {
    const requestId = 'test-integration-1';
    const imageUrl = './test-image.jpg';
    const clientId = 'test-client';

    // Add job to queue
    const job = await queueService.addProcessingJob(requestId, imageUrl, clientId);
    expect(job).toBeDefined();
    expect(job.data.requestId).toBe(requestId);

    // Check job status
    const status = await queueService.getJobStatus(requestId);
    expect(status).toBeDefined();
    expect(status?.status).toBeDefined();
  });

  it('should provide health status', async () => {
    const health = await queueService.getHealthStatus();
    expect(health.status).toBeDefined();
    expect(health.redisConnection).toBe(true);
    expect(typeof health.queueLength).toBe('number');
  });

  it('should provide processing statistics', async () => {
    const stats = await queueService.getProcessingStats();
    expect(typeof stats.totalProcessed).toBe('number');
    expect(typeof stats.successRate).toBe('number');
    expect(typeof stats.averageProcessingTime).toBe('number');
  });
});

describe('Status Service Integration', () => {
  const mockRequest = {
    id: 'test-status-1',
    clientId: 'test-client',
    imageUrl: './test.jpg',
    imageMetadata: {
      format: 'jpeg' as const,
      size: 1024,
      dimensions: { width: 800, height: 600 },
      mimeType: 'image/jpeg'
    },
    status: 'pending' as const,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it('should manage request lifecycle', async () => {
    const requestId = 'test-status-lifecycle';
    
    // Initialize request
    await statusService.initializeRequest(requestId, { ...mockRequest, id: requestId });

    // Get initial status
    const initialStatus = await statusService.getStatus(requestId);
    expect(initialStatus.requestId).toBe(requestId);
    expect(initialStatus.status).toBe('pending');

    // Update status
    await statusService.updateStatus(requestId, 'processing' as const);
    const updatedStatus = await statusService.getStatus(requestId);
    expect(updatedStatus.status).toBe('processing');

    // Remove request
    const removed = await statusService.removeRequest(requestId);
    expect(removed).toBe(true);

    // Verify removal
    await expect(statusService.getStatus(requestId))
      .rejects.toThrow('Requête non trouvée');
  });
});