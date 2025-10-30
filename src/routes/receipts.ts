import { Router, Request, Response, NextFunction } from 'express';
import { validateRequest, schemas } from '../middleware/validation';
import { AppError, ErrorCode } from '../types/errors';
import { analysisRateLimiter } from '../middleware/simpleRateLimiter';
import { uploadReceiptImage, processUploadedFile } from '../middleware/upload';
import { statusCacheMiddleware, resultCacheMiddleware, statsCacheMiddleware } from '../middleware/cache';
import { authenticateApiKey, requirePermission, requireAdmin } from '../middleware/auth';
import { uploadService } from '../services/uploadService';
import { queueService } from '../services/queueService';
import { statusService } from '../services/statusService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// POST /api/v1/receipts/analyze - Submit receipt image for analysis
router.post('/analyze',
  authenticateApiKey,
  requirePermission('analyze'),
  analysisRateLimiter,
  uploadReceiptImage,
  processUploadedFile,
  validateRequest({ body: schemas.analyzeRequest }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract upload data from middleware
      if (!req.uploadData) {
        throw new AppError(
          ErrorCode.PROCESSING_ERROR,
          'Données d\'upload manquantes',
          500
        );
      }

      const { requestId, file, imageMetadata } = req.uploadData;
      const { clientId, metadata } = req.body;

      logger.info('Receipt analysis request received', {
        requestId,
        clientId,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        metadata
      });

      // Save uploaded file to temporary storage
      const filePath = await uploadService.saveUploadedFile(
        requestId,
        file.buffer,
        imageMetadata,
        clientId
      );

      // Create analysis request record
      const analysisRequest = await uploadService.createAnalysisRequest(
        requestId,
        filePath,
        imageMetadata,
        clientId,
        metadata
      );

      // Initialize status tracking
      await statusService.initializeRequest(requestId, analysisRequest);

      // Add job to processing queue
      await queueService.addProcessingJob(
        requestId,
        filePath,
        clientId,
        metadata
      );

      // Generate response
      const uploadResponse = uploadService.generateUploadResponse(requestId);

      // Prepare API response
      const response = {
        success: true,
        requestId,
        data: uploadResponse,
        processingTime: 0,
        timestamp: new Date()
      };

      logger.info('Receipt analysis request queued successfully', {
        requestId,
        clientId,
        status: uploadResponse.status
      });

      res.status(202).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/receipts/:id/status - Check processing status
router.get('/:id/status',
  authenticateApiKey,
  requirePermission('status'),
  statusCacheMiddleware,
  validateRequest({ params: schemas.receiptId }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      logger.info('Status check request', { requestId: id });

      // Get status from status service
      const statusData = await statusService.getStatus(id);

      const response = {
        success: true,
        requestId: id,
        data: statusData,
        processingTime: 0,
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/receipts/:id/result - Get analysis results
router.get('/:id/result',
  authenticateApiKey,
  requirePermission('result'),
  resultCacheMiddleware,
  validateRequest({ params: schemas.receiptId }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      logger.info('Result request', { requestId: id });

      // Get result from status service
      const resultData = await statusService.getResult(id);

      const response = {
        success: true,
        requestId: id,
        data: resultData,
        processingTime: 0,
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/receipts/stats - Get processing statistics (admin endpoint)
router.get('/stats',
  authenticateApiKey,
  requireAdmin,
  statsCacheMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      logger.info('Processing stats request');

      // Get processing statistics
      const stats = await statusService.getProcessingStats();
      const queueHealth = await queueService.getHealthStatus();

      const response = {
        success: true,
        data: {
          ...stats,
          queueHealth: {
            status: queueHealth.status,
            queueLength: queueHealth.queueLength,
            activeJobs: queueHealth.activeJobs,
            failedJobs: queueHealth.failedJobs,
            redisConnection: queueHealth.redisConnection
          }
        },
        processingTime: 0,
        timestamp: new Date()
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;