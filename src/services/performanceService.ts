import { logger } from '../utils/logger';
import { config } from '../config/config';

export interface ParallelTask<T, R> {
  id: string;
  data: T;
  priority?: 'low' | 'normal' | 'high';
}

export interface ParallelResult<R> {
  id: string;
  result?: R;
  error?: Error;
  processingTime: number;
}

export interface PerformanceMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageProcessingTime: number;
  throughput: number; // tasks per second
  cpuUsage: number;
  memoryUsage: number;
}

class PerformanceService {
  private readonly maxWorkers: number;
  private readonly taskQueue: Map<string, ParallelTask<any, any>> = new Map();
  private readonly metrics: PerformanceMetrics = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageProcessingTime: 0,
    throughput: 0,
    cpuUsage: 0,
    memoryUsage: 0,
  };
  private metricsStartTime = Date.now();

  constructor() {
    // Use a reasonable default for concurrent processing
    this.maxWorkers = Math.min(Math.max(2, 4), 8);
    
    logger.info('Performance service initialized', {
      maxWorkers: this.maxWorkers,
    });
  }

  /**
   * Process multiple OCR tasks in parallel (simplified version without worker threads)
   */
  async processOCRInParallel<T, R>(
    tasks: ParallelTask<T, R>[],
    processingFunction: (data: T) => Promise<R>,
    options: {
      timeout?: number;
      maxConcurrency?: number;
    } = {}
  ): Promise<ParallelResult<R>[]> {
    const { timeout = 30000, maxConcurrency = this.maxWorkers } = options;
    
    logger.info('Starting parallel OCR processing', {
      taskCount: tasks.length,
      maxConcurrency,
      timeout,
    });

    const startTime = Date.now();
    
    // Sort tasks by priority
    const sortedTasks = this.sortTasksByPriority(tasks);
    
    // Process tasks with controlled concurrency
    const results = await this.processTasksWithConcurrency(
      sortedTasks,
      processingFunction,
      maxConcurrency,
      timeout
    );

    const totalTime = Date.now() - startTime;
    this.updateMetrics(tasks.length, results, totalTime);

    logger.info('Parallel OCR processing completed', {
      taskCount: tasks.length,
      successCount: results.filter(r => !r.error).length,
      failureCount: results.filter(r => r.error).length,
      totalTime,
      averageTime: totalTime / tasks.length,
    });

    return results;
  }

  /**
   * Process AI extraction tasks in parallel
   */
  async processAIExtractionInParallel<T, R>(
    tasks: ParallelTask<T, R>[],
    extractionFunction: (data: T) => Promise<R>,
    options: {
      maxConcurrency?: number;
      timeout?: number;
    } = {}
  ): Promise<ParallelResult<R>[]> {
    const { maxConcurrency = this.maxWorkers, timeout = 15000 } = options;
    
    logger.info('Starting parallel AI extraction', {
      taskCount: tasks.length,
      maxConcurrency,
    });

    const startTime = Date.now();
    
    // Sort tasks by priority
    const sortedTasks = this.sortTasksByPriority(tasks);
    
    // Process tasks with controlled concurrency
    const results = await this.processTasksWithConcurrency(
      sortedTasks,
      extractionFunction,
      maxConcurrency,
      timeout
    );

    const totalTime = Date.now() - startTime;
    this.updateMetrics(tasks.length, results, totalTime);

    logger.info('Parallel AI extraction completed', {
      taskCount: tasks.length,
      successCount: results.filter(r => !r.error).length,
      failureCount: results.filter(r => r.error).length,
      totalTime,
      averageTime: totalTime / tasks.length,
    });

    return results;
  }

  /**
   * Optimize database queries by batching and parallel execution
   */
  async optimizeDatabaseQueries<T, R>(
    queries: Array<{
      id: string;
      query: () => Promise<R>;
      priority?: 'low' | 'normal' | 'high';
    }>,
    options: {
      maxConcurrency?: number;
      batchSize?: number;
    } = {}
  ): Promise<Array<{ id: string; result?: R; error?: Error }>> {
    const { maxConcurrency = 5, batchSize = 10 } = options;
    
    logger.info('Optimizing database queries', {
      queryCount: queries.length,
      maxConcurrency,
      batchSize,
    });

    const results: Array<{ id: string; result?: R; error?: Error }> = [];
    
    // Sort queries by priority
    const sortedQueries = queries.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return (priorityOrder[b.priority || 'normal'] || 2) - (priorityOrder[a.priority || 'normal'] || 2);
    });
    
    // Process queries in batches
    for (let i = 0; i < sortedQueries.length; i += batchSize) {
      const batch = sortedQueries.slice(i, i + batchSize);
      
      // Create semaphore for this batch
      const semaphore = new Semaphore(Math.min(maxConcurrency, batch.length));
      
      const batchPromises = batch.map(async (queryItem) => {
        await semaphore.acquire();
        
        try {
          const result = await queryItem.query();
          return { id: queryItem.id, result };
        } catch (error) {
          return { id: queryItem.id, error: error as Error };
        } finally {
          semaphore.release();
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    logger.info('Database query optimization completed', {
      queryCount: queries.length,
      successCount: results.filter(r => !r.error).length,
      failureCount: results.filter(r => r.error).length,
    });

    return results;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - this.metricsStartTime) / 1000;
    
    return {
      ...this.metrics,
      throughput: elapsedSeconds > 0 ? this.metrics.completedTasks / elapsedSeconds : 0,
      cpuUsage: this.getCPUUsage(),
      memoryUsage: this.getMemoryUsage(),
    };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics.totalTasks = 0;
    this.metrics.completedTasks = 0;
    this.metrics.failedTasks = 0;
    this.metrics.averageProcessingTime = 0;
    this.metricsStartTime = Date.now();
    
    logger.info('Performance metrics reset');
  }

  /**
   * Process tasks with controlled concurrency using Promise.all batching
   */
  private async processTasksWithConcurrency<T, R>(
    tasks: ParallelTask<T, R>[],
    processingFunction: (data: T) => Promise<R>,
    maxConcurrency: number,
    timeout: number
  ): Promise<ParallelResult<R>[]> {
    const results: ParallelResult<R>[] = [];
    
    // Process tasks in batches
    for (let i = 0; i < tasks.length; i += maxConcurrency) {
      const batch = tasks.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (task) => {
        const startTime = Date.now();
        
        try {
          // Create timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            const timer = global.setTimeout(() => reject(new Error('Task timeout')), timeout);
            return timer;
          });
          
          // Race between processing and timeout
          const result = await Promise.race([
            processingFunction(task.data),
            timeoutPromise,
          ]);
          
          const processingTime = Date.now() - startTime;
          
          return {
            id: task.id,
            result,
            processingTime,
          } as ParallelResult<R>;
        } catch (error) {
          const processingTime = Date.now() - startTime;
          
          return {
            id: task.id,
            error: error as Error,
            processingTime,
          } as ParallelResult<R>;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Sort tasks by priority
   */
  private sortTasksByPriority<T, R>(tasks: ParallelTask<T, R>[]): ParallelTask<T, R>[] {
    return tasks.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      return (priorityOrder[b.priority || 'normal'] || 2) - (priorityOrder[a.priority || 'normal'] || 2);
    });
  }

  /**
   * Update performance metrics
   */
  private updateMetrics<R>(
    taskCount: number,
    results: ParallelResult<R>[],
    totalTime: number
  ): void {
    this.metrics.totalTasks += taskCount;
    this.metrics.completedTasks += results.filter(r => !r.error).length;
    this.metrics.failedTasks += results.filter(r => r.error).length;
    
    // Update average processing time
    const totalProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0);
    const newAverage = totalProcessingTime / results.length;
    
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime * (this.metrics.totalTasks - taskCount) + 
       newAverage * taskCount) / this.metrics.totalTasks;
  }

  /**
   * Get current CPU usage (simplified)
   */
  private getCPUUsage(): number {
    // This is a simplified CPU usage calculation
    // In a real implementation, you might use a library like 'pidusage'
    return Math.min(50, 100); // Return a reasonable default
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): number {
    try {
      const memUsage = global.process.memoryUsage();
      return Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    } catch {
      return 0;
    }
  }

  /**
   * Cleanup performance service
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up performance service');
    
    // Clear task queue
    this.taskQueue.clear();
    
    logger.info('Performance service cleanup completed');
  }
}

/**
 * Semaphore class for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (this.permits > 0) {
        this.permits--;
        resolve();
      } else {
        this.waitQueue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}

// Export singleton instance
export const performanceService = new PerformanceService();