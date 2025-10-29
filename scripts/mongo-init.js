// MongoDB initialization script for Receipt Analyzer API
// This script creates the database, collections, and indexes

// Switch to the receipt_analyzer database
db = db.getSiblingDB('receipt_analyzer');

// Create collections
db.createCollection('receipt_analysis_requests');
db.createCollection('extracted_receipt_data');
db.createCollection('api_keys');

// Create indexes for performance
// Receipt Analysis Requests indexes
db.receipt_analysis_requests.createIndex({ "id": 1 }, { unique: true });
db.receipt_analysis_requests.createIndex({ "clientId": 1 });
db.receipt_analysis_requests.createIndex({ "status": 1 });
db.receipt_analysis_requests.createIndex({ "createdAt": 1 });
db.receipt_analysis_requests.createIndex({ "updatedAt": 1 });

// Extracted Receipt Data indexes
db.extracted_receipt_data.createIndex({ "requestId": 1 }, { unique: true });
db.extracted_receipt_data.createIndex({ "receiptType": 1 });
db.extracted_receipt_data.createIndex({ "extractedAt": 1 });
db.extracted_receipt_data.createIndex({ "extractedFields.totalAmount.value": 1 });
db.extracted_receipt_data.createIndex({ "extractedFields.date.value": 1 });

// API Keys indexes
db.api_keys.createIndex({ "key": 1 }, { unique: true });
db.api_keys.createIndex({ "clientId": 1 });
db.api_keys.createIndex({ "isActive": 1 });

// Create TTL index for temporary data cleanup (30 days)
db.receipt_analysis_requests.createIndex(
  { "createdAt": 1 }, 
  { expireAfterSeconds: 2592000 } // 30 days
);

// Insert sample API key for development (remove in production)
if (db.getName() === 'receipt_analyzer') {
  db.api_keys.insertOne({
    key: 'dev-api-key-12345',
    clientId: 'dev-client',
    name: 'Development Client',
    isActive: true,
    createdAt: new Date(),
    permissions: ['analyze', 'status', 'result']
  });
}

print('Receipt Analyzer database initialized successfully');
print('Collections created: receipt_analysis_requests, extracted_receipt_data, api_keys');
print('Indexes created for optimal performance');
print('Sample API key created for development: dev-api-key-12345');