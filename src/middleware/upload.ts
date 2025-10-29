import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { AppError } from '../types/errors';
import { ImageFormat, ImageMetadata, ErrorCode } from '../types';
import { VALIDATION_CONSTANTS } from '../types/validation';
import { logger } from '../utils/logger';

// Supported MIME types mapping
const SUPPORTED_MIME_TYPES = {
  'image/jpeg': ImageFormat.JPEG,
  'image/jpg': ImageFormat.JPG,
  'image/png': ImageFormat.PNG,
  'application/pdf': ImageFormat.PDF
} as const;

// File filter function for multer
const fileFilter = (req: Request, file: any, cb: multer.FileFilterCallback): void => {
  // Check if MIME type is supported
  if (!Object.keys(SUPPORTED_MIME_TYPES).includes(file.mimetype)) {
    const error = new AppError(
      ErrorCode.INVALID_FORMAT,
      `Format d'image non supporté: ${file.mimetype}. Formats acceptés: JPEG, PNG, PDF`,
      400,
      { 
        receivedMimeType: file.mimetype,
        supportedMimeTypes: Object.keys(SUPPORTED_MIME_TYPES)
      }
    );
    return cb(error);
  }

  // Check file extension matches MIME type
  const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
  const expectedFormats = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/jpg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'application/pdf': ['pdf']
  };

  const validExtensions = expectedFormats[file.mimetype as keyof typeof expectedFormats];
  if (!fileExtension || !validExtensions.includes(fileExtension)) {
    const error = new AppError(
      ErrorCode.INVALID_FORMAT,
      `Extension de fichier invalide: .${fileExtension}. Extensions acceptées pour ${file.mimetype}: ${validExtensions.join(', ')}`,
      400,
      {
        receivedExtension: fileExtension,
        expectedExtensions: validExtensions,
        mimeType: file.mimetype
      }
    );
    return cb(error);
  }

  cb(null, true);
};

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: VALIDATION_CONSTANTS.MAX_FILE_SIZE,
    files: 1 // Only allow one file per request
  },
  fileFilter
});

// Middleware to handle file upload and validation
export const uploadReceiptImage = upload.single('image');

// Middleware to process uploaded file and generate metadata
export const processUploadedFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      throw new AppError(
        ErrorCode.INVALID_REQUEST,
        'Aucune image fournie. Veuillez joindre un fichier image.',
        400,
        { field: 'image', constraint: 'required' }
      );
    }

    const file = req.file;

    // Validate file size
    if (file.size > VALIDATION_CONSTANTS.MAX_FILE_SIZE) {
      throw new AppError(
        ErrorCode.FILE_TOO_LARGE,
        `Taille de fichier trop importante: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Taille maximale autorisée: ${VALIDATION_CONSTANTS.MAX_FILE_SIZE / (1024 * 1024)}MB`,
        400,
        {
          receivedSize: file.size,
          maxSize: VALIDATION_CONSTANTS.MAX_FILE_SIZE,
          receivedSizeMB: (file.size / (1024 * 1024)).toFixed(2),
          maxSizeMB: VALIDATION_CONSTANTS.MAX_FILE_SIZE / (1024 * 1024)
        }
      );
    }

    // Generate unique request ID
    const requestId = uuidv4();

    // Get image dimensions for non-PDF files
    let dimensions = { width: 0, height: 0 };
    
    if (file.mimetype !== 'application/pdf') {
      try {
        const metadata = await sharp(file.buffer).metadata();
        dimensions = {
          width: metadata.width || 0,
          height: metadata.height || 0
        };
      } catch (error) {
        logger.warn('Failed to extract image dimensions', {
          requestId,
          filename: file.originalname,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // For corrupted images, throw an error
        throw new AppError(
          ErrorCode.POOR_IMAGE_QUALITY,
          'Image corrompue ou format invalide. Impossible d\'extraire les métadonnées.',
          422,
          {
            filename: file.originalname,
            mimeType: file.mimetype,
            size: file.size
          }
        );
      }
    } else {
      // For PDF files, we'll set default dimensions
      // In a real implementation, you might want to use a PDF library to get actual dimensions
      dimensions = { width: 595, height: 842 }; // A4 size in points
    }

    // Create image metadata
    const imageMetadata: ImageMetadata = {
      format: SUPPORTED_MIME_TYPES[file.mimetype as keyof typeof SUPPORTED_MIME_TYPES],
      size: file.size,
      dimensions,
      originalName: file.originalname,
      mimeType: file.mimetype
    };

    // Attach processed data to request object
    req.uploadData = {
      requestId,
      file,
      imageMetadata
    };

    logger.info('File upload processed successfully', {
      requestId,
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      dimensions
    });

    next();
  } catch (error) {
    // Handle multer errors
    if (error instanceof multer.MulterError) {
      let customError: AppError;
      
      switch (error.code) {
        case 'LIMIT_FILE_SIZE':
          customError = new AppError(
            ErrorCode.FILE_TOO_LARGE,
            `Taille de fichier trop importante. Taille maximale autorisée: ${VALIDATION_CONSTANTS.MAX_FILE_SIZE / (1024 * 1024)}MB`,
            400,
            {
              maxSize: VALIDATION_CONSTANTS.MAX_FILE_SIZE,
              maxSizeMB: VALIDATION_CONSTANTS.MAX_FILE_SIZE / (1024 * 1024)
            }
          );
          break;
        case 'LIMIT_FILE_COUNT':
          customError = new AppError(
            ErrorCode.INVALID_REQUEST,
            'Trop de fichiers. Veuillez ne soumettre qu\'une seule image à la fois.',
            400,
            { maxFiles: 1 }
          );
          break;
        case 'LIMIT_UNEXPECTED_FILE':
          customError = new AppError(
            ErrorCode.INVALID_REQUEST,
            'Champ de fichier inattendu. Utilisez le champ "image" pour l\'upload.',
            400,
            { expectedField: 'image' }
          );
          break;
        default:
          customError = new AppError(
            ErrorCode.INVALID_REQUEST,
            `Erreur d'upload: ${error.message}`,
            400,
            { multerError: error.code }
          );
      }
      
      return next(customError);
    }

    next(error);
  }
};

// Type augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      uploadData?: {
        requestId: string;
        file: any;
        imageMetadata: ImageMetadata;
      };
    }
  }
}

// Utility function to validate image quality (basic check)
export const validateImageQuality = async (buffer: any, mimeType: string): Promise<boolean> => {
  if (mimeType === 'application/pdf') {
    // For PDF files, we assume they're valid if they passed the initial checks
    return true;
  }

  try {
    const metadata = await sharp(buffer).metadata();
    
    // Basic quality checks
    const minWidth = 100;
    const minHeight = 100;
    const maxWidth = 10000;
    const maxHeight = 10000;

    if (!metadata.width || !metadata.height) {
      return false;
    }

    if (metadata.width < minWidth || metadata.height < minHeight) {
      return false;
    }

    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

// Export the configured upload middleware
export { upload };