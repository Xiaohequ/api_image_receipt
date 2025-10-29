// Example demonstrating the intelligent data extraction service
// This file shows how to use the DataExtractionService with sample receipt text

import { dataExtractionService } from '../services/dataExtractionService';

// Sample French receipt text
const frenchReceiptText = `
CARREFOUR MARKET
123 Avenue de la République
75011 PARIS

TICKET DE CAISSE
Date: 15/03/2024
Heure: 14:30

Pain de mie Harrys        2.50€
Lait demi-écrémé 1L       1.20€
Fromage Emmental 200g     4.30€
Pommes Golden 1kg         2.80€
Eau Evian 6x1.5L          3.90€

Sous-total               14.70€
TVA 5.5%                  0.81€
TVA 20%                   0.86€

TOTAL                    16.37€

Paiement: CARTE VISA
Merci de votre visite!
`;

// Sample English receipt text
const englishReceiptText = `
WALMART SUPERCENTER
Store #1234
123 Main Street
Anytown, USA 12345

Receipt #: 7894561230
Date: 03/15/2024
Time: 2:30 PM

Bread Loaf               $2.50
Milk 1 Gallon            $3.20
Cheese Slices            $4.30
Apples 2 lbs             $2.80
Water 24-pack            $3.90

Subtotal                $16.70
Tax                      $1.34

TOTAL                   $18.04

Payment: VISA ****1234
Thank you for shopping!
`;

async function demonstrateDataExtraction() {
  console.log('=== Data Extraction Service Demo ===\n');

  try {
    // Extract data from French receipt
    console.log('1. Extracting data from French receipt...');
    const frenchResult = await dataExtractionService.extractData(frenchReceiptText, {
      language: 'fr',
      strictValidation: false
    });

    console.log('French Receipt Results:');
    console.log(`- Merchant: ${frenchResult.merchantName.value} (confidence: ${frenchResult.merchantName.confidence})`);
    console.log(`- Total: ${frenchResult.totalAmount.value}${frenchResult.totalAmount.currency} (confidence: ${frenchResult.totalAmount.confidence})`);
    console.log(`- Date: ${frenchResult.date.value} (confidence: ${frenchResult.date.confidence})`);
    console.log(`- Items found: ${frenchResult.items.length}`);
    console.log(`- Tax amount: ${frenchResult.taxAmount?.value || 'N/A'}`);
    console.log(`- Payment method: ${frenchResult.paymentMethod?.value || 'N/A'}`);
    console.log(`- Summary: ${frenchResult.summary}`);
    console.log('');

    // Extract data from English receipt
    console.log('2. Extracting data from English receipt...');
    const englishResult = await dataExtractionService.extractData(englishReceiptText, {
      language: 'en',
      strictValidation: false
    });

    console.log('English Receipt Results:');
    console.log(`- Merchant: ${englishResult.merchantName.value} (confidence: ${englishResult.merchantName.confidence})`);
    console.log(`- Total: ${englishResult.totalAmount.value}${englishResult.totalAmount.currency} (confidence: ${englishResult.totalAmount.confidence})`);
    console.log(`- Date: ${englishResult.date.value} (confidence: ${englishResult.date.confidence})`);
    console.log(`- Items found: ${englishResult.items.length}`);
    console.log(`- Tax amount: ${englishResult.taxAmount?.value || 'N/A'}`);
    console.log(`- Payment method: ${englishResult.paymentMethod?.value || 'N/A'}`);
    console.log(`- Summary: ${englishResult.summary}`);
    console.log('');

    // Demonstrate item extraction details
    if (frenchResult.items.length > 0) {
      console.log('3. Item extraction details (French receipt):');
      frenchResult.items.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.name} - Qty: ${item.quantity || 1} - Price: ${item.totalPrice}€`);
      });
      console.log('');
    }

    console.log('=== Demo completed successfully ===');

  } catch (error) {
    console.error('Error during data extraction demo:', error);
  }
}

// Export for potential use in other examples
export { demonstrateDataExtraction, frenchReceiptText, englishReceiptText };

// Run demo if this file is executed directly
if (require.main === module) {
  demonstrateDataExtraction();
}