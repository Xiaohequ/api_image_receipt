// Intelligent Data Extraction Service for Receipt Analysis
// This service implements sophisticated patterns and logic to extract structured data from OCR text

import { logger } from '../utils/logger';
import { ReceiptType, ExtractedField, ReceiptItem } from '../types';
import { ProcessingError, ErrorCode } from '../types/errors';

export interface ExtractionResult {
  totalAmount: ExtractedField<number> & { currency: string };
  date: ExtractedField<string>;
  merchantName: ExtractedField<string>;
  items: ReceiptItem[];
  summary: string;
  taxAmount?: ExtractedField<number>;
  subtotal?: ExtractedField<number>;
  paymentMethod?: ExtractedField<string>;
  receiptNumber?: ExtractedField<string>;
}

export interface ExtractionOptions {
  language?: 'fr' | 'en' | 'auto';
  receiptType?: ReceiptType;
  strictValidation?: boolean;
}

export class DataExtractionService {
  private static instance: DataExtractionService;

  // Regex patterns for amount detection
  private readonly amountPatterns = {
    french: [
      // Total patterns in French
      /(?:total|montant|somme|à\s+payer)[:\s]*([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/gi,
      /([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)\s*(?:total|montant|somme)/gi,
      // Card payment patterns
      /(?:carte|cb|visa|mastercard)[:\s]*([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/gi,
      // Generic amount patterns (last resort)
      /([€$£¥])\s*(\d+[.,]\d{2})/g,
      /(\d+[.,]\d{2})\s*([€$£¥])/g
    ],
    english: [
      /(?:total|amount|sum|to\s+pay)[:\s]*([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/gi,
      /([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)\s*(?:total|amount|sum)/gi,
      /(?:card|visa|mastercard)[:\s]*([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/gi,
      /([€$£¥])\s*(\d+[.,]\d{2})/g,
      /(\d+[.,]\d{2})\s*([€$£¥])/g
    ]
  };

  // Date patterns for different formats
  private readonly datePatterns = [
    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g,
    // YYYY/MM/DD or YYYY-MM-DD
    /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/g,
    // DD Month YYYY (French)
    /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{2,4})/gi,
    // DD Month YYYY (English)
    /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{2,4})/gi,
    // Month DD, YYYY
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{2,4})/gi,
    // DD/MM/YY
    /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})/g
  ];

  // Merchant name patterns and indicators
  private readonly merchantIndicators = {
    french: ['magasin', 'enseigne', 'commerce', 'boutique', 'supermarché', 'hypermarché'],
    english: ['store', 'shop', 'market', 'supermarket', 'mall', 'outlet']
  };

  // Item extraction patterns
  private readonly itemPatterns = [
    // Quantity x Item Price
    /(\d+)\s*x\s*([^0-9€$£¥]+?)\s*([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/gi,
    // Item followed by price
    /([a-zA-ZÀ-ÿ\s]{3,30})\s+([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/g,
    // Item with quantity and unit price
    /([a-zA-ZÀ-ÿ\s]{3,30})\s+(\d+)\s*x\s*([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/gi
  ];

  // Currency symbols and codes
  private readonly currencies = {
    '€': 'EUR',
    '$': 'USD',
    '£': 'GBP',
    '¥': 'JPY',
    'eur': 'EUR',
    'usd': 'USD',
    'gbp': 'GBP',
    'jpy': 'JPY'
  };

  // Month name mappings
  private readonly monthMappings: Record<string, Record<string, number>> = {
    french: {
      'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
      'juillet': 7, 'août': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12
    },
    english: {
      'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
      'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
    }
  };

  private constructor() {}

  public static getInstance(): DataExtractionService {
    if (!DataExtractionService.instance) {
      DataExtractionService.instance = new DataExtractionService();
    }
    return DataExtractionService.instance;
  }

  /**
   * Extract structured data from OCR text
   */
  async extractData(
    text: string,
    options: ExtractionOptions = {}
  ): Promise<ExtractionResult> {
    try {
      logger.info('Starting intelligent data extraction');

      const language = options.language || this.detectLanguage(text);
      const receiptType = options.receiptType || this.detectReceiptType(text);

      // Extract individual fields
      const totalAmount = this.extractTotalAmount(text, language);
      const date = this.extractDate(text);
      const merchantName = this.extractMerchantName(text, language);
      const items = this.extractItems(text, language);
      const summary = this.generateSummary(text, merchantName.value, totalAmount.value);
      
      // Optional fields
      const taxAmount = this.extractTaxAmount(text, language);
      const subtotal = this.extractSubtotal(text, language);
      const paymentMethod = this.extractPaymentMethod(text, language);
      const receiptNumber = this.extractReceiptNumber(text);

      // Validate extracted data if strict validation is enabled
      if (options.strictValidation) {
        this.validateExtractedData({
          totalAmount,
          date,
          merchantName,
          items,
          summary,
          taxAmount,
          subtotal,
          paymentMethod,
          receiptNumber
        });
      }

      logger.info('Data extraction completed successfully', {
        totalAmount: totalAmount.value,
        currency: totalAmount.currency,
        date: date.value,
        merchant: merchantName.value,
        itemCount: items.length,
        language,
        receiptType
      });

      return {
        totalAmount,
        date,
        merchantName,
        items,
        summary,
        taxAmount,
        subtotal,
        paymentMethod,
        receiptNumber
      };

    } catch (error) {
      logger.error('Data extraction failed:', error);
      throw new ProcessingError(
        'Failed to extract data from receipt text',
        ErrorCode.PROCESSING_ERROR,
        { originalError: error }
      );
    }
  }

  /**
   * Extract total amount with sophisticated pattern matching
   */
  private extractTotalAmount(text: string, language: string): ExtractedField<number> & { currency: string } {
    const patterns = language === 'fr' ? this.amountPatterns.french : this.amountPatterns.english;
    const candidates: Array<{ value: number; currency: string; confidence: number; rawText: string }> = [];

    for (const pattern of patterns) {
      const matches = Array.from(text.matchAll(pattern));
      
      for (const match of matches) {
        const { amount, currency } = this.parseAmountMatch(match);
        
        if (amount > 0) {
          // Calculate confidence based on context
          const confidence = this.calculateAmountConfidence(match[0], text);
          
          candidates.push({
            value: amount,
            currency,
            confidence,
            rawText: match[0].trim()
          });
        }
      }
    }

    // Sort by confidence and return the best match
    candidates.sort((a, b) => b.confidence - a.confidence);
    
    if (candidates.length > 0) {
      const best = candidates[0];
      return {
        value: this.roundAmount(best.value),
        currency: best.currency,
        confidence: this.roundConfidence(best.confidence),
        rawText: best.rawText
      };
    }

    return {
      value: 0,
      currency: 'EUR',
      confidence: 0.1,
      rawText: undefined
    };
  }

  /**
   * Parse amount from regex match
   */
  private parseAmountMatch(match: RegExpMatchArray): { amount: number; currency: string } {
    let amountStr = '';
    let currency = 'EUR';

    // Handle different match group patterns
    if (match.length >= 3) {
      // Pattern with currency symbol
      const part1 = match[1] || '';
      const part2 = match[2] || '';
      
      if (this.isCurrencySymbol(part1)) {
        currency = this.normalizeCurrency(part1);
        amountStr = part2;
      } else if (this.isCurrencySymbol(part2)) {
        currency = this.normalizeCurrency(part2);
        amountStr = part1;
      } else {
        amountStr = part1;
      }
    } else if (match.length === 2) {
      amountStr = match[1];
    }

    // Clean and parse amount
    const cleanAmount = amountStr.replace(/[^\d.,]/g, '').replace(',', '.');
    const amount = parseFloat(cleanAmount);

    return {
      amount: isNaN(amount) ? 0 : amount,
      currency
    };
  }

  /**
   * Calculate confidence score for amount extraction
   */
  private calculateAmountConfidence(matchText: string, fullText: string): number {
    let confidence = 0.5; // Base confidence

    const lowerMatch = matchText.toLowerCase();
    const lowerText = fullText.toLowerCase();

    // Higher confidence for explicit total indicators
    if (lowerMatch.includes('total')) confidence += 0.3;
    if (lowerMatch.includes('montant')) confidence += 0.3;
    if (lowerMatch.includes('somme')) confidence += 0.25;
    if (lowerMatch.includes('à payer')) confidence += 0.25;

    // Medium confidence for payment method indicators
    if (lowerMatch.includes('carte') || lowerMatch.includes('cb')) confidence += 0.2;
    if (lowerMatch.includes('visa') || lowerMatch.includes('mastercard')) confidence += 0.2;

    // Lower confidence if it appears to be a subtotal or tax
    if (lowerMatch.includes('sous-total') || lowerMatch.includes('subtotal')) confidence -= 0.2;
    if (lowerMatch.includes('tva') || lowerMatch.includes('tax')) confidence -= 0.2;

    // Position-based confidence (totals usually appear at the end)
    const position = fullText.indexOf(matchText) / fullText.length;
    if (position > 0.7) confidence += 0.1; // Near the end
    if (position < 0.3) confidence -= 0.1; // Near the beginning

    return Math.max(0.1, Math.min(1.0, confidence));
  }  /**
   
* Extract date with multiple format support
   */
  private extractDate(text: string): ExtractedField<string> {
    const candidates: Array<{ value: string; confidence: number; rawText: string }> = [];

    for (const pattern of this.datePatterns) {
      const matches = Array.from(text.matchAll(pattern));
      
      for (const match of matches) {
        const parsedDate = this.parseDate(match);
        
        if (parsedDate) {
          const confidence = this.calculateDateConfidence(match[0], text);
          
          candidates.push({
            value: parsedDate,
            confidence,
            rawText: match[0].trim()
          });
        }
      }
    }

    // Sort by confidence and return the best match
    candidates.sort((a, b) => b.confidence - a.confidence);
    
    if (candidates.length > 0) {
      const best = candidates[0];
      return {
        value: best.value,
        confidence: this.roundConfidence(best.confidence),
        rawText: best.rawText
      };
    }

    // Default to current date with low confidence
    return {
      value: new Date().toISOString().split('T')[0],
      confidence: 0.1,
      rawText: undefined
    };
  }

  /**
   * Parse date from regex match
   */
  private parseDate(match: RegExpMatchArray): string | null {
    try {
      if (match.length < 4) return null;

      let day: number, month: number, year: number;

      // Check if it's a month name pattern
      const monthName = match.find(group => 
        group && (this.monthMappings.french[group.toLowerCase()] || this.monthMappings.english[group.toLowerCase()])
      );

      if (monthName) {
        // Handle month name patterns
        const monthNum = this.monthMappings.french[monthName.toLowerCase()] || 
                        this.monthMappings.english[monthName.toLowerCase()];
        
        const numbers = match.filter(group => group && /^\d+$/.test(group)).map(Number);
        
        if (numbers.length >= 2) {
          day = numbers[0];
          month = monthNum;
          year = numbers[1];
        } else {
          return null;
        }
      } else {
        // Handle numeric patterns
        const numbers = match.slice(1).filter(group => group && /^\d+$/.test(group)).map(Number);
        
        if (numbers.length < 3) return null;

        // Determine date format based on number ranges
        if (numbers[0] > 31) {
          // YYYY/MM/DD format
          year = numbers[0];
          month = numbers[1];
          day = numbers[2];
        } else if (numbers[2] > 31) {
          // DD/MM/YYYY format
          day = numbers[0];
          month = numbers[1];
          year = numbers[2];
        } else {
          // Ambiguous - assume DD/MM/YY or DD/MM/YYYY
          day = numbers[0];
          month = numbers[1];
          year = numbers[2];
        }
      }

      // Normalize year
      if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }

      // Validate date components
      if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
        return null;
      }

      // Create and validate date
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
      }

      return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format

    } catch (error) {
      logger.debug('Date parsing failed:', error);
      return null;
    }
  }

  /**
   * Calculate confidence score for date extraction
   */
  private calculateDateConfidence(matchText: string, fullText: string): number {
    let confidence = 0.6; // Base confidence

    // Higher confidence for recent dates
    const parsedDate = new Date(matchText);
    const now = new Date();
    const daysDiff = Math.abs((now.getTime() - parsedDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 30) confidence += 0.2; // Within last month
    else if (daysDiff <= 365) confidence += 0.1; // Within last year
    else if (daysDiff > 365 * 5) confidence -= 0.2; // More than 5 years old

    // Context-based confidence
    const position = fullText.indexOf(matchText) / fullText.length;
    if (position < 0.5) confidence += 0.1; // Dates usually appear early in receipts

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Extract merchant name using multiple strategies
   */
  private extractMerchantName(text: string, language: string): ExtractedField<string> {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const candidates: Array<{ value: string; confidence: number; rawText: string }> = [];

    // Strategy 1: First few lines (most common)
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim();
      if (this.isValidMerchantName(line)) {
        const confidence = this.calculateMerchantConfidence(line, i, text, language);
        candidates.push({
          value: this.normalizeMerchantName(line),
          confidence,
          rawText: line
        });
      }
    }

    // Strategy 2: Look for merchant indicators
    const indicators = language === 'fr' ? this.merchantIndicators.french : this.merchantIndicators.english;
    
    for (const indicator of indicators) {
      const regex = new RegExp(`${indicator}[:\\s]*([^\\n]{3,50})`, 'gi');
      const matches = Array.from(text.matchAll(regex));
      
      for (const match of matches) {
        if (match[1] && this.isValidMerchantName(match[1])) {
          candidates.push({
            value: this.normalizeMerchantName(match[1]),
            confidence: 0.7,
            rawText: match[0].trim()
          });
        }
      }
    }

    // Sort by confidence and return the best match
    candidates.sort((a, b) => b.confidence - a.confidence);
    
    if (candidates.length > 0) {
      const best = candidates[0];
      return {
        value: best.value,
        confidence: this.roundConfidence(best.confidence),
        rawText: best.rawText
      };
    }

    return {
      value: 'Magasin inconnu',
      confidence: 0.1,
      rawText: undefined
    };
  }

  /**
   * Validate if a string could be a merchant name
   */
  private isValidMerchantName(name: string): boolean {
    const trimmed = name.trim();
    
    // Basic length check
    if (trimmed.length < 2 || trimmed.length > 50) return false;
    
    // Should contain letters
    if (!/[a-zA-ZÀ-ÿ]/.test(trimmed)) return false;
    
    // Should not be mostly numbers
    const letterCount = (trimmed.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
    if (letterCount / trimmed.length < 0.3) return false;
    
    // Should not contain too many special characters
    const specialCount = (trimmed.match(/[^a-zA-ZÀ-ÿ0-9\s\-&'.,]/g) || []).length;
    if (specialCount / trimmed.length > 0.3) return false;
    
    // Exclude common non-merchant patterns
    const excludePatterns = [
      /^\d+[\/\-\.]\d+[\/\-\.]\d+$/, // Dates
      /^[€$£¥]?\d+[.,]\d{2}[€$£¥]?$/, // Amounts
      /^(total|montant|tva|tax|subtotal)$/i, // Common receipt terms
      /^(ticket|reçu|receipt)$/i // Receipt identifiers
    ];
    
    return !excludePatterns.some(pattern => pattern.test(trimmed));
  }

  /**
   * Calculate confidence for merchant name
   */
  private calculateMerchantConfidence(name: string, lineIndex: number, fullText: string, language: string): number {
    let confidence = 0.5; // Base confidence

    // Position-based confidence (earlier lines more likely to be merchant name)
    if (lineIndex === 0) confidence += 0.3;
    else if (lineIndex === 1) confidence += 0.2;
    else if (lineIndex === 2) confidence += 0.1;

    // Length-based confidence (reasonable length names are more likely)
    const length = name.length;
    if (length >= 5 && length <= 25) confidence += 0.2;
    else if (length >= 3 && length <= 35) confidence += 0.1;

    // Content-based confidence
    if (/[A-Z]/.test(name)) confidence += 0.1; // Contains uppercase
    if (/&|et|and/i.test(name)) confidence += 0.1; // Contains conjunctions
    if (/ltd|inc|sa|sarl|sas/i.test(name)) confidence += 0.2; // Contains company suffixes

    // Penalize if it looks like other receipt elements
    if (/\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2,4}/.test(name)) confidence -= 0.3; // Contains date
    if (/[€$£¥]\d+|\d+[€$£¥]/.test(name)) confidence -= 0.3; // Contains amount

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Normalize merchant name
   */
  private normalizeMerchantName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s\-&'.,]/g, '') // Remove special characters except common ones
      .substring(0, 50); // Limit length
  }

  /**
   * Extract items from receipt text
   */
  private extractItems(text: string, language: string): ReceiptItem[] {
    const items: ReceiptItem[] = [];
    const processedLines = new Set<string>();

    for (const pattern of this.itemPatterns) {
      const matches = Array.from(text.matchAll(pattern));
      
      for (const match of matches) {
        const item = this.parseItemMatch(match);
        
        if (item && !processedLines.has(match[0])) {
          items.push(item);
          processedLines.add(match[0]);
        }
      }
    }

    // Remove duplicates and invalid items
    return this.deduplicateItems(items);
  }

  /**
   * Parse item from regex match
   */
  private parseItemMatch(match: RegExpMatchArray): ReceiptItem | null {
    try {
      if (match.length < 3) return null;

      let name = '';
      let quantity = 1;
      let unitPrice = 0;
      let totalPrice = 0;

      // Different patterns have different group structures
      if (match.length >= 4) {
        // Pattern with quantity
        const qtyMatch = match.find(group => group && /^\d+$/.test(group));
        if (qtyMatch) {
          quantity = parseInt(qtyMatch);
          name = match.find(group => group && /[a-zA-ZÀ-ÿ]/.test(group) && !this.isCurrencySymbol(group)) || '';
          
          // Find price groups
          const priceGroups = match.filter(group => group && /\d+[.,]\d{2}/.test(group));
          if (priceGroups.length >= 1) {
            totalPrice = this.parsePrice(priceGroups[0]);
            unitPrice = quantity > 0 ? totalPrice / quantity : totalPrice;
          }
        }
      } else {
        // Simple item + price pattern
        name = match[1] || '';
        totalPrice = this.parsePrice(match[2] || '');
        unitPrice = totalPrice;
      }

      // Validate and clean item
      name = name.trim().replace(/[^\w\s\-']/g, '').substring(0, 50);
      
      if (name.length < 2 || totalPrice <= 0) {
        return null;
      }

      return {
        name,
        quantity: quantity > 0 ? quantity : 1,
        unitPrice: this.roundAmount(unitPrice),
        totalPrice: this.roundAmount(totalPrice)
      };

    } catch (error) {
      logger.debug('Item parsing failed:', error);
      return null;
    }
  }

  /**
   * Parse price from string
   */
  private parsePrice(priceStr: string): number {
    const cleaned = priceStr.replace(/[^\d.,]/g, '').replace(',', '.');
    const price = parseFloat(cleaned);
    return isNaN(price) ? 0 : price;
  }

  /**
   * Remove duplicate items
   */
  private deduplicateItems(items: ReceiptItem[]): ReceiptItem[] {
    const seen = new Map<string, ReceiptItem>();
    
    for (const item of items) {
      const key = `${item.name.toLowerCase()}_${item.totalPrice}`;
      
      if (!seen.has(key) || (seen.get(key)!.quantity || 0) < (item.quantity || 0)) {
        seen.set(key, item);
      }
    }
    
    return Array.from(seen.values()).slice(0, 20); // Limit to 20 items max
  }

  /**
   * Extract tax amount
   */
  private extractTaxAmount(text: string, language: string): ExtractedField<number> | undefined {
    const patterns = language === 'fr' 
      ? [/tva[:\s]*([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/gi]
      : [/tax[:\s]*([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/gi];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const { amount } = this.parseAmountMatch(match);
        if (amount > 0) {
          return {
            value: this.roundAmount(amount),
            confidence: 0.7,
            rawText: match[0].trim()
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Extract subtotal
   */
  private extractSubtotal(text: string, language: string): ExtractedField<number> | undefined {
    const patterns = language === 'fr' 
      ? [/sous[\-\s]*total[:\s]*([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/gi]
      : [/sub[\-\s]*total[:\s]*([€$£¥]?\s*\d+[.,]\d{2})\s*([€$£¥]?)/gi];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const { amount } = this.parseAmountMatch(match);
        if (amount > 0) {
          return {
            value: this.roundAmount(amount),
            confidence: 0.7,
            rawText: match[0].trim()
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Extract payment method
   */
  private extractPaymentMethod(text: string, language: string): ExtractedField<string> | undefined {
    const patterns = {
      french: [
        /(?:carte|cb|visa|mastercard|amex|american express)/gi,
        /(?:espèces|liquide|cash)/gi,
        /(?:chèque|cheque)/gi
      ],
      english: [
        /(?:card|visa|mastercard|amex|american express)/gi,
        /(?:cash|money)/gi,
        /(?:check|cheque)/gi
      ]
    };

    const methodPatterns = language === 'fr' ? patterns.french : patterns.english;

    for (const pattern of methodPatterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          value: this.normalizePaymentMethod(match[0]),
          confidence: 0.8,
          rawText: match[0].trim()
        };
      }
    }

    return undefined;
  }

  /**
   * Extract receipt number
   */
  private extractReceiptNumber(text: string): ExtractedField<string> | undefined {
    const patterns = [
      /(?:ticket|reçu|receipt|n°|no|#)[:\s]*([a-zA-Z0-9\-]{4,20})/gi,
      /([a-zA-Z0-9\-]{8,15})/g // Generic alphanumeric patterns
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return {
          value: match[1].trim(),
          confidence: 0.6,
          rawText: match[0].trim()
        };
      }
    }

    return undefined;
  }

  /**
   * Generate intelligent summary
   */
  private generateSummary(text: string, merchantName: string, totalAmount: number): string {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    // Create summary based on available information
    let summary = '';
    
    if (merchantName && merchantName !== 'Magasin inconnu') {
      summary += `Achat chez ${merchantName}`;
    } else {
      summary += 'Achat';
    }
    
    if (totalAmount > 0) {
      summary += ` pour un montant de ${totalAmount.toFixed(2)}€`;
    }
    
    // Add date if we can extract it quickly
    const dateMatch = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (dateMatch) {
      summary += ` le ${dateMatch[0]}`;
    }
    
    // Add item count if we can estimate it
    const itemLines = lines.filter(line => 
      /\d+[.,]\d{2}/.test(line) && 
      /[a-zA-ZÀ-ÿ]/.test(line) && 
      line.length > 5
    );
    
    if (itemLines.length > 1) {
      summary += ` (${itemLines.length} articles)`;
    }
    
    return summary.substring(0, 200);
  }

  /**
   * Detect language from text
   */
  private detectLanguage(text: string): string {
    const frenchWords = ['total', 'montant', 'tva', 'magasin', 'caisse', 'ticket', 'reçu', 'merci', 'carte', 'espèces'];
    const englishWords = ['total', 'amount', 'tax', 'store', 'cash', 'receipt', 'thank', 'card', 'change'];
    
    const lowerText = text.toLowerCase();
    const frenchCount = frenchWords.filter(word => lowerText.includes(word)).length;
    const englishCount = englishWords.filter(word => lowerText.includes(word)).length;
    
    return frenchCount > englishCount ? 'fr' : 'en';
  }

  /**
   * Detect receipt type from text content
   */
  private detectReceiptType(text: string): ReceiptType {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('carte') || lowerText.includes('card') || lowerText.includes('cb')) {
      return ReceiptType.CARD_PAYMENT;
    }
    
    if (lowerText.includes('caisse') || lowerText.includes('ticket')) {
      return ReceiptType.CASH_REGISTER;
    }
    
    if (lowerText.includes('magasin') || lowerText.includes('store') || lowerText.includes('supermarché')) {
      return ReceiptType.RETAIL;
    }
    
    return ReceiptType.UNKNOWN;
  }

  /**
   * Utility methods
   */
  private isCurrencySymbol(str: string): boolean {
    return Object.keys(this.currencies).some(symbol => 
      str.toLowerCase().includes(symbol.toLowerCase())
    );
  }

  private normalizeCurrency(currencyStr: string): string {
    const lower = currencyStr.toLowerCase().trim();
    return this.currencies[lower as keyof typeof this.currencies] || 'EUR';
  }

  private normalizePaymentMethod(method: string): string {
    const lower = method.toLowerCase();
    if (lower.includes('carte') || lower.includes('card') || lower.includes('cb')) return 'Carte';
    if (lower.includes('espèces') || lower.includes('cash') || lower.includes('liquide')) return 'Espèces';
    if (lower.includes('chèque') || lower.includes('check')) return 'Chèque';
    if (lower.includes('visa')) return 'Visa';
    if (lower.includes('mastercard')) return 'Mastercard';
    return method;
  }

  private roundAmount(amount: number): number {
    return Math.round(amount * 100) / 100;
  }

  private roundConfidence(confidence: number): number {
    return Math.round(confidence * 100) / 100;
  }

  /**
   * Validate extracted data for consistency
   */
  private validateExtractedData(data: ExtractionResult): void {
    // Validate total amount
    if (data.totalAmount.value <= 0) {
      throw new ProcessingError(
        'Invalid total amount extracted',
        ErrorCode.PROCESSING_ERROR,
        { totalAmount: data.totalAmount.value }
      );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date.value)) {
      throw new ProcessingError(
        'Invalid date format extracted',
        ErrorCode.PROCESSING_ERROR,
        { date: data.date.value }
      );
    }

    // Validate merchant name
    if (!data.merchantName.value || data.merchantName.value.length < 2) {
      throw new ProcessingError(
        'Invalid merchant name extracted',
        ErrorCode.PROCESSING_ERROR,
        { merchantName: data.merchantName.value }
      );
    }

    // Validate item prices sum if items are present
    if (data.items.length > 0) {
      const itemsTotal = data.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      const totalAmount = data.totalAmount.value;
      
      // Allow some tolerance for tax and other fees
      if (itemsTotal > 0 && Math.abs(itemsTotal - totalAmount) / totalAmount > 0.5) {
        logger.warn('Items total does not match receipt total', {
          itemsTotal,
          receiptTotal: totalAmount,
          difference: Math.abs(itemsTotal - totalAmount)
        });
      }
    }
  }
}

// Export singleton instance
export const dataExtractionService = DataExtractionService.getInstance();