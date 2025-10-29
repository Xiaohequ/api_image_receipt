import { ocrService, OCRResult } from './ocrService';
import { dataExtractionService, ExtractionResult } from './dataExtractionService';
import { uploadService } from './uploadService';
import { logger } from '../utils/logger';
import { ReceiptStatus, ExtractedReceiptData, ReceiptType } from '../types';
import { ProcessingError, ErrorCode } from '../types/errors';
// Declare require to avoid TypeScript issues
declare const require: any;

export interface ProcessingRequest {
  requestId: string;
  imagePath: string;
  clientId?: string;
}

export interface ProcessingResult {
  requestId: string;
  success: boolean;
  extractedData?: ExtractedReceiptData;
  error?: string;
  processingTime: number;
}

export class ImageProcessingService {
  private static instance: ImageProcessingService;

  private constructor() {}

  public static getInstance(): ImageProcessingService {
    if (!ImageProcessingService.instance) {
      ImageProcessingService.instance = new ImageProcessingService();
    }
    return ImageProcessingService.instance;
  }

  /**
   * Process receipt image and extract data
   */
  async processReceiptImage(request: ProcessingRequest): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting receipt image processing', { requestId: request.requestId });

      // Update status to processing
      await uploadService.updateAnalysisRequestStatus(request.requestId, ReceiptStatus.PROCESSING);

      // Read image file
      const fs = require('fs').promises;
      const imageBuffer = await fs.readFile(request.imagePath);
      
      // Extract text using OCR
      const ocrResult = await ocrService.extractTextWithRetry(imageBuffer);
      
      // Extract structured data using intelligent extraction service
      const extractionResult = await dataExtractionService.extractData(ocrResult.text, {
        language: 'auto',
        strictValidation: false
      });
      
      // Create extracted data structure
      const extractedData = this.createExtractedData(request.requestId, ocrResult, extractionResult);
      
      // Update status to completed
      await uploadService.updateAnalysisRequestStatus(request.requestId, ReceiptStatus.COMPLETED);

      const processingTime = Date.now() - startTime;

      logger.info('Receipt processing completed successfully', {
        requestId: request.requestId,
        processingTime,
        ocrConfidence: ocrResult.confidence,
        textLength: ocrResult.text.length
      });

      return {
        requestId: request.requestId,
        success: true,
        extractedData,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Receipt processing failed', {
        requestId: request.requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });

      // Update status to failed
      try {
        await uploadService.updateAnalysisRequestStatus(request.requestId, ReceiptStatus.FAILED);
      } catch (statusError) {
        logger.error('Failed to update status to failed', { requestId: request.requestId, statusError });
      }

      return {
        requestId: request.requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown processing error',
        processingTime
      };
    }
  }

  /**
   * Create extracted data structure from OCR result and extraction result
   */
  private createExtractedData(requestId: string, ocrResult: OCRResult, extractionResult: ExtractionResult): ExtractedReceiptData {
    // Calculate AI confidence based on individual field confidences
    const fieldConfidences = [
      extractionResult.totalAmount.confidence,
      extractionResult.date.confidence,
      extractionResult.merchantName.confidence
    ];
    const aiConfidence = fieldConfidences.reduce((sum, conf) => sum + conf, 0) / fieldConfidences.length;

    // Detect receipt type from extraction result or fallback to text analysis
    const receiptType = this.detectReceiptType(ocrResult.text);

    return {
      requestId,
      receiptType,
      extractedFields: {
        totalAmount: extractionResult.totalAmount,
        date: extractionResult.date,
        merchantName: extractionResult.merchantName,
        items: extractionResult.items,
        summary: extractionResult.summary,
        taxAmount: extractionResult.taxAmount,
        subtotal: extractionResult.subtotal,
        paymentMethod: extractionResult.paymentMethod,
        receiptNumber: extractionResult.receiptNumber
      },
      processingMetadata: {
        processingTime: ocrResult.processingTime,
        ocrConfidence: ocrResult.confidence,
        aiConfidence: Math.round(aiConfidence * 100) / 100,
        imagePreprocessed: ocrResult.preprocessed,
        detectedLanguage: ocrResult.detectedLanguage
      },
      extractedAt: new Date()
    };
  }



  /**
   * Detect receipt type from text content
   */
  private detectReceiptType(text: string): ReceiptType {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('carte') || lowerText.includes('card') || lowerText.includes('cb')) {
      return ReceiptType.CARD_PAYMENT;
    }
    
    if (lowerText.includes('caisse') || lowerText.includes('ticket')) {
      return ReceiptType.CASH_REGISTER;
    }
    
    if (lowerText.includes('magasin') || lowerText.includes('store') || lowerText.includes('supermarché')) {
      return ReceiptType.RETAIL;
    }
    
    return ReceiptType.UNKNOWN;
  }



  /**
   * Health check for the processing service
   */
  async healthCheck(): Promise<boolean> {
    try {
      return await ocrService.healthCheck();
    } catch (error) {
      logger.error('Image processing service health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const imageProcessingService = ImageProcessingService.getInstance();