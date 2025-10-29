/**
 * Example usage of the database persistence layer
 * This demonstrates how to use the repositories and database service
 */

import { databaseService } from '../services/databaseService';
import { receiptAnalysisRequestRepository, extractedReceiptDataRepository } from '../repositories';
import { ReceiptStatus, ReceiptType, ImageFormat } from '../types';
import { logger } from '../utils/logger';

export async function databaseExample() {
  try {
    // Initialize database connection
    await databaseService.initialize();
    logger.info('Database initialized for example');

    // Example 1: Create a new receipt analysis request
    const requestData = {
      id: `example-${Date.now()}`,
      clientId: 'example-client',
      imageUrl: '/uploads/example-receipt.jpg',
      imageMetadata: {
        format: ImageFormat.JPEG,
        size: 2048000,
        dimensions: { width: 1200, height: 800 },
        originalName: 'receipt.jpg',
        mimeType: 'image/jpeg',
      },
      status: ReceiptStatus.PENDING,
      metadata: {
        source: 'mobile-app',
        expectedType: ReceiptType.RETAIL,
        priority: 'normal' as const,
      },
    };

    const createdRequest = await receiptAnalysisRequestRepository.create(requestData);
    logger.info('Created receipt analysis request:', { id: createdRequest.id });

    // Example 2: Update request status to processing
    await receiptAnalysisRequestRepository.updateStatus(createdRequest.id, ReceiptStatus.PROCESSING);
    logger.info('Updated request status to processing');

    // Example 3: Create extracted receipt data
    const extractedData = {
      requestId: createdRequest.id,
      receiptType: ReceiptType.RETAIL,
      extractedFields: {
        totalAmount: {
          value: 45.67,
          currency: 'EUR',
          confidence: 92,
          rawText: '45,67 €',
        },
        date: {
          value: '2024-01-15T14:30:00Z',
          confidence: 88,
          rawText: '15/01/2024 14:30',
        },
        merchantName: {
          value: 'Supermarché Example',
          confidence: 95,
          rawText: 'SUPERMARCHE EXAMPLE',
        },
        items: [
          {
            name: 'Pain de mie',
            quantity: 1,
            unitPrice: 2.50,
            totalPrice: 2.50,
            category: 'Boulangerie',
          },
          {
            name: 'Lait 1L',
            quantity: 2,
            unitPrice: 1.20,
            totalPrice: 2.40,
            category: 'Produits laitiers',
          },
          {
            name: 'Pommes 1kg',
            quantity: 1,
            unitPrice: 3.20,
            totalPrice: 3.20,
            category: 'Fruits et légumes',
          },
        ],
        summary: 'Achat au Supermarché Example pour un montant de 45,67 € incluant des produits alimentaires de base.',
        taxAmount: {
          value: 4.15,
          confidence: 85,
          rawText: 'TVA: 4,15 €',
        },
        subtotal: {
          value: 41.52,
          confidence: 90,
          rawText: 'Sous-total: 41,52 €',
        },
        paymentMethod: {
          value: 'Carte bancaire',
          confidence: 80,
          rawText: 'CB ****1234',
        },
      },
      processingMetadata: {
        processingTime: 3200,
        ocrConfidence: 87,
        aiConfidence: 91,
        imagePreprocessed: true,
        detectedLanguage: 'fr',
      },
    };

    const createdExtractedData = await extractedReceiptDataRepository.create(extractedData);
    logger.info('Created extracted receipt data:', { requestId: createdExtractedData.requestId });

    // Example 4: Update request status to completed
    await receiptAnalysisRequestRepository.updateStatus(createdRequest.id, ReceiptStatus.COMPLETED);
    logger.info('Updated request status to completed');

    // Example 5: Query examples
    
    // Find request by ID
    const foundRequest = await receiptAnalysisRequestRepository.findByRequestId(createdRequest.id);
    logger.info('Found request by ID:', { found: !!foundRequest });

    // Find extracted data by request ID
    const foundExtractedData = await extractedReceiptDataRepository.findByRequestId(createdRequest.id);
    logger.info('Found extracted data by request ID:', { found: !!foundExtractedData });

    // Search by merchant name
    const merchantResults = await extractedReceiptDataRepository.searchByMerchant('Supermarché');
    logger.info('Search by merchant results:', { count: Array.isArray(merchantResults) ? merchantResults.length : 0 });

    // Find by amount range
    const amountResults = await extractedReceiptDataRepository.findByAmountRange(40, 50);
    logger.info('Find by amount range results:', { count: Array.isArray(amountResults) ? amountResults.length : 0 });

    // Get processing statistics
    const processingStats = await receiptAnalysisRequestRepository.getProcessingStats();
    logger.info('Processing statistics:', processingStats);

    // Get analytics
    const analytics = await extractedReceiptDataRepository.getAnalytics();
    logger.info('Analytics:', analytics);

    // Example 6: Pagination
    const paginationParams = {
      page: 1,
      limit: 10,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    };

    const paginatedRequests = await receiptAnalysisRequestRepository.findByClientId(
      'example-client',
      paginationParams
    );
    logger.info('Paginated requests:', {
      total: paginatedRequests.pagination.total,
      page: paginatedRequests.pagination.page,
      hasNext: paginatedRequests.pagination.hasNext,
    });

    // Example 7: Database health check
    const healthCheck = await databaseService.healthCheck();
    logger.info('Database health check:', healthCheck);

    // Example 8: Database statistics
    const dbStats = await databaseService.getStats();
    logger.info('Database statistics:', dbStats);

    logger.info('Database example completed successfully');

  } catch (error) {
    logger.error('Database example failed:', error);
    throw error;
  }
}

// Export for use in other parts of the application
export default databaseExample;