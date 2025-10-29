import { queueService } from '../services/queueService';
import { statusService } from '../services/statusService';
import { ReceiptStatus } from '../types';

// Mock Redis for testing
jest.mock('bull', () => {
  const mockJob = {
    id: 'test-job-1',
    data: { requestId: 'test-request-1', imageUrl: './test.jpg', clientId: 'test-client' },
    progress: jest.fn().mockReturnValue(0),
    getState: jest.fn().mockResolvedValue('waiting'),
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
    getWaiting: jest.fn().mockResolvedValue([mockJob]),
    getActive: jest.fn().mockResolvedValue([]),
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

describe('Queue Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(queueService.initialize()).resolves.not.toThrow();
    });
  });

  describe('job management', () => {
    beforeEach(async () => {
      await queueService.initialize();
    });

    it('should add a processing job to the queue', async () => {
      const requestId = 'test-request-1';
      const imageUrl = './test-image.jpg';
      const clientId = 'test-client';
      const metadata = { priority: 'normal' as const };

      const job = await queueService.addProcessingJob(requestId, imageUrl, clientId, metadata);

      expect(job).toBeDefined();
      expect(job.data.requestId).toBe(requestId);
      expect(job.data.imageUrl).toBe(imageUrl);
      expect(job.data.clientId).toBe(clientId);
    });

    it('should get job status', async () => {
      const requestId = 'test-request-1';
      
      const status = await queueService.getJobStatus(requestId);

      expect(status).toBeDefined();
      expect(status?.status).toBe(ReceiptStatus.PENDING);
      expect(status?.progress).toBe(0);
    });

    it('should return null for non-existent job', async () => {
      const status = await queueService.getJobStatus('non-existent-id');
      expect(status).toBeNull();
    });
  });

  describe('health status', () => {
    beforeEach(async () => {
      await queueService.initialize();
    });

    it('should return health status', async () => {
      const health = await queueService.getHealthStatus();

      expect(health).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.redisConnection).toBe(true);
      expect(typeof health.queueLength).toBe('number');
      expect(typeof health.activeJobs).toBe('number');
      expect(typeof health.failedJobs).toBe('number');
    });
  });

  describe('processing statistics', () => {
    beforeEach(async () => {
      await queueService.initialize();
    });

    it('should return processing statistics', async () => {
      const stats = await queueService.getProcessingStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalProcessed).toBe('number');
      expect(typeof stats.successRate).toBe('number');
      expect(typeof stats.averageProcessingTime).toBe('number');
      expect(typeof stats.queueLength).toBe('number');
      expect(typeof stats.activeJobs).toBe('number');
      expect(typeof stats.failedJobs).toBe('number');
    });
  });
});

describe('Status Service', () => {
  const mockRequest = {
    id: 'test-request-1',
    clientId: 'test-client',
    imageUrl: './test.jpg',
    imageMetadata: {
      format: 'jpeg' as const,
      size: 1024,
      dimensions: { width: 800, height: 600 },
      mimeType: 'image/jpeg'
    },
    status: ReceiptStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  describe('request management', () => {
    it('should initialize a new request', async () => {
      await expect(statusService.initializeRequest('test-request-1', mockRequest))
        .resolves.not.toThrow();
    });

    it('should get status for initialized request', async () => {
      await statusService.initializeRequest('test-request-1', mockRequest);
      
      const status = await statusService.getStatus('test-request-1');

      expect(status).toBeDefined();
      expect(status.requestId).toBe('test-request-1');
      expect(status.status).toBe(ReceiptStatus.PENDING);
      expect(typeof status.progress).toBe('number');
    });

    it('should throw error for non-existent request', async () => {
      await expect(statusService.getStatus('non-existent-id'))
        .rejects.toThrow('Requête non trouvée');
    });

    it('should update request status', async () => {
      await statusService.initializeRequest('test-request-1', mockRequest);
      
      await statusService.updateStatus('test-request-1', ReceiptStatus.PROCESSING);
      
      const status = await statusService.getStatus('test-request-1');
      expect(status.status).toBe(ReceiptStatus.PROCESSING);
    });

    it('should remove request', async () => {
      await statusService.initializeRequest('test-request-1', mockRequest);
      
      const removed = await statusService.removeRequest('test-request-1');
      expect(removed).toBe(true);
      
      await expect(statusService.getStatus('test-request-1'))
        .rejects.toThrow('Requête non trouvée');
    });
  });

  describe('result retrieval', () => {
    it('should throw error for pending request', async () => {
      await statusService.initializeRequest('test-request-1', mockRequest);
      
      await expect(statusService.getResult('test-request-1'))
        .rejects.toThrow('Le traitement est encore en cours');
    });

    it('should throw error for failed request', async () => {
      await statusService.initializeRequest('test-request-1', mockRequest);
      await statusService.updateStatus('test-request-1', ReceiptStatus.FAILED, undefined, 'Test error');
      
      await expect(statusService.getResult('test-request-1'))
        .rejects.toThrow('Le traitement a échoué');
    });
  });
});