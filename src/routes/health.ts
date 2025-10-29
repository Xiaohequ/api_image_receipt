import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { queueService } from '../services/queueService';
import { workerService } from '../services/workerService';
import { statusService } from '../services/statusService';
import { databaseService } from '../services/databaseService';
import { cacheService } from '../services/cacheService';
import { performanceService } from '../services/performanceService';

const router = Router();

// GET /health - Health check endpoint
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // Get health status from services
    const [queueHealth, workerHealth, databaseHealth, cacheHealth, processingStats, performanceMetrics] = await Promise.all([
      queueService.getHealthStatus().catch(() => ({ 
        status: 'unhealthy' as const, 
        queueLength: 0, 
        activeJobs: 0, 
        failedJobs: 0, 
        redisConnection: false 
      })),
      workerService.getHealthStatus().catch(() => ({ status: 'unhealthy' as const, initialized: false })),
      databaseService.healthCheck().catch(() => ({ 
        status: 'down' as const, 
        connectionState: 'disconnected', 
        responseTime: 0 
      })),
      cacheService.healthCheck().catch(() => ({ 
        status: 'unhealthy' as const, 
        connected: false, 
        responseTime: 0 
      })),
      statusService.getProcessingStats().catch(() => null),
      performanceService.getMetrics()
    ]);

    // Determine overall status
    const isHealthy = queueHealth.status === 'healthy' && 
                     workerHealth.status === 'healthy' && 
                     queueHealth.redisConnection &&
                     databaseHealth.status === 'up' &&
                     cacheHealth.status === 'healthy';

    const healthCheck = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'Receipt Analyzer API',
      version: '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        server: 'up',
        redis: queueHealth.redisConnection ? 'up' : 'down',
        queue: queueHealth.status === 'healthy' ? 'up' : 'down',
        worker: workerHealth.status === 'healthy' ? 'up' : 'down',
        database: databaseHealth.status,
        cache: cacheHealth.status === 'healthy' ? 'up' : 'down',
        // TODO: Add OCR service health check in task 5
        ocr: 'not_configured'
      },
      queue: {
        status: queueHealth.status,
        queueLength: queueHealth.queueLength,
        activeJobs: queueHealth.activeJobs,
        failedJobs: queueHealth.failedJobs
      },
      worker: {
        status: workerHealth.status,
        initialized: workerHealth.initialized
      },
      cache: {
        status: cacheHealth.status,
        connected: cacheHealth.connected,
        responseTime: cacheHealth.responseTime
      },
      performance: {
        totalTasks: performanceMetrics.totalTasks,
        completedTasks: performanceMetrics.completedTasks,
        failedTasks: performanceMetrics.failedTasks,
        averageProcessingTime: performanceMetrics.averageProcessingTime,
        throughput: performanceMetrics.throughput,
        cpuUsage: performanceMetrics.cpuUsage,
        memoryUsage: performanceMetrics.memoryUsage
      },
      processing: processingStats ? {
        totalProcessed: processingStats.totalProcessed,
        successRate: processingStats.successRate,
        averageProcessingTime: processingStats.averageProcessingTime
      } : null
    };

    logger.info('Health check requested', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      status: healthCheck.status,
      queueLength: queueHealth.queueLength,
      activeJobs: queueHealth.activeJobs
    });

    const statusCode = isHealthy ? 200 : 503;
    res.status(statusCode).json(healthCheck);
  } catch (error) {
    logger.error('Health check failed', { error });
    
    const errorResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'Receipt Analyzer API',
      version: '1.0.0',
      error: 'Health check failed'
    };
    
    res.status(503).json(errorResponse);
  }
});

export default router;

// GET /health/cache - Cache statistics endpoint
router.get('/cache', async (req: Request, res: Response): Promise<void> => {
  try {
    const cacheStats = await cacheService.getStats();
    const cacheHealth = await cacheService.healthCheck();

    const response = {
      status: cacheHealth.status,
      connected: cacheHealth.connected,
      responseTime: cacheHealth.responseTime,
      stats: cacheStats,
      timestamp: new Date().toISOString()
    };

    logger.info('Cache stats requested', {
      ip: req.ip,
      totalKeys: cacheStats.totalKeys,
      memoryUsage: cacheStats.memoryUsage
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Cache stats request failed', { error });
    
    res.status(503).json({
      status: 'error',
      message: 'Failed to retrieve cache statistics',
      timestamp: new Date().toISOString()
    });
  }
});

// GET /health/performance - Performance metrics endpoint
router.get('/performance', async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = performanceService.getMetrics();

    const response = {
      metrics,
      timestamp: new Date().toISOString()
    };

    logger.info('Performance metrics requested', {
      ip: req.ip,
      totalTasks: metrics.totalTasks,
      throughput: metrics.throughput
    });

    res.status(200).json(response);
  } catch (error) {
    logger.error('Performance metrics request failed', { error });
    
    res.status(503).json({
      status: 'error',
      message: 'Failed to retrieve performance metrics',
      timestamp: new Date().toISOString()
    });
  }
});