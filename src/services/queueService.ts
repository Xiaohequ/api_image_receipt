import Bull, { Queue, Job, JobOptions } from 'bull';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { ReceiptAnalysisRequest, ReceiptStatus, ProcessingStats } from '../types';

export interface QueueJobData {
  requestId: string;
  imageUrl: string;
  clientId: string;
  metadata?: {
    source?: string;
    expectedType?: string;
    priority?: 'low' | 'normal' | 'high';
  };
}

export interface QueueJobResult {
  requestId: string;
  status: ReceiptStatus;
  data?: any;
  error?: string;
  processingTime: number;
}

class QueueService {
  private receiptQueue: Queue<QueueJobData>;
  private isInitialized = false;

  constructor() {
    // Initialize Bull queue with Redis connection
    this.receiptQueue = new Bull('receipt-processing', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.setupEventHandlers();
  }

  /**
   * Initialize the queue service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Test Redis connection
      await this.receiptQueue.isReady();
      
      // Clean up old jobs on startup
      await this.receiptQueue.clean(24 * 60 * 60 * 1000, 'completed'); // Clean completed jobs older than 24h
      await this.receiptQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // Clean failed jobs older than 7 days

      this.isInitialized = true;
      logger.info('Queue service initialized successfully', {
        queueName: this.receiptQueue.name,
        redisHost: config.redis.host,
        redisPort: config.redis.port,
      });
    } catch (error) {
      logger.error('Failed to initialize queue service', { error });
      throw error;
    }
  }

  /**
   * Add a receipt processing job to the queue
   */
  async addProcessingJob(
    requestId: string,
    imageUrl: string,
    clientId: string,
    metadata?: QueueJobData['metadata']
  ): Promise<Job<QueueJobData>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const jobData: QueueJobData = {
      requestId,
      imageUrl,
      clientId,
      metadata,
    };

    // Set job options based on priority
    const priority = metadata?.priority || 'normal';
    const jobOptions: JobOptions = {
      priority: this.getPriorityValue(priority),
      delay: 0, // Process immediately
    };

    try {
      const job = await this.receiptQueue.add('process-receipt', jobData, jobOptions);
      
      logger.info('Processing job added to queue', {
        jobId: job.id,
        requestId,
        priority,
        clientId,
      });

      return job;
    } catch (error) {
      logger.error('Failed to add job to queue', {
        requestId,
        clientId,
        error,
      });
      throw error;
    }
  }

  /**
   * Get job status by request ID
   */
  async getJobStatus(requestId: string): Promise<{
    status: ReceiptStatus;
    progress?: number;
    result?: any;
    error?: string;
    createdAt?: Date;
    processedAt?: Date;
    failedAt?: Date;
  } | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Find job by request ID
      const jobs = await this.receiptQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, -1);
      const job = jobs.find(j => j.data.requestId === requestId);

      if (!job) {
        return null;
      }

      const jobState = await job.getState();
      let status: ReceiptStatus;
      let progress: number | undefined;

      switch (jobState) {
        case 'waiting':
          status = ReceiptStatus.PENDING;
          progress = 0;
          break;
        case 'active':
          status = ReceiptStatus.PROCESSING;
          progress = job.progress() as number || 0;
          break;
        case 'completed':
          status = ReceiptStatus.COMPLETED;
          progress = 100;
          break;
        case 'failed':
          status = ReceiptStatus.FAILED;
          progress = 100;
          break;
        default:
          status = ReceiptStatus.PENDING;
          progress = 0;
      }

      return {
        status,
        progress,
        result: job.returnvalue,
        error: job.failedReason,
        createdAt: new Date(job.timestamp),
        processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
        failedAt: job.finishedOn && await job.isFailed() ? new Date(job.finishedOn) : undefined,
      };
    } catch (error) {
      logger.error('Failed to get job status', { requestId, error });
      throw error;
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<ProcessingStats> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.receiptQueue.getWaiting(),
        this.receiptQueue.getActive(),
        this.receiptQueue.getCompleted(),
        this.receiptQueue.getFailed(),
      ]);

      const totalProcessed = completed.length + failed.length;
      const successRate = totalProcessed > 0 ? (completed.length / totalProcessed) * 100 : 0;

      // Calculate average processing time from completed jobs
      let averageProcessingTime = 0;
      if (completed.length > 0) {
        const processingTimes = completed
          .filter(job => job.processedOn && job.timestamp)
          .map(job => job.processedOn! - job.timestamp);
        
        if (processingTimes.length > 0) {
          averageProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
        }
      }

      return {
        totalProcessed,
        successRate: Math.round(successRate * 100) / 100,
        averageProcessingTime: Math.round(averageProcessingTime / 1000 * 100) / 100, // Convert to seconds
        queueLength: waiting.length,
        activeJobs: active.length,
        failedJobs: failed.length,
      };
    } catch (error) {
      logger.error('Failed to get processing stats', { error });
      throw error;
    }
  }

  /**
   * Remove a job from the queue
   */
  async removeJob(requestId: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const jobs = await this.receiptQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, -1);
      const job = jobs.find(j => j.data.requestId === requestId);

      if (job) {
        await job.remove();
        logger.info('Job removed from queue', { jobId: job.id, requestId });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to remove job', { requestId, error });
      throw error;
    }
  }

  /**
   * Get queue health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy';
    queueLength: number;
    activeJobs: number;
    failedJobs: number;
    redisConnection: boolean;
  }> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const [waiting, active, failed] = await Promise.all([
        this.receiptQueue.getWaiting(),
        this.receiptQueue.getActive(),
        this.receiptQueue.getFailed(),
      ]);

      const queueLength = waiting.length;
      const activeJobs = active.length;
      const failedJobs = failed.length;

      // Consider unhealthy if too many failed jobs or queue is too long
      const status = (failedJobs > 10 || queueLength > 100) ? 'unhealthy' : 'healthy';

      return {
        status,
        queueLength,
        activeJobs,
        failedJobs,
        redisConnection: true,
      };
    } catch (error) {
      logger.error('Queue health check failed', { error });
      return {
        status: 'unhealthy',
        queueLength: 0,
        activeJobs: 0,
        failedJobs: 0,
        redisConnection: false,
      };
    }
  }

  /**
   * Gracefully close the queue
   */
  async close(): Promise<void> {
    if (this.receiptQueue) {
      await this.receiptQueue.close();
      logger.info('Queue service closed');
    }
  }

  /**
   * Setup event handlers for queue monitoring
   */
  private setupEventHandlers(): void {
    this.receiptQueue.on('ready', () => {
      logger.info('Queue is ready');
    });

    this.receiptQueue.on('error', (error) => {
      logger.error('Queue error', { error });
    });

    this.receiptQueue.on('waiting', (jobId) => {
      logger.debug('Job waiting', { jobId });
    });

    this.receiptQueue.on('active', (job) => {
      logger.info('Job started processing', {
        jobId: job.id,
        requestId: job.data.requestId,
      });
    });

    this.receiptQueue.on('completed', (job, result) => {
      logger.info('Job completed successfully', {
        jobId: job.id,
        requestId: job.data.requestId,
        processingTime: job.processedOn ? job.processedOn - job.timestamp : 0,
      });
    });

    this.receiptQueue.on('failed', (job, error) => {
      logger.error('Job failed', {
        jobId: job.id,
        requestId: job.data.requestId,
        error: error.message,
        attempts: job.attemptsMade,
      });
    });

    this.receiptQueue.on('stalled', (job) => {
      logger.warn('Job stalled', {
        jobId: job.id,
        requestId: job.data.requestId,
      });
    });
  }

  /**
   * Convert priority string to numeric value for Bull queue
   */
  private getPriorityValue(priority: 'low' | 'normal' | 'high'): number {
    switch (priority) {
      case 'high':
        return 10;
      case 'normal':
        return 5;
      case 'low':
        return 1;
      default:
        return 5;
    }
  }
}

// Export singleton instance
export const queueService = new QueueService();