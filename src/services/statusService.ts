import { queueService } from './queueService';
import { cacheService } from './cacheService';
import { logger } from '../utils/logger';
import { 
  ReceiptStatus, 
  StatusResponse, 
  ResultResponse, 
  ExtractedReceiptData,
  ReceiptAnalysisRequest 
} from '../types';
import { AppError, ErrorCode } from '../types/errors';

// In-memory storage for results (in production, this would be a database)
interface StoredResult {
  requestId: string;
  status: ReceiptStatus;
  data?: ExtractedReceiptData;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  processingTime?: number;
}

class StatusService {
  private results: Map<string, StoredResult> = new Map();
  private readonly RESULT_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor() {
    // Clean up old results periodically
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        this.cleanupOldResults();
      }, 60 * 60 * 1000); // Run every hour
    }
  }

  /**
   * Initialize a new processing request
   */
  async initializeRequest(
    requestId: string,
    analysisRequest: ReceiptAnalysisRequest
  ): Promise<void> {
    const storedResult: StoredResult = {
      requestId,
      status: ReceiptStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.results.set(requestId, storedResult);

    logger.info('Processing request initialized', {
      requestId,
      clientId: analysisRequest.clientId,
      status: storedResult.status,
    });
  }

  /**
   * Get the current status of a processing request
   */
  async getStatus(requestId: string): Promise<StatusResponse> {
    try {
      // Check cache first for frequently accessed statuses
      const cachedStatus = await cacheService.getCachedStatus(requestId);
      if (cachedStatus) {
        logger.debug('Status cache hit', { requestId });
        return cachedStatus as StatusResponse;
      }

      // First check our local storage
      const storedResult = this.results.get(requestId);
      
      if (!storedResult) {
        throw new AppError(
          ErrorCode.INVALID_REQUEST,
          `Requête non trouvée: ${requestId}`,
          404
        );
      }

      // If status is pending or processing, check queue for updates
      if (storedResult.status === ReceiptStatus.PENDING || storedResult.status === ReceiptStatus.PROCESSING) {
        const queueStatus = await queueService.getJobStatus(requestId);
        
        if (queueStatus) {
          // Update stored result with queue information
          storedResult.status = queueStatus.status;
          storedResult.updatedAt = new Date();
          
          if (queueStatus.status === ReceiptStatus.COMPLETED && queueStatus.result) {
            storedResult.data = queueStatus.result.data;
            storedResult.completedAt = new Date();
            storedResult.processingTime = queueStatus.result.processingTime;
          } else if (queueStatus.status === ReceiptStatus.FAILED && queueStatus.error) {
            storedResult.error = queueStatus.error;
            storedResult.completedAt = new Date();
          }
          
          this.results.set(requestId, storedResult);
        }
      }

      // Calculate progress and estimated time remaining
      let progress = 0;
      let estimatedTimeRemaining: number | undefined;

      switch (storedResult.status) {
        case ReceiptStatus.PENDING:
          progress = 0;
          estimatedTimeRemaining = 30; // 30 seconds estimate
          break;
        case ReceiptStatus.PROCESSING:
          // Get progress from queue if available
          const queueStatus = await queueService.getJobStatus(requestId);
          progress = queueStatus?.progress || 50;
          estimatedTimeRemaining = Math.max(1, Math.round((100 - progress) * 0.3)); // Rough estimate
          break;
        case ReceiptStatus.COMPLETED:
        case ReceiptStatus.FAILED:
          progress = 100;
          estimatedTimeRemaining = 0;
          break;
      }

      const response: StatusResponse = {
        requestId,
        status: storedResult.status,
        progress,
        estimatedTimeRemaining,
        message: this.getStatusMessage(storedResult.status, storedResult.error),
      };

      // Cache the response for a short time to reduce load
      await cacheService.cacheStatus(requestId, response, { ttl: 30 });

      logger.debug('Status retrieved', {
        requestId,
        status: storedResult.status,
        progress,
      });

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Failed to get status', { requestId, error });
      throw new AppError(
        ErrorCode.PROCESSING_ERROR,
        'Erreur lors de la récupération du statut',
        500
      );
    }
  }

  /**
   * Get the result of a completed processing request
   */
  async getResult(requestId: string): Promise<ResultResponse> {
    try {
      const storedResult = this.results.get(requestId);
      
      if (!storedResult) {
        throw new AppError(
          ErrorCode.INVALID_REQUEST,
          `Requête non trouvée: ${requestId}`,
          404
        );
      }

      // If not completed, check queue for updates
      if (storedResult.status !== ReceiptStatus.COMPLETED && storedResult.status !== ReceiptStatus.FAILED) {
        const queueStatus = await queueService.getJobStatus(requestId);
        
        if (queueStatus && queueStatus.status === ReceiptStatus.COMPLETED && queueStatus.result) {
          storedResult.status = ReceiptStatus.COMPLETED;
          storedResult.data = queueStatus.result.data;
          storedResult.completedAt = new Date();
          storedResult.processingTime = queueStatus.result.processingTime;
          storedResult.updatedAt = new Date();
          
          this.results.set(requestId, storedResult);
        } else if (queueStatus && queueStatus.status === ReceiptStatus.FAILED) {
          storedResult.status = ReceiptStatus.FAILED;
          storedResult.error = queueStatus.error;
          storedResult.completedAt = new Date();
          storedResult.updatedAt = new Date();
          
          this.results.set(requestId, storedResult);
        }
      }

      // Check if processing is still in progress
      if (storedResult.status === ReceiptStatus.PENDING || storedResult.status === ReceiptStatus.PROCESSING) {
        throw new AppError(
          ErrorCode.PROCESSING_ERROR,
          'Le traitement est encore en cours. Veuillez vérifier le statut d\'abord.',
          202
        );
      }

      // Check if processing failed
      if (storedResult.status === ReceiptStatus.FAILED) {
        throw new AppError(
          ErrorCode.PROCESSING_ERROR,
          `Le traitement a échoué: ${storedResult.error || 'Erreur inconnue'}`,
          422
        );
      }

      // Return successful result
      const response: ResultResponse = {
        requestId,
        status: storedResult.status,
        data: storedResult.data,
        createdAt: storedResult.createdAt,
        completedAt: storedResult.completedAt,
      };

      // Cache the extracted data for future requests
      if (storedResult.data) {
        await cacheService.cacheExtractedData(requestId, storedResult.data, { ttl: 3600 });
      }

      logger.info('Result retrieved successfully', {
        requestId,
        status: storedResult.status,
        hasData: !!storedResult.data,
        processingTime: storedResult.processingTime,
      });

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error('Failed to get result', { requestId, error });
      throw new AppError(
        ErrorCode.PROCESSING_ERROR,
        'Erreur lors de la récupération du résultat',
        500
      );
    }
  }

  /**
   * Update the status of a processing request
   */
  async updateStatus(
    requestId: string,
    status: ReceiptStatus,
    data?: ExtractedReceiptData,
    error?: string
  ): Promise<void> {
    const storedResult = this.results.get(requestId);
    
    if (!storedResult) {
      logger.warn('Attempted to update status for unknown request', { requestId });
      return;
    }

    storedResult.status = status;
    storedResult.updatedAt = new Date();

    if (data) {
      storedResult.data = data;
    }

    if (error) {
      storedResult.error = error;
    }

    if (status === ReceiptStatus.COMPLETED || status === ReceiptStatus.FAILED) {
      storedResult.completedAt = new Date();
    }

    this.results.set(requestId, storedResult);

    logger.debug('Status updated', {
      requestId,
      status,
      hasData: !!data,
      hasError: !!error,
    });
  }

  /**
   * Remove a processing request and its results
   */
  async removeRequest(requestId: string): Promise<boolean> {
    const existed = this.results.has(requestId);
    this.results.delete(requestId);

    // Also try to remove from queue
    try {
      await queueService.removeJob(requestId);
    } catch (error) {
      logger.warn('Failed to remove job from queue', { requestId, error });
    }

    logger.info('Request removed', { requestId, existed });
    return existed;
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats() {
    const queueStats = await queueService.getProcessingStats();
    
    // Add local storage stats
    const localResults = Array.from(this.results.values());
    const completedLocal = localResults.filter(r => r.status === ReceiptStatus.COMPLETED).length;
    const failedLocal = localResults.filter(r => r.status === ReceiptStatus.FAILED).length;
    const pendingLocal = localResults.filter(r => r.status === ReceiptStatus.PENDING).length;
    const processingLocal = localResults.filter(r => r.status === ReceiptStatus.PROCESSING).length;

    return {
      ...queueStats,
      localStorage: {
        total: localResults.length,
        completed: completedLocal,
        failed: failedLocal,
        pending: pendingLocal,
        processing: processingLocal,
      },
    };
  }

  /**
   * Get status message based on current status
   */
  private getStatusMessage(status: ReceiptStatus, error?: string): string {
    switch (status) {
      case ReceiptStatus.PENDING:
        return 'Votre demande est en attente de traitement';
      case ReceiptStatus.PROCESSING:
        return 'Analyse de votre reçu en cours...';
      case ReceiptStatus.COMPLETED:
        return 'Analyse terminée avec succès';
      case ReceiptStatus.FAILED:
        return error ? `Échec de l'analyse: ${error}` : 'Échec de l\'analyse';
      default:
        return 'Statut inconnu';
    }
  }

  /**
   * Clean up old results to prevent memory leaks
   */
  private cleanupOldResults(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [requestId, result] of this.results.entries()) {
      const age = now - result.createdAt.getTime();
      
      // Remove results older than TTL
      if (age > this.RESULT_TTL) {
        this.results.delete(requestId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up old results', {
        cleanedCount,
        remainingCount: this.results.size,
      });
    }
  }
}

// Export singleton instance
export const statusService = new StatusService();