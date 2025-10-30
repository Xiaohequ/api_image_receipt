import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/config';
import { logger } from './utils/logger';

// Import middleware
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRateLimiter, initializeRateLimiter } from './middleware/simpleRateLimiter';
import { compressionMiddleware, compressionWithLogging } from './middleware/compression';
import { sanitizeInputs } from './middleware/validation';
import { securityHeaders } from './utils/security';

// Import routes
import routes from './routes';

// Import services
import { uploadService } from './services/uploadService';
import { workerService } from './services/workerService';
import { queueService } from './services/queueService';
import { databaseService } from './services/databaseService';
import { cacheService } from './services/cacheService';
import { openaiService } from './services/openaiService';

const app = express();

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// Additional security headers
app.use((req, res, next) => {
  const headers = securityHeaders.getHeaders();
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  next();
});

app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

// Compression middleware (before other middleware)
app.use(compressionMiddleware);
app.use(compressionWithLogging);

// Request logging middleware
app.use(requestLogger);

// Rate limiting middleware
app.use('/api', apiRateLimiter);

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  type: ['application/json', 'text/plain']
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Input sanitization middleware
app.use(sanitizeInputs);

// Routes
app.use('/', routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

const PORT = config.port || 3000;

// Initialize services
async function initializeServices() {
  logger.info('Initializing services...');
  
  const services = [
    { name: 'Database', init: () => databaseService.initialize() },
    { name: 'Cache', init: () => cacheService.initialize() },
    { name: 'Rate Limiter', init: () => initializeRateLimiter() },
    { name: 'Queue', init: () => queueService.initialize() },
    { name: 'Worker', init: () => workerService.initialize() },
    { name: 'OpenAI', init: () => openaiService.initialize() }
  ];

  let successCount = 0;
  
  for (const service of services) {
    try {
      await service.init();
      logger.info(`${service.name} service initialized successfully`);
      successCount++;
    } catch (error) {
      logger.warn(`Failed to initialize ${service.name} service (continuing without it)`, { error: error instanceof Error ? error.message : String(error) });
      
      // In development, continue without external services
      if (config.nodeEnv === 'production') {
        logger.error('Critical service failure in production', { service: service.name });
        process.exit(1);
      }
    }
  }
  
  logger.info(`Services initialization completed: ${successCount}/${services.length} services running`);
  
  if (successCount === 0 && config.nodeEnv === 'production') {
    logger.error('No services could be initialized in production');
    process.exit(1);
  }
}

const server = app.listen(PORT, async () => {
  logger.info(`🚀 Receipt Analyzer API started successfully`);
  logger.info(`📡 Server running on port ${PORT}`);
  logger.info(`🌍 Environment: ${config.nodeEnv}`);
  
  // Initialize services after server starts
  await initializeServices();
  
  logger.info(`📋 Available endpoints:`);
  logger.info(`   GET  /health - Health check`);
  logger.info(`   POST /api/v1/receipts/analyze - Analyze receipt`);
  logger.info(`   GET  /api/v1/receipts/:id/status - Check status`);
  logger.info(`   GET  /api/v1/receipts/:id/result - Get results`);
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);
  
  try {
    // Stop accepting new requests
    server.close(async () => {
      logger.info('HTTP server closed');
      
      // Shutdown services
      await workerService.shutdown();
      await queueService.close();
      await cacheService.close();
      await databaseService.disconnect();
      uploadService.stopCleanupTimer();
      
      logger.info('All services shut down successfully');
      process.exit(0);
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
    
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;