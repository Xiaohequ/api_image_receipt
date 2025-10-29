import { DataExtractionService } from '../services/dataExtractionService';
import { ReceiptType } from '../types';

describe('DataExtractionService', () => {
  let dataExtractionService: DataExtractionService;

  beforeEach(() => {
    dataExtractionService = DataExtractionService.getInstance();
  });

  it('should create data extraction service instance', () => {
    expect(dataExtractionService).toBeDefined();
  });

  it('should have required methods', () => {
    expect(typeof dataExtractionService.extractData).toBe('function');
  });

  describe('extractData', () => {
    it('should extract total amount from French receipt text', async () => {
      const sampleText = `
        SUPERMARCHÉ LECLERC
        123 Rue de la Paix
        75001 PARIS
        
        TICKET DE CAISSE
        Date: 15/03/2024
        
        Pain de mie    2.50€
        Lait 1L        1.20€
        Fromage        4.30€
        
        TOTAL          8.00€
        
        Merci de votre visite
      `;

      const result = await dataExtractionService.extractData(sampleText);

      expect(result.totalAmount.value).toBe(8.00);
      expect(result.totalAmount.currency).toBe('EUR');
      expect(result.totalAmount.confidence).toBeGreaterThan(0.5);
    });

    it('should extract merchant name from receipt text', async () => {
      const sampleText = `
        CARREFOUR MARKET
        Avenue des Champs
        
        Ticket n°: 12345
        Date: 20/03/2024
        
        Total: 15.50€
      `;

      const result = await dataExtractionService.extractData(sampleText);

      expect(result.merchantName.value).toContain('CARREFOUR');
      expect(result.merchantName.confidence).toBeGreaterThan(0.5);
    });

    it('should extract date in ISO format', async () => {
      const sampleText = `
        MAGASIN TEST
        
        Date: 25/12/2023
        Total: 10.00€
      `;

      const result = await dataExtractionService.extractData(sampleText);

      expect(result.date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.date.confidence).toBeGreaterThan(0.5);
    });

    it('should extract items from receipt text', async () => {
      const sampleText = `
        AUCHAN
        
        2 x Pain        3.00€
        Eau 1.5L        0.80€
        Pommes 1kg      2.50€
        
        Total: 6.30€
      `;

      const result = await dataExtractionService.extractData(sampleText);

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]).toHaveProperty('name');
      expect(result.items[0]).toHaveProperty('totalPrice');
    });

    it('should generate meaningful summary', async () => {
      const sampleText = `
        MONOPRIX
        
        Date: 10/04/2024
        Total: 25.75€
      `;

      const result = await dataExtractionService.extractData(sampleText);

      expect(result.summary).toContain('MONOPRIX');
      expect(result.summary).toContain('25.75');
      expect(result.summary.length).toBeGreaterThan(10);
    });

    it('should handle English receipt text', async () => {
      const sampleText = `
        WALMART STORE
        123 Main Street
        
        Receipt #: 789456
        Date: 03/15/2024
        
        Bread          $2.50
        Milk 1gal      $3.20
        
        Total          $5.70
        
        Thank you for shopping
      `;

      const result = await dataExtractionService.extractData(sampleText, { language: 'en' });

      expect(result.totalAmount.value).toBe(5.70);
      expect(result.totalAmount.currency).toBe('USD');
      expect(result.merchantName.value).toContain('WALMART');
    });

    it('should extract tax amount when present', async () => {
      const sampleText = `
        FNAC
        
        Livre          15.00€
        TVA 20%         3.00€
        Total          18.00€
      `;

      const result = await dataExtractionService.extractData(sampleText);

      expect(result.taxAmount).toBeDefined();
      expect(result.taxAmount?.value).toBe(3.00);
    });

    it('should extract payment method when present', async () => {
      const sampleText = `
        DARTY
        
        Ordinateur    599.00€
        Total         599.00€
        
        Paiement: CARTE VISA
      `;

      const result = await dataExtractionService.extractData(sampleText);

      expect(result.paymentMethod).toBeDefined();
      expect(result.paymentMethod?.value).toContain('Visa');
    });

    it('should handle poor quality text gracefully', async () => {
      const sampleText = `
        M@G@S1N T3ST
        D@t3: 1$/0#/2024
        T0t@l: 1$.00€
      `;

      const result = await dataExtractionService.extractData(sampleText);

      // Should still extract some basic information even with poor OCR
      expect(result.totalAmount.value).toBeGreaterThanOrEqual(0);
      expect(result.merchantName.value).toBeDefined();
      expect(result.date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should validate extracted data when strict validation is enabled', async () => {
      const invalidText = `
        Invalid receipt
        No amount or date
      `;

      await expect(
        dataExtractionService.extractData(invalidText, { strictValidation: true })
      ).rejects.toThrow();
    });
  });
});