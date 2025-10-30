import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

interface Config {
  // Server
  nodeEnv: string;
  port: number;
  
  // Database
  mongodbUri: string;
  dbName: string;
  
  // Redis
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  
  // OCR
  ocr: {
    language: string;
    confidenceThreshold: number;
  };
  
  // OpenAI
  openai: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  
  // File Upload
  upload: {
    maxFileSize: number;
    allowedFormats: string[];
    uploadDir: string;
  };
  
  // Rate Limiting
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    whitelist: string[];
  };
  
  // Security
  security: {
    apiKeyHeader: string;
    jwtSecret: string;
  };
  
  // CORS
  cors: {
    origin: string | string[] | boolean;
    credentials: boolean;
  };
  
  // Logging
  logging: {
    level: string;
    file: string;
  };
  
  // Processing
  processing: {
    timeoutMs: number;
    queueConcurrency: number;
  };
  
  // Cache
  cache: {
    defaultTTL: number;
    statusTTL: number;
    resultTTL: number;
    ocrTTL: number;
  };
}

export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/receipt-analyzer',
  dbName: process.env.DB_NAME || 'receipt_analyzer',
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  
  ocr: {
    language: process.env.TESSERACT_LANG || 'fra+eng',
    confidenceThreshold: parseInt(process.env.OCR_CONFIDENCE_THRESHOLD || '60', 10),
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1000', 10),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.1'),
  },
  
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
    allowedFormats: (process.env.ALLOWED_FORMATS || 'jpeg,jpg,png,pdf').split(','),
    uploadDir: process.env.UPLOAD_DIR || './uploads',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hour
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    whitelist: (process.env.RATE_LIMIT_WHITELIST || '127.0.0.1,::1').split(',').map(ip => ip.trim()),
  },
  
  security: {
    apiKeyHeader: process.env.API_KEY_HEADER || 'x-api-key',
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN ? 
      (process.env.CORS_ORIGIN.includes(',') ? 
        process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : 
        process.env.CORS_ORIGIN) : 
      (process.env.NODE_ENV === 'production' ? false : true),
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
  },
  
  processing: {
    timeoutMs: parseInt(process.env.PROCESSING_TIMEOUT_MS || '30000', 10),
    queueConcurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5', 10),
  },
  
  cache: {
    defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '3600', 10), // 1 hour
    statusTTL: parseInt(process.env.CACHE_STATUS_TTL || '30', 10), // 30 seconds
    resultTTL: parseInt(process.env.CACHE_RESULT_TTL || '3600', 10), // 1 hour
    ocrTTL: parseInt(process.env.CACHE_OCR_TTL || '7200', 10), // 2 hours
  },
};

// Validate required environment variables in production
if (config.nodeEnv === 'production') {
  const requiredEnvVars = [
    'MONGODB_URI',
    'REDIS_HOST',
    'JWT_SECRET'
  ];
  
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }
}