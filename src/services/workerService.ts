import { Job } from 'bull';
import { queueService, QueueJobData, QueueJobResult } from './queueService';
import { ocrService } from './ocrService';
import { dataExtractionService } from './dataExtractionService';
import { performanceService } from './performanceService';
import { logger } from '../utils/logger';
import { ReceiptStatus, ExtractedReceiptData, ReceiptType } from '../types';
import { config } from '../config/config';
import fs from 'fs/promises';
import path from 'path';

class WorkerService {
  private isInitialized = false;

  /**
   * Initialize the worker service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize queue service first
      await queueService.initialize();

      // Set up job processor
      await this.setupJobProcessor();

      this.isInitialized = true;
      logger.info('Worker service initialized successfully', {
        concurrency: config.processing.queueConcurrency,
      });
    } catch (error) {
      logger.error('Failed to initialize worker service', { error });
      throw error;
    }
  }

  /**
   * Setup the job processor for the receipt processing queue
   */
  private async setupJobProcessor(): Promise<void> {
    // Access the queue directly from queueService
    const queue = (queueService as any).receiptQueue;
    
    if (!queue) {
      throw new Error('Queue not available in queueService');
    }

    // Process jobs with specified concurrency
    queue.process('process-receipt', config.processing.queueConcurrency, async (job: Job<QueueJobData>) => {
      return await this.processReceiptJob(job);
    });

    logger.info('Job processor setup completed', {
      jobType: 'process-receipt',
      concurrency: config.processing.queueConcurrency,
    });
  }

  /**
   * Process a single receipt analysis job
   */
  private async processReceiptJob(job: Job<QueueJobData>): Promise<QueueJobResult> {
    const startTime = Date.now();
    const { requestId, imageUrl, clientId, metadata } = job.data;

    logger.info('Starting receipt processing job', {
      jobId: job.id,
      requestId,
      clientId,
      imageUrl,
    });

    try {
      // Update job progress
      await job.progress(10);

      // Step 1: Load and validate image
      const imageBuffer = await this.loadImage(imageUrl);
      await job.progress(20);

      // Step 2: Extract text using OCR with parallel processing for multiple images if needed
      logger.debug('Extracting text with OCR', { requestId });
      
      // For single image, use direct OCR
      const ocrResult = await ocrService.extractText(imageBuffer, {
        preprocessImage: true,
        enhanceContrast: true,
        autoRotate: true
      });
      await job.progress(60);

      // Step 3: Extract structured data using parallel AI processing
      logger.debug('Extracting structured data', { requestId });
      
      // Use performance service for parallel AI extraction if we have multiple extraction tasks
      const extractionTasks = [
        {
          id: `${requestId}-extraction`,
          data: {
            text: ocrResult.text,
            options: {
              receiptType: metadata?.expectedType as ReceiptType,
              language: 'fr'
            }
          }
        }
      ];

      const extractionResults = await performanceService.processAIExtractionInParallel(
        extractionTasks,
        async (data: any) => {
          return await dataExtractionService.extractData(data.text, data.options);
        },
        { maxConcurrency: 1, timeout: 15000 }
      );

      if (extractionResults[0].error) {
        throw extractionResults[0].error;
      }

      const extractionResult = extractionResults[0].result;
      await job.progress(80);

      // Step 5: Finalize result
      const processingTime = Date.now() - startTime;
      const result: ExtractedReceiptData = {
        requestId,
        receiptType: metadata?.expectedType as ReceiptType || ReceiptType.UNKNOWN,
        extractedFields: extractionResult,
        processingMetadata: {
          processingTime: processingTime / 1000, // Convert to seconds
          ocrConfidence: ocrResult.confidence,
          aiConfidence: 0.85, // Default AI confidence
          imagePreprocessed: true,
          detectedLanguage: 'fr'
        },
        extractedAt: new Date(),
      };

      await job.progress(100);

      // Clean up temporary image file
      await this.cleanupImage(imageUrl);

      logger.info('Receipt processing job completed successfully', {
        jobId: job.id,
        requestId,
        processingTime: processingTime / 1000,
        ocrConfidence: ocrResult.confidence,
        aiConfidence: result.processingMetadata.aiConfidence,
      });

      return {
        requestId,
        status: ReceiptStatus.COMPLETED,
        data: result,
        processingTime: processingTime / 1000,
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Receipt processing job failed', {
        jobId: job.id,
        requestId,
        clientId,
        error: error instanceof Error ? error.message : String(error),
        processingTime: processingTime / 1000,
        attempts: job.attemptsMade,
      });

      // Clean up temporary image file even on failure
      try {
        await this.cleanupImage(imageUrl);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup image after processing failure', {
          requestId,
          imageUrl,
          cleanupError,
        });
      }

      // Return failure result
      return {
        requestId,
        status: ReceiptStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
        processingTime: processingTime / 1000,
      };
    }
  }

  /**
   * Load image from file path
   */
  private async loadImage(imageUrl: string): Promise<any> {
    try {
      // For local file paths, read from filesystem
      if (imageUrl.startsWith('./') || imageUrl.startsWith('/') || path.isAbsolute(imageUrl)) {
        const imageBuffer = await fs.readFile(imageUrl);
        return imageBuffer;
      }

      // For URLs, this would require HTTP client (not implemented in this task)
      throw new Error(`Unsupported image URL format: ${imageUrl}`);
    } catch (error) {
      logger.error('Failed to load image', { imageUrl, error });
      throw new Error(`Failed to load image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up temporary image file
   */
  private async cleanupImage(imageUrl: string): Promise<void> {
    try {
      // Only clean up local temporary files
      if (imageUrl.startsWith('./temp/') || imageUrl.includes('/temp/')) {
        await fs.unlink(imageUrl);
        logger.debug('Temporary image file cleaned up', { imageUrl });
      }
    } catch (error) {
      // Don't throw on cleanup errors, just log them
      logger.warn('Failed to cleanup temporary image', { imageUrl, error });
    }
  }

  /**
   * Get worker health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy';
    initialized: boolean;
    queueHealth: any;
  }> {
    try {
      const queueHealth = await queueService.getHealthStatus();
      
      return {
        status: this.isInitialized && queueHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
        initialized: this.isInitialized,
        queueHealth,
      };
    } catch (error) {
      logger.error('Worker health check failed', { error });
      return {
        status: 'unhealthy',
        initialized: this.isInitialized,
        queueHealth: null,
      };
    }
  }

  /**
   * Gracefully shutdown the worker service
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down worker service...');
      
      // Close queue service
      await queueService.close();
      
      this.isInitialized = false;
      logger.info('Worker service shutdown completed');
    } catch (error) {
      logger.error('Error during worker service shutdown', { error });
      throw error;
    }
  }
}

// Export singleton instance
export const workerService = new WorkerService();