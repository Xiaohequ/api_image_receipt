import { FilterQuery } from 'mongoose';
import { BaseRepository } from './BaseRepository';
import { ExtractedReceiptDataModel, ExtractedReceiptDataDocument } from '../models/ExtractedReceiptData';
import { ReceiptType, PaginationParams, PaginatedResponse } from '../types';
import { logger } from '../utils/logger';

export class ExtractedReceiptDataRepository extends BaseRepository<ExtractedReceiptDataDocument> {
  constructor() {
    super(ExtractedReceiptDataModel);
  }

  /**
   * Find extracted data by request ID
   */
  async findByRequestId(requestId: string): Promise<ExtractedReceiptDataDocument | null> {
    try {
      return await this.model.findOne({ requestId }).exec();
    } catch (error) {
      logger.error('Error finding extracted data by request ID:', error);
      throw error;
    }
  }

  /**
   * Find extracted data by receipt type
   */
  async findByReceiptType(
    receiptType: ReceiptType,
    pagination?: PaginationParams
  ): Promise<ExtractedReceiptDataDocument[] | PaginatedResponse<ExtractedReceiptDataDocument>> {
    try {
      if (pagination) {
        return await this.findWithPagination({ receiptType }, pagination);
      }
      return await this.find({ receiptType }, { sort: { extractedAt: -1 } });
    } catch (error) {
      logger.error('Error finding extracted data by receipt type:', error);
      throw error;
    }
  }

  /**
   * Search by merchant name
   */
  async searchByMerchant(
    merchantName: string,
    pagination?: PaginationParams
  ): Promise<ExtractedReceiptDataDocument[] | PaginatedResponse<ExtractedReceiptDataDocument>> {
    try {
      const filter: FilterQuery<ExtractedReceiptDataDocument> = {
        'extractedFields.merchantName.value': {
          $regex: merchantName,
          $options: 'i', // case insensitive
        },
      };

      if (pagination) {
        return await this.findWithPagination(filter, pagination);
      }
      return await this.find(filter, { sort: { extractedAt: -1 } });
    } catch (error) {
      logger.error('Error searching by merchant name:', error);
      throw error;
    }
  }

  /**
   * Find receipts by amount range
   */
  async findByAmountRange(
    minAmount: number,
    maxAmount: number,
    pagination?: PaginationParams
  ): Promise<ExtractedReceiptDataDocument[] | PaginatedResponse<ExtractedReceiptDataDocument>> {
    try {
      const filter: FilterQuery<ExtractedReceiptDataDocument> = {
        'extractedFields.totalAmount.value': {
          $gte: minAmount,
          $lte: maxAmount,
        },
      };

      if (pagination) {
        return await this.findWithPagination(filter, pagination);
      }
      return await this.find(filter, { sort: { 'extractedFields.totalAmount.value': -1 } });
    } catch (error) {
      logger.error('Error finding receipts by amount range:', error);
      throw error;
    }
  }

  /**
   * Find receipts by date range
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date,
    pagination?: PaginationParams
  ): Promise<ExtractedReceiptDataDocument[] | PaginatedResponse<ExtractedReceiptDataDocument>> {
    try {
      const filter: FilterQuery<ExtractedReceiptDataDocument> = {
        extractedAt: {
          $gte: startDate,
          $lte: endDate,
        },
      };

      if (pagination) {
        return await this.findWithPagination(filter, pagination);
      }
      return await this.find(filter, { sort: { extractedAt: -1 } });
    } catch (error) {
      logger.error('Error finding receipts by date range:', error);
      throw error;
    }
  }

  /**
   * Get analytics data
   */
  async getAnalytics(): Promise<{
    totalReceipts: number;
    averageAmount: number;
    totalAmount: number;
    receiptTypeDistribution: Record<ReceiptType, number>;
    averageProcessingTime: number;
    averageConfidence: number;
  }> {
    try {
      const [
        totalReceipts,
        amountStats,
        typeDistribution,
        processingStats,
        confidenceStats,
      ] = await Promise.all([
        this.count(),
        this.model.aggregate([
          {
            $group: {
              _id: null,
              averageAmount: { $avg: '$extractedFields.totalAmount.value' },
              totalAmount: { $sum: '$extractedFields.totalAmount.value' },
            },
          },
        ]).exec(),
        this.model.aggregate([
          {
            $group: {
              _id: '$receiptType',
              count: { $sum: 1 },
            },
          },
        ]).exec(),
        this.model.aggregate([
          {
            $group: {
              _id: null,
              averageProcessingTime: { $avg: '$processingMetadata.processingTime' },
            },
          },
        ]).exec(),
        this.model.aggregate([
          {
            $group: {
              _id: null,
              averageOcrConfidence: { $avg: '$processingMetadata.ocrConfidence' },
              averageAiConfidence: { $avg: '$processingMetadata.aiConfidence' },
            },
          },
        ]).exec(),
      ]);

      // Process type distribution
      const receiptTypeDistribution: Record<ReceiptType, number> = {
        [ReceiptType.RETAIL]: 0,
        [ReceiptType.CARD_PAYMENT]: 0,
        [ReceiptType.CASH_REGISTER]: 0,
        [ReceiptType.UNKNOWN]: 0,
      };

      typeDistribution.forEach((item: any) => {
        receiptTypeDistribution[item._id as ReceiptType] = item.count;
      });

      return {
        totalReceipts,
        averageAmount: amountStats[0]?.averageAmount || 0,
        totalAmount: amountStats[0]?.totalAmount || 0,
        receiptTypeDistribution,
        averageProcessingTime: processingStats[0]?.averageProcessingTime || 0,
        averageConfidence: (
          (confidenceStats[0]?.averageOcrConfidence || 0) +
          (confidenceStats[0]?.averageAiConfidence || 0)
        ) / 2,
      };
    } catch (error) {
      logger.error('Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Find receipts with low confidence for review
   */
  async findLowConfidenceReceipts(
    confidenceThreshold: number = 70,
    pagination?: PaginationParams
  ): Promise<ExtractedReceiptDataDocument[] | PaginatedResponse<ExtractedReceiptDataDocument>> {
    try {
      const filter: FilterQuery<ExtractedReceiptDataDocument> = {
        $or: [
          { 'processingMetadata.ocrConfidence': { $lt: confidenceThreshold } },
          { 'processingMetadata.aiConfidence': { $lt: confidenceThreshold } },
          { 'extractedFields.totalAmount.confidence': { $lt: confidenceThreshold } },
          { 'extractedFields.merchantName.confidence': { $lt: confidenceThreshold } },
        ],
      };

      if (pagination) {
        return await this.findWithPagination(filter, pagination);
      }
      return await this.find(filter, { sort: { extractedAt: -1 } });
    } catch (error) {
      logger.error('Error finding low confidence receipts:', error);
      throw error;
    }
  }

  /**
   * Get top merchants by transaction count
   */
  async getTopMerchants(limit: number = 10): Promise<Array<{ merchant: string; count: number; totalAmount: number }>> {
    try {
      const result = await this.model.aggregate([
        {
          $group: {
            _id: '$extractedFields.merchantName.value',
            count: { $sum: 1 },
            totalAmount: { $sum: '$extractedFields.totalAmount.value' },
          },
        },
        {
          $sort: { count: -1 },
        },
        {
          $limit: limit,
        },
        {
          $project: {
            merchant: '$_id',
            count: 1,
            totalAmount: 1,
            _id: 0,
          },
        },
      ]).exec();

      return result;
    } catch (error) {
      logger.error('Error getting top merchants:', error);
      throw error;
    }
  }

  /**
   * Clean up old extracted data
   */
  async cleanupOldData(olderThanDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.model.deleteMany({
        extractedAt: { $lt: cutoffDate },
      }).exec();

      logger.info(`Cleaned up ${result.deletedCount} old extracted data records`);
      return result.deletedCount || 0;
    } catch (error) {
      logger.error('Error cleaning up old extracted data:', error);
      throw error;
    }
  }
}