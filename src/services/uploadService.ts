import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { ImageMetadata, ReceiptAnalysisRequest, ReceiptStatus, UploadResponse, ReceiptType } from '../types';
import { logger } from '../utils/logger';
import { AppError, ErrorCode } from '../types/errors';

// Configuration for upload service
const UPLOAD_CONFIG = {
  tempDir: process.env.TEMP_UPLOAD_DIR || './temp/uploads',
  maxRetentionHours: 24, // Keep files for 24 hours
  cleanupIntervalMinutes: 60 // Run cleanup every hour
};

export class UploadService {
  private static instance: UploadService;
  private cleanupTimer?: NodeJS.Timeout;

  private constructor() {
    this.initializeTempDirectory();
    this.startCleanupTimer();
  }

  public static getInstance(): UploadService {
    if (!UploadService.instance) {
      UploadService.instance = new UploadService();
    }
    return UploadService.instance;
  }

  /**
   * Initialize temporary directory for file storage
   */
  private async initializeTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(UPLOAD_CONFIG.tempDir, { recursive: true });
      logger.info('Temporary upload directory initialized', { 
        tempDir: UPLOAD_CONFIG.tempDir 
      });
    } catch (error) {
      logger.error('Failed to initialize temporary upload directory', {
        tempDir: UPLOAD_CONFIG.tempDir,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Erreur d\'initialisation du service d\'upload',
        500
      );
    }
  }

  /**
   * Start cleanup timer for old files
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(
      () => this.cleanupOldFiles(),
      UPLOAD_CONFIG.cleanupIntervalMinutes * 60 * 1000
    );
    
    logger.info('Upload cleanup timer started', {
      intervalMinutes: UPLOAD_CONFIG.cleanupIntervalMinutes
    });
  }

  /**
   * Stop cleanup timer
   */
  public stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      logger.info('Upload cleanup timer stopped');
    }
  }

  /**
   * Save uploaded file to temporary storage
   */
  public async saveUploadedFile(
    requestId: string,
    fileBuffer: Buffer,
    imageMetadata: ImageMetadata,
    clientId?: string
  ): Promise<string> {
    try {
      // Generate filename with extension based on format
      const extension = this.getFileExtension(imageMetadata.format);
      const filename = `${requestId}.${extension}`;
      const filePath = path.join(UPLOAD_CONFIG.tempDir, filename);

      // Save file to disk
      await fs.writeFile(filePath, fileBuffer);

      // Create metadata file
      const metadataPath = path.join(UPLOAD_CONFIG.tempDir, `${requestId}.meta.json`);
      const metadata = {
        requestId,
        clientId,
        imageMetadata,
        uploadedAt: new Date().toISOString(),
        filePath,
        originalSize: fileBuffer.length
      };
      
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      logger.info('File saved to temporary storage', {
        requestId,
        filename,
        size: fileBuffer.length,
        clientId
      });

      return filePath;
    } catch (error) {
      logger.error('Failed to save uploaded file', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new AppError(
        ErrorCode.PROCESSING_ERROR,
        'Erreur lors de la sauvegarde du fichier',
        500,
        { requestId }
      );
    }
  }

  /**
   * Create receipt analysis request record
   */
  public async createAnalysisRequest(
    requestId: string,
    filePath: string,
    imageMetadata: ImageMetadata,
    clientId?: string,
    metadata?: {
      source?: string;
      expectedType?: ReceiptType;
    }
  ): Promise<ReceiptAnalysisRequest> {
    const analysisRequest: ReceiptAnalysisRequest = {
      id: requestId,
      clientId: clientId || 'anonymous',
      imageUrl: filePath, // In production, this would be a URL to cloud storage
      imageMetadata,
      status: ReceiptStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        source: metadata?.source,
        expectedType: metadata?.expectedType,
        priority: 'normal'
      }
    };

    // In a real implementation, this would be saved to a database
    // For now, we'll save it as a JSON file
    try {
      const requestPath = path.join(UPLOAD_CONFIG.tempDir, `${requestId}.request.json`);
      await fs.writeFile(requestPath, JSON.stringify(analysisRequest, null, 2));

      logger.info('Analysis request created', {
        requestId,
        clientId,
        status: analysisRequest.status
      });

      return analysisRequest;
    } catch (error) {
      logger.error('Failed to create analysis request', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new AppError(
        ErrorCode.PROCESSING_ERROR,
        'Erreur lors de la création de la demande d\'analyse',
        500,
        { requestId }
      );
    }
  }

  /**
   * Generate upload response
   */
  public generateUploadResponse(
    requestId: string,
    estimatedProcessingTime: number = 30
  ): UploadResponse {
    return {
      requestId,
      status: ReceiptStatus.PENDING,
      estimatedProcessingTime,
      message: 'Image reçue et en cours de traitement'
    };
  }

  /**
   * Get file extension based on image format
   */
  private getFileExtension(format: string): string {
    const extensions: Record<string, string> = {
      'jpeg': 'jpg',
      'jpg': 'jpg',
      'png': 'png',
      'pdf': 'pdf'
    };
    
    return extensions[format.toLowerCase()] || 'jpg';
  }

  /**
   * Clean up old files from temporary storage
   */
  private async cleanupOldFiles(): Promise<void> {
    try {
      const files = await fs.readdir(UPLOAD_CONFIG.tempDir);
      const now = new Date();
      const maxAge = UPLOAD_CONFIG.maxRetentionHours * 60 * 60 * 1000;
      
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(UPLOAD_CONFIG.tempDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          const age = now.getTime() - stats.mtime.getTime();
          
          if (age > maxAge) {
            await fs.unlink(filePath);
            cleanedCount++;
            logger.debug('Cleaned up old file', { file, age: Math.round(age / 1000 / 60) });
          }
        } catch (error) {
          logger.warn('Failed to clean up file', {
            file,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleanup completed', {
          filesRemoved: cleanedCount,
          maxAgeHours: UPLOAD_CONFIG.maxRetentionHours
        });
      }
    } catch (error) {
      logger.error('Failed to run cleanup', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get analysis request by ID
   */
  public async getAnalysisRequest(requestId: string): Promise<ReceiptAnalysisRequest | null> {
    try {
      const requestPath = path.join(UPLOAD_CONFIG.tempDir, `${requestId}.request.json`);
      const data = await fs.readFile(requestPath, 'utf-8');
      return JSON.parse(data) as ReceiptAnalysisRequest;
    } catch (error) {
      logger.warn('Analysis request not found', { requestId });
      return null;
    }
  }

  /**
   * Update analysis request status
   */
  public async updateAnalysisRequestStatus(
    requestId: string,
    status: ReceiptStatus
  ): Promise<void> {
    try {
      const request = await this.getAnalysisRequest(requestId);
      if (!request) {
        throw new AppError(
          ErrorCode.INVALID_REQUEST,
          'Demande d\'analyse introuvable',
          404,
          { requestId }
        );
      }

      request.status = status;
      request.updatedAt = new Date();

      const requestPath = path.join(UPLOAD_CONFIG.tempDir, `${requestId}.request.json`);
      await fs.writeFile(requestPath, JSON.stringify(request, null, 2));

      logger.info('Analysis request status updated', { requestId, status });
    } catch (error) {
      logger.error('Failed to update analysis request status', {
        requestId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Validate uploaded file buffer
   */
  public validateFileBuffer(buffer: Buffer, maxSize: number): void {
    if (buffer.length === 0) {
      throw new AppError(
        ErrorCode.INVALID_FORMAT,
        'Fichier vide détecté',
        400
      );
    }

    if (buffer.length > maxSize) {
      throw new AppError(
        ErrorCode.FILE_TOO_LARGE,
        `Taille de fichier trop importante: ${(buffer.length / (1024 * 1024)).toFixed(2)}MB`,
        400,
        {
          receivedSize: buffer.length,
          maxSize,
          receivedSizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
          maxSizeMB: maxSize / (1024 * 1024)
        }
      );
    }
  }
}

// Export singleton instance
export const uploadService = UploadService.getInstance();