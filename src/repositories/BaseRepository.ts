import { Document, Model, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';
import { PaginationParams, PaginatedResponse } from '../types';
import { logger } from '../utils/logger';

export abstract class BaseRepository<T extends Document> {
  protected model: Model<T>;

  constructor(model: Model<T>) {
    this.model = model;
  }

  async create(data: Partial<T>): Promise<T> {
    try {
      const document = new this.model(data);
      return await document.save();
    } catch (error) {
      logger.error(`Error creating document in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async findById(id: string): Promise<T | null> {
    try {
      return await this.model.findById(id).exec();
    } catch (error) {
      logger.error(`Error finding document by ID in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    try {
      return await this.model.findOne(filter).exec();
    } catch (error) {
      logger.error(`Error finding document in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async find(filter: FilterQuery<T> = {}, options?: QueryOptions): Promise<T[]> {
    try {
      return await this.model.find(filter, null, options).exec();
    } catch (error) {
      logger.error(`Error finding documents in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async findWithPagination(
    filter: FilterQuery<T> = {},
    pagination: PaginationParams
  ): Promise<PaginatedResponse<T>> {
    try {
      const { page, limit, sortBy, sortOrder } = pagination;
      const skip = (page - 1) * limit;
      
      const sortOptions: Record<string, 1 | -1> = {
        [sortBy]: sortOrder === 'asc' ? 1 : -1,
      };

      const [data, total] = await Promise.all([
        this.model
          .find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .exec(),
        this.model.countDocuments(filter).exec(),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error(`Error finding documents with pagination in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async updateById(id: string, update: UpdateQuery<T>): Promise<T | null> {
    try {
      return await this.model
        .findByIdAndUpdate(id, update, { new: true, runValidators: true })
        .exec();
    } catch (error) {
      logger.error(`Error updating document by ID in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async updateOne(filter: FilterQuery<T>, update: UpdateQuery<T>): Promise<T | null> {
    try {
      return await this.model
        .findOneAndUpdate(filter, update, { new: true, runValidators: true })
        .exec();
    } catch (error) {
      logger.error(`Error updating document in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async updateMany(filter: FilterQuery<T>, update: UpdateQuery<T>): Promise<number> {
    try {
      const result = await this.model.updateMany(filter, update).exec();
      return result.modifiedCount;
    } catch (error) {
      logger.error(`Error updating multiple documents in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async deleteById(id: string): Promise<T | null> {
    try {
      return await this.model.findByIdAndDelete(id).exec();
    } catch (error) {
      logger.error(`Error deleting document by ID in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async deleteOne(filter: FilterQuery<T>): Promise<T | null> {
    try {
      return await this.model.findOneAndDelete(filter).exec();
    } catch (error) {
      logger.error(`Error deleting document in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async deleteMany(filter: FilterQuery<T>): Promise<number> {
    try {
      const result = await this.model.deleteMany(filter).exec();
      return result.deletedCount || 0;
    } catch (error) {
      logger.error(`Error deleting multiple documents in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async count(filter: FilterQuery<T> = {}): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error) {
      logger.error(`Error counting documents in ${this.model.modelName}:`, error);
      throw error;
    }
  }

  async exists(filter: FilterQuery<T>): Promise<boolean> {
    try {
      const result = await this.model.exists(filter).exec();
      return result !== null;
    } catch (error) {
      logger.error(`Error checking document existence in ${this.model.modelName}:`, error);
      throw error;
    }
  }
}