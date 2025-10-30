// OCR Service for Receipt Analysis
// This service handles text extraction from images using Tesseract.js and image preprocessing with Sharp

import { logger } from '../utils/logger';
import { ErrorCode } from '../types';
import { ProcessingError, ImageQualityError } from '../types/errors';
import { cacheService } from './cacheService';
import crypto from 'crypto';

// Declare modules to avoid TypeScript errors
declare const require: any;

// Type definitions for OCR service
export interface OCROptions {
  language?: string;
  psm?: number;
  oem?: number;
  preprocessImage?: boolean;
  enhanceContrast?: boolean;
  autoRotate?: boolean;
}

export interface OCRResult {
  text: string;
  confidence: number;
  detectedLanguage?: string;
  processingTime: number;
  preprocessed: boolean;
}

export interface ImagePreprocessingOptions {
  enhanceContrast?: boolean;
  autoRotate?: boolean;
  resize?: {
    width?: number;
    height?: number;
    fit?: string;
  };
  denoise?: boolean;
  sharpen?: boolean;
}

export class OCRService {
  private worker: any = null;
  private isInitialized = false;
  private readonly supportedLanguages = ['fra', 'eng', 'fra+eng'];
  private readonly minConfidenceThreshold = 30;
  private readonly minTextLength = 10;

  constructor() {
    // Initialize worker lazily to avoid import issues during testing
    this.initializeWorker().catch(error => {
      logger.error('Failed to initialize OCR worker during construction:', error);
    });
  }

  /**
   * Initialize Tesseract worker
   */
  private async initializeWorker(): Promise<void> {
    try {
      logger.info('Initializing OCR worker...');
      
      // Use require to avoid TypeScript module resolution issues
      const Tesseract = require('tesseract.js');
      this.worker = await Tesseract.createWorker();
      
      // Load French and English languages for better receipt recognition
      await this.worker.loadLanguage('fra+eng');
      await this.worker.initialize('fra+eng');
      
      // Configure OCR parameters for receipt processing
      await this.worker.setParameters({
        tessedit_pageseg_mode: 3, // PSM.AUTO - Automatic page segmentation
        tessedit_ocr_engine_mode: 1, // OEM.LSTM_ONLY - Use LSTM OCR engine
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ€$£¥.,:-/()[]{}@#%&*+=<>?!"\' ',
        preserve_interword_spaces: '1',
      });

      this.isInitialized = true;
      logger.info('OCR worker initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OCR worker:', error);
      throw new ProcessingError(
        'Failed to initialize OCR service',
        ErrorCode.SERVICE_UNAVAILABLE,
        { originalError: error }
      );
    }
  }

  /**
   * Preprocess image to improve OCR accuracy
   */
  private async preprocessImage(
    imageBuffer: any,
    options: ImagePreprocessingOptions = {}
  ): Promise<any> {
    try {
      logger.debug('Starting image preprocessing');
      
      // Use require to avoid TypeScript module resolution issues
      const sharp = require('sharp');
      let pipeline = sharp(imageBuffer);

      // Get image metadata
      const metadata = await pipeline.metadata();
      logger.debug('Image metadata:', {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        density: metadata.density
      });

      // Auto-rotate based on EXIF data
      if (options.autoRotate !== false) {
        pipeline = pipeline.rotate();
      }

      // Resize if image is too large (improves processing speed)
      if (options.resize || (metadata.width && metadata.width > 2000)) {
        const resizeOptions = options.resize || { width: 2000, fit: 'inside' };
        pipeline = pipeline.resize(resizeOptions.width, resizeOptions.height, {
          fit: resizeOptions.fit,
          withoutEnlargement: true
        });
      }

      // Convert to grayscale for better OCR
      pipeline = pipeline.grayscale();

      // Enhance contrast if requested
      if (options.enhanceContrast !== false) {
        pipeline = pipeline.normalize().linear(1.2, -(128 * 1.2) + 128);
      }

      // Apply sharpening filter
      if (options.sharpen !== false) {
        pipeline = pipeline.sharpen();
      }

      // Denoise if requested
      if (options.denoise) {
        pipeline = pipeline.median(3);
      }

      // Ensure minimum DPI for OCR
      pipeline = pipeline.png({ quality: 100 });

      const processedBuffer = await pipeline.toBuffer();
      logger.debug('Image preprocessing completed');
      
      return processedBuffer;
    } catch (error) {
      logger.error('Image preprocessing failed:', error);
      throw new ImageQualityError(
        'Failed to preprocess image',
        ErrorCode.POOR_IMAGE_QUALITY,
        { originalError: error }
      );
    }
  }

  /**
   * Detect language from text sample
   */
  private detectLanguage(text: string): string {
    const frenchWords = ['total', 'tva', 'sous-total', 'magasin', 'caisse', 'ticket', 'reçu', 'merci', 'carte', 'espèces'];
    const englishWords = ['total', 'tax', 'subtotal', 'store', 'cash', 'receipt', 'thank', 'card', 'change'];
    
    const lowerText = text.toLowerCase();
    const frenchCount = frenchWords.filter(word => lowerText.includes(word)).length;
    const englishCount = englishWords.filter(word => lowerText.includes(word)).length;
    
    if (frenchCount > englishCount) {
      return 'fra';
    } else if (englishCount > frenchCount) {
      return 'eng';
    }
    
    return 'fra+eng'; // Default to both languages
  }

  /**
   * Clean and normalize extracted text
   */
  private cleanExtractedText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove special characters that might be OCR artifacts
      .replace(/[^\w\s\d.,€$£¥:;()\-+=%@#&*\/\\]/g, '')
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove empty lines
      .split('\n')
      .filter(line => line.trim().length > 0)
      .join('\n')
      .trim();
  }

  /**
   * Validate OCR result quality
   */
  private validateOCRResult(text: string, confidence: number): void {
    if (confidence < this.minConfidenceThreshold) {
      throw new ImageQualityError(
        `OCR confidence too low: ${confidence}%`,
        ErrorCode.POOR_IMAGE_QUALITY,
        { confidence, threshold: this.minConfidenceThreshold }
      );
    }

    if (text.length < this.minTextLength) {
      throw new ImageQualityError(
        'Insufficient text detected in image',
        ErrorCode.NO_TEXT_DETECTED,
        { textLength: text.length, minLength: this.minTextLength }
      );
    }

    // Check if text contains mostly garbage characters
    const validCharRatio = (text.match(/[a-zA-Z0-9\s]/g) || []).length / text.length;
    if (validCharRatio < 0.5) {
      throw new ImageQualityError(
        'Text quality too poor for analysis',
        ErrorCode.POOR_IMAGE_QUALITY,
        { validCharRatio }
      );
    }
  }

  /**
   * Generate hash for image caching
   */
  private generateImageHash(imageBuffer: Buffer): string {
    const hash = crypto.createHash('sha256');
    hash.update(imageBuffer);
    return hash.digest('hex') as string;
  }

  /**
   * Extract text from image using OCR
   */
  async extractText(
    imageBuffer: any,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      if (!this.isInitialized || !this.worker) {
        await this.initializeWorker();
      }

      // Generate hash for caching
      const imageHash = this.generateImageHash(imageBuffer);
      
      // Check cache first
      const cachedResult = await cacheService.getCachedOCRResult(imageHash);
      if (cachedResult) {
        logger.info('OCR cache hit', { imageHash });
        return JSON.parse(cachedResult) as OCRResult;
      }

      logger.info('Starting OCR text extraction', { imageHash });

      // Preprocess image if requested
      let processedBuffer = imageBuffer;
      let preprocessed = false;

      if (options.preprocessImage !== false) {
        processedBuffer = await this.preprocessImage(imageBuffer, {
          enhanceContrast: options.enhanceContrast,
          autoRotate: options.autoRotate,
          denoise: true,
          sharpen: true
        });
        preprocessed = true;
      }

      // Configure OCR parameters if specified
      if (options.psm || options.oem) {
        await this.worker!.setParameters({
          tessedit_pageseg_mode: options.psm || 3, // PSM.AUTO
          tessedit_ocr_engine_mode: options.oem || 1, // OEM.LSTM_ONLY
        });
      }

      // Perform OCR
      const { data } = await this.worker!.recognize(processedBuffer);
      
      // Clean extracted text
      const cleanedText = this.cleanExtractedText(data.text);
      
      // Validate result quality
      this.validateOCRResult(cleanedText, data.confidence);

      // Detect language
      const detectedLanguage = this.detectLanguage(cleanedText);

      const processingTime = Date.now() - startTime;

      const result: OCRResult = {
        text: cleanedText,
        confidence: Math.round(data.confidence * 100) / 100,
        detectedLanguage,
        processingTime,
        preprocessed
      };

      // Cache the result for future use
      await cacheService.cacheOCRResult(imageHash, JSON.stringify(result), { ttl: 7200 });

      logger.info('OCR extraction completed', {
        confidence: data.confidence,
        textLength: cleanedText.length,
        processingTime,
        detectedLanguage,
        preprocessed,
        imageHash
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      if (error instanceof ImageQualityError) {
        logger.warn('OCR failed due to image quality:', error.message);
        throw error;
      }

      logger.error('OCR extraction failed:', error);
      throw new ProcessingError(
        'OCR text extraction failed',
        ErrorCode.PROCESSING_ERROR,
        { 
          originalError: error,
          processingTime
        }
      );
    }
  }

  /**
   * Extract text with automatic retry and different preprocessing options
   */
  async extractTextWithRetry(
    imageBuffer: any,
    maxRetries: number = 2
  ): Promise<OCRResult> {
    const preprocessingOptions = [
      { enhanceContrast: true, autoRotate: true },
      { enhanceContrast: false, autoRotate: true, denoise: true },
      { enhanceContrast: true, autoRotate: false, sharpen: true }
    ];

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const options: OCROptions = {
          preprocessImage: true,
          enhanceContrast: preprocessingOptions[attempt]?.enhanceContrast,
          autoRotate: preprocessingOptions[attempt]?.autoRotate
        };

        return await this.extractText(imageBuffer, options);
      } catch (error) {
        lastError = error as Error;
        logger.warn(`OCR attempt ${attempt + 1} failed:`, error);
        
        if (attempt === maxRetries) {
          break;
        }
      }
    }

    throw lastError || new ProcessingError(
      'All OCR attempts failed',
      ErrorCode.PROCESSING_ERROR
    );
  }

  /**
   * Check if OCR service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized || !this.worker) {
        return false;
      }

      // Create a simple test image with text
      const sharp = require('sharp');
      const testImage = await sharp({
        create: {
          width: 200,
          height: 100,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
      .png()
      .toBuffer();

      // Try to extract text (should return empty or minimal text)
      await this.worker.recognize(testImage);
      return true;
    } catch (error) {
      logger.error('OCR health check failed:', error);
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.worker) {
        await this.worker.terminate();
        this.worker = null;
        this.isInitialized = false;
        logger.info('OCR worker terminated');
      }
    } catch (error) {
      logger.error('Error during OCR cleanup:', error);
    }
  }
}

// Export singleton instance
export const ocrService = new OCRService();