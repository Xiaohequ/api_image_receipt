// Export all repositories
export { BaseRepository } from './BaseRepository';
export { ReceiptAnalysisRequestRepository } from './ReceiptAnalysisRequestRepository';
export { ExtractedReceiptDataRepository } from './ExtractedReceiptDataRepository';

// Import classes for instantiation
import { ReceiptAnalysisRequestRepository } from './ReceiptAnalysisRequestRepository';
import { ExtractedReceiptDataRepository } from './ExtractedReceiptDataRepository';

// Create singleton instances for easy access
export const receiptAnalysisRequestRepository = new ReceiptAnalysisRequestRepository();
export const extractedReceiptDataRepository = new ExtractedReceiptDataRepository();