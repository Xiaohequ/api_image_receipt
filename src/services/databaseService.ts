import { database } from '../config/database';
import { receiptAnalysisRequestRepository, extractedReceiptDataRepository } from '../repositories';
import { logger } from '../utils/logger';

export class DatabaseService {
  private static instance: DatabaseService;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize database connection and ensure indexes
   */
  async initialize(): Promise<void> {
    try {
      // Connect to database
      await database.connect();
      
      // Ensure indexes are created
      await this.ensureIndexes();
      
      logger.info('Database service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database service:', error);
      throw error;
    }
  }

  /**
   * Ensure all required indexes are created
   */
  private async ensureIndexes(): Promise<void> {
    try {
      // The indexes are automatically created by Mongoose schemas
      // But we can explicitly ensure they exist
      await Promise.all([
        receiptAnalysisRequestRepository.model.createIndexes(),
        extractedReceiptDataRepository.model.createIndexes(),
      ]);
      
      logger.info('Database indexes ensured');
    } catch (error) {
      logger.error('Error ensuring database indexes:', error);
      throw error;
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<{
    status: 'up' | 'down';
    connectionState: string;
    responseTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Simple ping to check connection
      await receiptAnalysisRequestRepository.count({});
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: database.isHealthy() ? 'up' : 'down',
        connectionState: database.getConnectionState(),
        responseTime,
      };
    } catch (error) {
      logger.error('Database health check failed:', error);
      
      return {
        status: 'down',
        connectionState: database.getConnectionState(),
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalRequests: number;
    totalExtractedData: number;
    processingStats: any;
    analytics: any;
  }> {
    try {
      const [
        totalRequests,
        totalExtractedData,
        processingStats,
        analytics,
      ] = await Promise.all([
        receiptAnalysisRequestRepository.count(),
        extractedReceiptDataRepository.count(),
        receiptAnalysisRequestRepository.getProcessingStats(),
        extractedReceiptDataRepository.getAnalytics(),
      ]);

      return {
        totalRequests,
        totalExtractedData,
        processingStats,
        analytics,
      };
    } catch (error) {
      logger.error('Error getting database stats:', error);
      throw error;
    }
  }

  /**
   * Perform database cleanup
   */
  async cleanup(options: {
    requestsOlderThanDays?: number;
    dataOlderThanDays?: number;
  } = {}): Promise<{
    cleanedRequests: number;
    cleanedData: number;
  }> {
    try {
      const {
        requestsOlderThanDays = 30,
        dataOlderThanDays = 90,
      } = options;

      const [cleanedRequests, cleanedData] = await Promise.all([
        receiptAnalysisRequestRepository.cleanupOldRequests(requestsOlderThanDays),
        extractedReceiptDataRepository.cleanupOldData(dataOlderThanDays),
      ]);

      logger.info(`Database cleanup completed: ${cleanedRequests} requests, ${cleanedData} data records`);

      return {
        cleanedRequests,
        cleanedData,
      };
    } catch (error) {
      logger.error('Error during database cleanup:', error);
      throw error;
    }
  }

  /**
   * Gracefully disconnect from database
   */
  async disconnect(): Promise<void> {
    try {
      await database.disconnect();
      logger.info('Database service disconnected');
    } catch (error) {
      logger.error('Error disconnecting database service:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();