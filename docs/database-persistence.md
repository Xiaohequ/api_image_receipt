# Database Persistence Layer

This document describes the database persistence layer implementation for the Receipt Analyzer API.

## Overview

The persistence layer uses MongoDB with Mongoose ODM to store and manage receipt analysis requests and extracted data. It provides a robust, scalable solution with proper indexing for performance and comprehensive CRUD operations.

## Architecture

### Components

1. **Database Connection** (`src/config/database.ts`)
   - Singleton connection manager
   - Health monitoring
   - Graceful connection handling

2. **Models** (`src/models/`)
   - Mongoose schemas with validation
   - Proper indexing for performance
   - Type-safe document interfaces

3. **Repositories** (`src/repositories/`)
   - Data access layer with CRUD operations
   - Business logic for queries
   - Pagination and search capabilities

4. **Database Service** (`src/services/databaseService.ts`)
   - High-level database operations
   - Health checks and statistics
   - Cleanup and maintenance

## Models

### ReceiptAnalysisRequest

Stores information about receipt analysis requests.

**Schema:**
```typescript
{
  id: string;              // Unique request identifier
  clientId: string;        // Client making the request
  imageUrl: string;        // Path to uploaded image
  imageMetadata: {         // Image information
    format: ImageFormat;
    size: number;
    dimensions: { width: number; height: number };
    originalName?: string;
    mimeType: string;
  };
  status: ReceiptStatus;   // Processing status
  metadata?: {             // Optional metadata
    source?: string;
    expectedType?: ReceiptType;
    priority?: 'low' | 'normal' | 'high';
  };
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes:**
- `id` (unique)
- `clientId`
- `status`
- `{ clientId: 1, createdAt: -1 }`
- `{ status: 1, createdAt: 1 }`
- `{ 'metadata.priority': 1, createdAt: 1 }`

### ExtractedReceiptData

Stores the results of receipt analysis.

**Schema:**
```typescript
{
  requestId: string;       // Reference to analysis request
  receiptType: ReceiptType;
  extractedFields: {
    totalAmount: {
      value: number;
      currency: string;
      confidence: number;
      rawText?: string;
      boundingBox?: BoundingBox;
    };
    date: ExtractedField<string>;
    merchantName: ExtractedField<string>;
    items: ReceiptItem[];
    summary: string;
    // Optional fields
    taxAmount?: ExtractedField<number>;
    subtotal?: ExtractedField<number>;
    paymentMethod?: ExtractedField<string>;
    receiptNumber?: ExtractedField<string>;
  };
  processingMetadata: {
    processingTime: number;
    ocrConfidence: number;
    aiConfidence: number;
    imagePreprocessed: boolean;
    detectedLanguage?: string;
  };
  extractedAt: Date;
}
```

**Indexes:**
- `requestId` (unique)
- `receiptType`
- `extractedAt`
- `{ receiptType: 1, extractedAt: -1 }`
- `{ 'extractedFields.merchantName.value': 'text' }`
- `{ 'extractedFields.totalAmount.value': 1 }`
- `{ 'extractedFields.date.value': 1 }`

## Repository Operations

### ReceiptAnalysisRequestRepository

**Core Operations:**
- `create(data)` - Create new request
- `findByRequestId(id)` - Find by unique ID
- `findByClientId(clientId, pagination)` - Find client's requests
- `findByStatus(status, pagination?)` - Find by processing status
- `updateStatus(id, status)` - Update request status

**Advanced Operations:**
- `findPendingRequests(limit)` - Get requests for processing
- `findByDateRange(start, end, pagination?)` - Date range queries
- `getProcessingStats()` - Processing statistics
- `cleanupOldRequests(days)` - Remove old completed requests
- `findFailedRequestsForRetry(maxAttempts)` - Find failed requests

### ExtractedReceiptDataRepository

**Core Operations:**
- `create(data)` - Store extracted data
- `findByRequestId(id)` - Find by request ID
- `findByReceiptType(type, pagination?)` - Find by receipt type

**Search Operations:**
- `searchByMerchant(name, pagination?)` - Search by merchant name
- `findByAmountRange(min, max, pagination?)` - Amount range queries
- `findByDateRange(start, end, pagination?)` - Date range queries

**Analytics Operations:**
- `getAnalytics()` - Comprehensive analytics
- `findLowConfidenceReceipts(threshold, pagination?)` - Quality control
- `getTopMerchants(limit)` - Popular merchants
- `cleanupOldData(days)` - Data retention management

## Usage Examples

### Basic CRUD Operations

```typescript
import { receiptAnalysisRequestRepository } from '../repositories';
import { ReceiptStatus, ImageFormat } from '../types';

// Create a new request
const request = await receiptAnalysisRequestRepository.create({
  id: 'req-123',
  clientId: 'client-456',
  imageUrl: '/uploads/receipt.jpg',
  imageMetadata: {
    format: ImageFormat.JPEG,
    size: 1024000,
    dimensions: { width: 800, height: 600 },
    mimeType: 'image/jpeg',
  },
  status: ReceiptStatus.PENDING,
});

// Update status
await receiptAnalysisRequestRepository.updateStatus('req-123', ReceiptStatus.PROCESSING);

// Find by ID
const foundRequest = await receiptAnalysisRequestRepository.findByRequestId('req-123');
```

### Search and Analytics

```typescript
import { extractedReceiptDataRepository } from '../repositories';

// Search by merchant
const results = await extractedReceiptDataRepository.searchByMerchant('Carrefour');

// Find by amount range
const expensiveReceipts = await extractedReceiptDataRepository.findByAmountRange(100, 1000);

// Get analytics
const analytics = await extractedReceiptDataRepository.getAnalytics();
console.log(`Total receipts: ${analytics.totalReceipts}`);
console.log(`Average amount: €${analytics.averageAmount.toFixed(2)}`);
```

### Pagination

```typescript
const pagination = {
  page: 1,
  limit: 20,
  sortBy: 'createdAt' as const,
  sortOrder: 'desc' as const,
};

const paginatedResults = await receiptAnalysisRequestRepository.findByClientId(
  'client-456',
  pagination
);

console.log(`Page ${paginatedResults.pagination.page} of ${paginatedResults.pagination.totalPages}`);
console.log(`${paginatedResults.data.length} results`);
```

## Database Service

### Initialization

```typescript
import { databaseService } from '../services/databaseService';

// Initialize database connection
await databaseService.initialize();
```

### Health Monitoring

```typescript
// Check database health
const health = await databaseService.healthCheck();
console.log(`Database status: ${health.status}`);
console.log(`Response time: ${health.responseTime}ms`);
```

### Statistics and Maintenance

```typescript
// Get database statistics
const stats = await databaseService.getStats();

// Cleanup old data
const cleaned = await databaseService.cleanup({
  requestsOlderThanDays: 30,
  dataOlderThanDays: 90,
});
```

## Configuration

### Environment Variables

```bash
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/receipt-analyzer
DB_NAME=receipt_analyzer

# Connection Options (optional)
DB_MAX_POOL_SIZE=10
DB_SERVER_SELECTION_TIMEOUT=5000
DB_SOCKET_TIMEOUT=45000
```

### Connection Options

The database connection uses the following default options:
- `maxPoolSize: 10` - Maximum connection pool size
- `serverSelectionTimeoutMS: 5000` - Server selection timeout
- `socketTimeoutMS: 45000` - Socket timeout
- `bufferCommands: false` - Disable command buffering
- `bufferMaxEntries: 0` - No buffer entries

## Performance Considerations

### Indexing Strategy

1. **Primary Indexes**: Unique identifiers (`id`, `requestId`)
2. **Query Indexes**: Frequently queried fields (`clientId`, `status`, `receiptType`)
3. **Compound Indexes**: Multi-field queries (`clientId + createdAt`)
4. **Text Indexes**: Search functionality (`merchantName`)
5. **Range Indexes**: Numeric and date ranges (`totalAmount`, `extractedAt`)

### Query Optimization

1. **Use Pagination**: Always paginate large result sets
2. **Limit Fields**: Project only needed fields
3. **Index Coverage**: Ensure queries use appropriate indexes
4. **Aggregation**: Use MongoDB aggregation for complex analytics

### Data Retention

- **Requests**: Automatically clean up completed/failed requests after 30 days
- **Extracted Data**: Retain for 90 days for analytics and audit purposes
- **Configurable**: Cleanup periods can be adjusted via service methods

## Error Handling

The persistence layer includes comprehensive error handling:

1. **Connection Errors**: Automatic reconnection with exponential backoff
2. **Validation Errors**: Mongoose schema validation with descriptive messages
3. **Duplicate Key Errors**: Proper handling of unique constraint violations
4. **Query Errors**: Logging and graceful error propagation
5. **Timeout Errors**: Configurable timeouts with fallback behavior

## Testing

Run the database tests:

```bash
npm test -- --testPathPattern=database.test.ts
```

The test suite covers:
- Database connection and health checks
- CRUD operations for both models
- Repository-specific methods
- Error handling scenarios
- Performance and indexing validation

## Monitoring and Maintenance

### Health Checks

The database service provides health check endpoints that monitor:
- Connection status
- Response time
- Query performance
- Error rates

### Maintenance Tasks

Regular maintenance includes:
- Index optimization
- Data cleanup
- Performance monitoring
- Backup verification

### Logging

All database operations are logged with appropriate levels:
- `INFO`: Successful operations and statistics
- `WARN`: Performance issues and retries
- `ERROR`: Connection failures and query errors
- `DEBUG`: Detailed query information (development only)