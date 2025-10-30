import { FilterQuery } from 'mongoose';
import { BaseRepository } from './BaseRepository';
import { ReceiptAnalysisRequestModel, ReceiptAnalysisRequestDocument } from '../models/ReceiptAnalysisRequest';
import { ReceiptStatus, PaginationParams, PaginatedResponse } from '../types';
import { logger } from '../utils/logger';

export class ReceiptAnalysisRequestRepository extends BaseRepository<ReceiptAnalysisRequestDocument> {
  constructor() {
    super(ReceiptAnalysisRequestModel);
  }

  /**
   * Find request by unique ID
   */
  async findByRequestId(requestId: string): Promise<ReceiptAnalysisRequestDocument | null> {
    try {
      return await this.model.findOne({ requestId: requestId }).exec();
    } catch (error) {
      logger.error('Error finding request by ID:', error);
      throw error;
    }
  }

  /**
   * Find requests by client ID with pagination and optimized query
   */
  async findByClientId(
    clientId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<ReceiptAnalysisRequestDocument>> {
    try {
      // Use lean() for better performance when we don't need full Mongoose documents
      return await this.findWithPagination(
        { clientId }, 
        pagination
      );
    } catch (error) {
      logger.error('Error finding requests by client ID:', error);
      throw error;
    }
  }

  /**
   * Find requests by status
   */
  async findByStatus(
    status: ReceiptStatus,
    pagination?: PaginationParams
  ): Promise<ReceiptAnalysisRequestDocument[] | PaginatedResponse<ReceiptAnalysisRequestDocument>> {
    try {
      if (pagination) {
        return await this.findWithPagination({ status }, pagination);
      }
      return await this.find({ status }, { sort: { createdAt: 1 } });
    } catch (error) {
      logger.error('Error finding requests by status:', error);
      throw error;
    }
  }

  /**
   * Update request status
   */
  async updateStatus(requestId: string, status: ReceiptStatus): Promise<ReceiptAnalysisRequestDocument | null> {
    try {
      return await this.updateOne(
        { requestId: requestId },
        { 
          status,
          updatedAt: new Date(),
        }
      );
    } catch (error) {
      logger.error('Error updating request status:', error);
      throw error;
    }
  }

  /**
   * Find pending requests for processing (ordered by priority and creation time)
   */
  async findPendingRequests(limit: number = 10): Promise<ReceiptAnalysisRequestDocument[]> {
    try {
      return await this.model
        .find({ status: ReceiptStatus.PENDING })
        .sort({
          'metadata.priority': -1, // high priority first
          createdAt: 1, // oldest first
        })
        .limit(limit)
        .exec();
    } catch (error) {
      logger.error('Error finding pending requests:', error);
      throw error;
    }
  }

  /**
   * Find requests by date range
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date,
    pagination?: PaginationParams
  ): Promise<ReceiptAnalysisRequestDocument[] | PaginatedResponse<ReceiptAnalysisRequestDocument>> {
    try {
      const filter: FilterQuery<ReceiptAnalysisRequestDocument> = {
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      };

      if (pagination) {
        return await this.findWithPagination(filter, pagination);
      }
      return await this.find(filter, { sort: { createdAt: -1 } });
    } catch (error) {
      logger.error('Error finding requests by date range:', error);
      throw error;
    }
  }

  /**
   * Get processing statistics using aggregation for better performance
   */
  async getProcessingStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    successRate: number;
  }> {
    try {
      // Use aggregation pipeline for better performance
      const stats = await this.model.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]).exec();

      // Initialize counters
      let total = 0;
      let pending = 0;
      let processing = 0;
      let completed = 0;
      let failed = 0;

      // Process aggregation results
      stats.forEach(stat => {
        total += stat.count;
        switch (stat._id) {
          case ReceiptStatus.PENDING:
            pending = stat.count;
            break;
          case ReceiptStatus.PROCESSING:
            processing = stat.count;
            break;
          case ReceiptStatus.COMPLETED:
            completed = stat.count;
            break;
          case ReceiptStatus.FAILED:
            failed = stat.count;
            break;
        }
      });

      const processedTotal = completed + failed;
      const successRate = processedTotal > 0 ? (completed / processedTotal) * 100 : 0;

      return {
        total,
        pending,
        processing,
        completed,
        failed,
        successRate: Math.round(successRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Error getting processing stats:', error);
      throw error;
    }
  }

  /**
   * Clean up old completed/failed requests
   */
  async cleanupOldRequests(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.model.deleteMany({
        status: { $in: [ReceiptStatus.COMPLETED, ReceiptStatus.FAILED] },
        updatedAt: { $lt: cutoffDate },
      }).exec();

      logger.info(`Cleaned up ${result.deletedCount} old requests`);
      return result.deletedCount || 0;
    } catch (error) {
      logger.error('Error cleaning up old requests:', error);
      throw error;
    }
  }

  /**
   * Find requests with failed status for retry
   */
  async findFailedRequestsForRetry(maxAttempts: number = 3): Promise<ReceiptAnalysisRequestDocument[]> {
    try {
      // This would require adding an attempts field to the schema
      // For now, just return failed requests
      return await this.find(
        { status: ReceiptStatus.FAILED },
        { sort: { updatedAt: 1 }, limit: 10 }
      );
    } catch (error) {
      logger.error('Error finding failed requests for retry:', error);
      throw error;
    }
  }
  
  /**
   * Batch update multiple requests for better performance
   */
  async batchUpdateStatus(
    requestIds: string[],
    status: ReceiptStatus
  ): Promise<number> {
    try {
      const result = await this.model.updateMany(
        { requestId: { $in: requestIds } },
        { 
          status,
          updatedAt: new Date(),
        }
      ).exec();

      logger.info(`Batch updated ${result.modifiedCount} requests to status ${status}`);
      return result.modifiedCount || 0;
    } catch (error) {
      logger.error('Error batch updating request status:', error);
      throw error;
    }
  }

  /**
   * Get analytics data using aggregation pipeline
   */
  async getAnalytics(days: number = 30): Promise<{
    dailyStats: Array<{
      date: string;
      total: number;
      completed: number;
      failed: number;
      successRate: number;
    }>;
    topClients: Array<{
      clientId: string;
      requestCount: number;
      successRate: number;
    }>;
  }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Daily statistics aggregation
      const dailyStats = await this.model.aggregate([
        {
          $match: {
            createdAt: { $gte: cutoffDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            total: { $sum: 1 },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', ReceiptStatus.COMPLETED] }, 1, 0]
              }
            },
            failed: {
              $sum: {
                $cond: [{ $eq: ['$status', ReceiptStatus.FAILED] }, 1, 0]
              }
            }
          }
        },
        {
          $addFields: {
            successRate: {
              $cond: [
                { $gt: [{ $add: ['$completed', '$failed'] }, 0] },
                {
                  $multiply: [
                    { $divide: ['$completed', { $add: ['$completed', '$failed'] }] },
                    100
                  ]
                },
                0
              ]
            }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]).exec();

      // Top clients aggregation
      const topClients = await this.model.aggregate([
        {
          $match: {
            createdAt: { $gte: cutoffDate }
          }
        },
        {
          $group: {
            _id: '$clientId',
            requestCount: { $sum: 1 },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', ReceiptStatus.COMPLETED] }, 1, 0]
              }
            },
            failed: {
              $sum: {
                $cond: [{ $eq: ['$status', ReceiptStatus.FAILED] }, 1, 0]
              }
            }
          }
        },
        {
          $addFields: {
            successRate: {
              $cond: [
                { $gt: [{ $add: ['$completed', '$failed'] }, 0] },
                {
                  $multiply: [
                    { $divide: ['$completed', { $add: ['$completed', '$failed'] }] },
                    100
                  ]
                },
                0
              ]
            }
          }
        },
        {
          $sort: { requestCount: -1 }
        },
        {
          $limit: 10
        }
      ]).exec();

      return {
        dailyStats: dailyStats.map(stat => ({
          date: stat._id,
          total: stat.total,
          completed: stat.completed,
          failed: stat.failed,
          successRate: Math.round(stat.successRate * 100) / 100
        })),
        topClients: topClients.map(client => ({
          clientId: client._id,
          requestCount: client.requestCount,
          successRate: Math.round(client.successRate * 100) / 100
        }))
      };
    } catch (error) {
      logger.error('Error getting analytics:', error);
      throw error;
    }
  }
}