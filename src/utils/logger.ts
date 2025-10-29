import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config/config';

// Create logs directory if it doesn't exist
const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for error logging
const errorFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }: any) => {
    const logObject: any = {
      timestamp,
      level,
      message,
      service: 'receipt-analyzer-api',
      ...meta
    };
    
    if (stack) {
      logObject.stack = stack;
    }
    
    return JSON.stringify(logObject, null, 2);
  })
);

// Custom format for console logging in development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, requestId, errorCode, ...meta }: any) => {
    let logMessage = `${timestamp} [${level}]`;
    
    if (requestId) {
      logMessage += ` [${requestId}]`;
    }
    
    if (errorCode) {
      logMessage += ` [${errorCode}]`;
    }
    
    logMessage += `: ${message}`;
    
    // Add metadata if present
    const metaKeys = Object.keys(meta);
    if (metaKeys.length > 0) {
      const relevantMeta = metaKeys
        .filter(key => !['timestamp', 'level', 'message', 'service'].includes(key))
        .reduce((obj, key) => {
          obj[key] = meta[key];
          return obj;
        }, {} as any);
      
      if (Object.keys(relevantMeta).length > 0) {
        logMessage += ` ${JSON.stringify(relevantMeta)}`;
      }
    }
    
    return logMessage;
  })
);

const logger = winston.createLogger({
  level: config.logging.level,
  format: errorFormat,
  defaultMeta: { 
    service: 'receipt-analyzer-api',
    environment: config.nodeEnv,
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // Separate error log file
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: errorFormat
    }),
    // Combined log file
    new winston.transports.File({ 
      filename: config.logging.file,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: errorFormat
    }),
    // Separate debug log for development
    ...(config.nodeEnv === 'development' ? [
      new winston.transports.File({
        filename: path.join(logDir, 'debug.log'),
        level: 'debug',
        maxsize: 5242880, // 5MB
        maxFiles: 3
      })
    ] : [])
  ],
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 5242880,
      maxFiles: 3
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(logDir, 'rejections.log'),
      maxsize: 5242880,
      maxFiles: 3
    })
  ]
});

// Add console transport for non-production environments
if (config.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Enhanced logging methods for error handling
export const logError = (message: string, error: Error, context?: Record<string, any>) => {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    ...context
  });
};

export const logValidationError = (message: string, validationErrors: any[], context?: Record<string, any>) => {
  logger.warn(message, {
    validationErrors,
    errorCount: validationErrors.length,
    ...context
  });
};

export const logSecurityEvent = (event: string, context?: Record<string, any>) => {
  logger.warn(`Security Event: ${event}`, {
    securityEvent: true,
    event,
    ...context
  });
};

export const logPerformanceIssue = (operation: string, duration: number, threshold: number, context?: Record<string, any>) => {
  logger.warn(`Performance Issue: ${operation}`, {
    performanceIssue: true,
    operation,
    duration,
    threshold,
    ...context
  });
};

export { logger };