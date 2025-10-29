import { ErrorCode, ApiError, ValidationError } from './index';

export { ErrorCode };

// Custom error classes
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly timestamp: Date;
  public readonly requestId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, any>,
    requestId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date();
    this.requestId = requestId;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, AppError);
    }
  }

  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId
    };
  }
}

export class ValidationAppError extends AppError {
  public readonly code: ErrorCode.INVALID_REQUEST = ErrorCode.INVALID_REQUEST;
  public readonly validationDetails: {
    field: string;
    value: any;
    constraint: string;
  }[];

  constructor(
    message: string,
    validationDetails: { field: string; value: any; constraint: string }[],
    requestId?: string
  ) {
    super(ErrorCode.INVALID_REQUEST, message, 400, { validationErrors: validationDetails }, requestId);
    this.name = 'ValidationAppError';
    this.validationDetails = validationDetails;
  }
}

// Error factory functions
export const createInvalidFormatError = (format: string, requestId?: string): AppError => {
  return new AppError(
    ErrorCode.INVALID_FORMAT,
    `Format d'image non supporté: ${format}. Formats acceptés: JPEG, PNG, PDF`,
    400,
    { receivedFormat: format, supportedFormats: ['JPEG', 'PNG', 'PDF'] },
    requestId
  );
};

export const createFileTooLargeError = (size: number, maxSize: number, requestId?: string): AppError => {
  return new AppError(
    ErrorCode.FILE_TOO_LARGE,
    `Taille de fichier trop importante: ${Math.round(size / 1024 / 1024)}MB. Taille maximale: ${Math.round(maxSize / 1024 / 1024)}MB`,
    400,
    { receivedSize: size, maxSize },
    requestId
  );
};

export const createPoorImageQualityError = (confidence: number, requestId?: string): AppError => {
  return new AppError(
    ErrorCode.POOR_IMAGE_QUALITY,
    `Qualité d'image insuffisante pour l'analyse. Confiance OCR: ${Math.round(confidence * 100)}%`,
    422,
    { ocrConfidence: confidence, minimumRequired: 0.3 },
    requestId
  );
};

export const createNoTextDetectedError = (requestId?: string): AppError => {
  return new AppError(
    ErrorCode.NO_TEXT_DETECTED,
    'Aucun texte détecté dans l\'image. Veuillez vérifier la qualité et l\'orientation de l\'image.',
    422,
    { suggestion: 'Assurez-vous que l\'image est nette, bien éclairée et correctement orientée' },
    requestId
  );
};

export const createRateLimitExceededError = (limit: number, resetTime: Date, requestId?: string): AppError => {
  return new AppError(
    ErrorCode.RATE_LIMIT_EXCEEDED,
    `Limite de requêtes dépassée. Maximum: ${limit} requêtes par heure`,
    429,
    { limit, resetTime, retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000) },
    requestId
  );
};

export const createProcessingError = (originalError: Error, requestId?: string): AppError => {
  return new AppError(
    ErrorCode.PROCESSING_ERROR,
    'Erreur interne lors du traitement de l\'image',
    500,
    { originalError: originalError.message, stack: originalError.stack },
    requestId
  );
};

export const createServiceUnavailableError = (service: string, requestId?: string): AppError => {
  return new AppError(
    ErrorCode.SERVICE_UNAVAILABLE,
    `Service temporairement indisponible: ${service}. Veuillez réessayer dans quelques minutes.`,
    503,
    { unavailableService: service, retryAfter: 300 },
    requestId
  );
};

export const createUnauthorizedError = (reason: string, requestId?: string): AppError => {
  return new AppError(
    ErrorCode.UNAUTHORIZED,
    `Accès non autorisé: ${reason}`,
    401,
    { reason },
    requestId
  );
};

// Specialized error classes for different error categories
export class ProcessingError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.PROCESSING_ERROR,
    details?: Record<string, any>,
    requestId?: string
  ) {
    super(code, message, getHttpStatusFromErrorCode(code), details, requestId);
    this.name = 'ProcessingError';
  }
}

export class ImageQualityError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.POOR_IMAGE_QUALITY,
    details?: Record<string, any>,
    requestId?: string
  ) {
    super(code, message, getHttpStatusFromErrorCode(code), details, requestId);
    this.name = 'ImageQualityError';
  }
}

export class FileValidationError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INVALID_FORMAT,
    details?: Record<string, any>,
    requestId?: string
  ) {
    super(code, message, getHttpStatusFromErrorCode(code), details, requestId);
    this.name = 'FileValidationError';
  }
}

export class RateLimitError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.RATE_LIMIT_EXCEEDED,
    details?: Record<string, any>,
    requestId?: string
  ) {
    super(code, message, getHttpStatusFromErrorCode(code), details, requestId);
    this.name = 'RateLimitError';
  }
}

export class ServiceError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.SERVICE_UNAVAILABLE,
    details?: Record<string, any>,
    requestId?: string
  ) {
    super(code, message, getHttpStatusFromErrorCode(code), details, requestId);
    this.name = 'ServiceError';
  }
}

export class AuthenticationError extends AppError {
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNAUTHORIZED,
    details?: Record<string, any>,
    requestId?: string
  ) {
    super(code, message, getHttpStatusFromErrorCode(code), details, requestId);
    this.name = 'AuthenticationError';
  }
}

// Error type guards
export const isAppError = (error: any): error is AppError => {
  return error instanceof AppError;
};

export const isValidationError = (error: any): error is ValidationAppError => {
  return error instanceof ValidationAppError;
};

// HTTP status code mapping
export const getHttpStatusFromErrorCode = (code: ErrorCode): number => {
  const statusMap: Record<ErrorCode, number> = {
    [ErrorCode.INVALID_FORMAT]: 400,
    [ErrorCode.FILE_TOO_LARGE]: 400,
    [ErrorCode.INVALID_REQUEST]: 400,
    [ErrorCode.UNAUTHORIZED]: 401,
    [ErrorCode.POOR_IMAGE_QUALITY]: 422,
    [ErrorCode.NO_TEXT_DETECTED]: 422,
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
    [ErrorCode.PROCESSING_ERROR]: 500,
    [ErrorCode.SERVICE_UNAVAILABLE]: 503
  };

  return statusMap[code] || 500;
};

// Error message localization (French)
export const getLocalizedErrorMessage = (code: ErrorCode, details?: Record<string, any>): string => {
  const messages: Record<ErrorCode, string> = {
    [ErrorCode.INVALID_FORMAT]: 'Format de fichier non supporté',
    [ErrorCode.FILE_TOO_LARGE]: 'Fichier trop volumineux',
    [ErrorCode.POOR_IMAGE_QUALITY]: 'Qualité d\'image insuffisante',
    [ErrorCode.NO_TEXT_DETECTED]: 'Aucun texte détecté',
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Limite de requêtes dépassée',
    [ErrorCode.PROCESSING_ERROR]: 'Erreur de traitement',
    [ErrorCode.SERVICE_UNAVAILABLE]: 'Service indisponible',
    [ErrorCode.INVALID_REQUEST]: 'Requête invalide',
    [ErrorCode.UNAUTHORIZED]: 'Accès non autorisé'
  };

  return messages[code] || 'Erreur inconnue';
};

// Detailed French error messages with context
export const getDetailedErrorMessage = (code: ErrorCode, details?: Record<string, any>): string => {
  switch (code) {
    case ErrorCode.INVALID_FORMAT:
      const format = details?.receivedFormat || 'inconnu';
      const supported = details?.supportedFormats?.join(', ') || 'JPEG, PNG, PDF';
      return `Format d'image "${format}" non supporté. Formats acceptés: ${supported}`;
      
    case ErrorCode.FILE_TOO_LARGE:
      const sizeMB = details?.receivedSize ? Math.round(details.receivedSize / 1024 / 1024) : 'inconnue';
      const maxMB = details?.maxSize ? Math.round(details.maxSize / 1024 / 1024) : '10';
      return `Taille de fichier trop importante: ${sizeMB}MB. Taille maximale autorisée: ${maxMB}MB`;
      
    case ErrorCode.POOR_IMAGE_QUALITY:
      const confidence = details?.ocrConfidence ? Math.round(details.ocrConfidence * 100) : 'faible';
      return `Qualité d'image insuffisante pour l'analyse OCR (confiance: ${confidence}%). Veuillez utiliser une image plus nette et mieux éclairée`;
      
    case ErrorCode.NO_TEXT_DETECTED:
      return 'Aucun texte détecté dans l\'image. Vérifiez que l\'image contient un reçu lisible et qu\'elle est correctement orientée';
      
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      const limit = details?.limit || '100';
      const resetTime = details?.resetTime ? new Date(details.resetTime).toLocaleTimeString('fr-FR') : 'dans 1 heure';
      return `Limite de ${limit} requêtes par heure dépassée. Réessayez après ${resetTime}`;
      
    case ErrorCode.PROCESSING_ERROR:
      const service = details?.service || 'traitement';
      return `Erreur lors du ${service}. Notre équipe technique a été notifiée`;
      
    case ErrorCode.SERVICE_UNAVAILABLE:
      const unavailableService = details?.unavailableService || 'le service';
      const retryAfter = details?.retryAfter ? `${details.retryAfter} secondes` : 'quelques minutes';
      return `${unavailableService} est temporairement indisponible. Veuillez réessayer dans ${retryAfter}`;
      
    case ErrorCode.UNAUTHORIZED:
      const reason = details?.reason || 'clé API invalide';
      return `Accès non autorisé: ${reason}. Vérifiez vos identifiants d'authentification`;
      
    case ErrorCode.INVALID_REQUEST:
      const field = details?.field || 'données';
      return `Requête invalide: ${field} manquant ou incorrect`;
      
    default:
      return 'Une erreur inattendue s\'est produite. Veuillez réessayer ou contacter le support technique';
  }
};

// Error suggestions for users
export const getErrorSuggestion = (code: ErrorCode): string => {
  const suggestions: Record<ErrorCode, string> = {
    [ErrorCode.INVALID_FORMAT]: 'Convertissez votre image en JPEG, PNG ou PDF',
    [ErrorCode.FILE_TOO_LARGE]: 'Réduisez la taille de votre image ou compressez-la',
    [ErrorCode.POOR_IMAGE_QUALITY]: 'Prenez une nouvelle photo avec un meilleur éclairage et sans flou',
    [ErrorCode.NO_TEXT_DETECTED]: 'Vérifiez que le reçu est entièrement visible et correctement orienté',
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Attendez avant de faire une nouvelle requête ou contactez-nous pour augmenter votre limite',
    [ErrorCode.PROCESSING_ERROR]: 'Réessayez dans quelques minutes ou contactez le support technique',
    [ErrorCode.SERVICE_UNAVAILABLE]: 'Réessayez dans quelques minutes, nos services sont temporairement indisponibles',
    [ErrorCode.UNAUTHORIZED]: 'Vérifiez votre clé API ou contactez-nous pour obtenir l\'accès',
    [ErrorCode.INVALID_REQUEST]: 'Vérifiez les paramètres de votre requête selon la documentation API'
  };

  return suggestions[code] || 'Consultez la documentation ou contactez le support technique';
};