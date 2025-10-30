import OpenAI from 'openai';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { ExtractionResult } from './dataExtractionService';
import { ProcessingError, ErrorCode } from '../types/errors';

export interface OpenAIExtractionResult extends ExtractionResult {
    aiProcessed: boolean;
    aiModel: string;
    aiConfidence: number;
}

class OpenAIService {
    private static instance: OpenAIService;
    private client: OpenAI | null = null;
    private isInitialized = false;

    private constructor() { }

    public static getInstance(): OpenAIService {
        if (!OpenAIService.instance) {
            OpenAIService.instance = new OpenAIService();
        }
        return OpenAIService.instance;
    }

    /**
     * Initialize OpenAI client
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        if (!config.openai.apiKey) {
            logger.warn('OpenAI API key not configured, AI extraction will be disabled');
            return;
        }

        try {
            this.client = new OpenAI({
                apiKey: config.openai.apiKey,
            });

            // Test the connection
            await this.client.models.list();

            this.isInitialized = true;
            logger.info('OpenAI service initialized successfully', {
                model: config.openai.model
            });
        } catch (error) {
            logger.error('Failed to initialize OpenAI service', { error });
            throw new ProcessingError(
                'Erreur d\'initialisation du service OpenAI',
                ErrorCode.SERVICE_UNAVAILABLE,
                { error: error instanceof Error ? error.message : 'Unknown error' }
            );
        }
    }

    /**
     * Extract receipt data using OpenAI
     */
    async extractReceiptData(ocrText: string): Promise<OpenAIExtractionResult> {
        if (!this.isInitialized || !this.client) {
            throw new ProcessingError(
                'Service OpenAI non initialisé',
                ErrorCode.SERVICE_UNAVAILABLE
            );
        }

        try {
            logger.info('Starting OpenAI receipt extraction');

            const prompt = this.buildExtractionPrompt(ocrText);

            const completion = await this.client.chat.completions.create({
                model: config.openai.model,
                messages: [
                    {
                        role: 'system',
                        content: 'Tu es un expert en analyse de reçus. Extrait les informations structurées des reçus avec précision.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: config.openai.maxTokens,
                temperature: config.openai.temperature,
                response_format: { type: 'json_object' }
            });

            const response = completion.choices[0]?.message?.content;
            if (!response) {
                throw new Error('Aucune réponse reçue d\'OpenAI');
            }

            const extractedData = JSON.parse(response);
            const result = this.formatOpenAIResponse(extractedData);

            logger.info('OpenAI extraction completed successfully', {
                model: config.openai.model,
                tokensUsed: completion.usage?.total_tokens,
                aiConfidence: result.aiConfidence
            });

            return result;

        } catch (error) {
            logger.error('OpenAI extraction failed', { error });
            throw new ProcessingError(
                'Erreur lors de l\'extraction OpenAI',
                ErrorCode.PROCESSING_ERROR,
                { error: error instanceof Error ? error.message : 'Unknown error' }
            );
        }
    }

    /**
     * Build extraction prompt for OpenAI
     */
    private buildExtractionPrompt(ocrText: string): string {
        return `
Analyse ce texte OCR d'un reçu et extrait les informations suivantes au format JSON strict :

TEXTE OCR:
${ocrText}

INSTRUCTIONS:
- Extrait UNIQUEMENT les informations présentes dans le texte
- Utilise le format JSON exact demandé
- Pour les montants, utilise des nombres décimaux (ex: 12.50)
- Pour les dates, utilise le format YYYY-MM-DD
- Si une information n'est pas trouvée, utilise null
- Calcule un score de confiance de 0 à 1 pour chaque champ

FORMAT JSON REQUIS:
{
  "totalAmount": {
    "value": 0.00,
    "currency": "EUR",
    "confidence": 0.0,
    "rawText": "texte original trouvé"
  },
  "date": {
    "value": "YYYY-MM-DD",
    "confidence": 0.0,
    "rawText": "texte original trouvé"
  },
  "merchantName": {
    "value": "nom du marchand",
    "confidence": 0.0,
    "rawText": "texte original trouvé"
  },
  "items": [
    {
      "name": "nom article",
      "quantity": 1,
      "unitPrice": 0.00,
      "totalPrice": 0.00,
      "confidence": 0.0
    }
  ],
  "paymentMethod": {
    "value": "méthode de paiement",
    "confidence": 0.0,
    "rawText": "texte original trouvé"
  },
  "receiptNumber": {
    "value": "numéro de reçu",
    "confidence": 0.0,
    "rawText": "texte original trouvé"
  },
  "summary": "résumé de l'achat",
  "aiConfidence": 0.0
}

Réponds UNIQUEMENT avec le JSON, sans texte supplémentaire.
`;
    }

    /**
     * Format OpenAI response to match our interface
     */
    private formatOpenAIResponse(data: any): OpenAIExtractionResult {
        return {
            totalAmount: {
                value: data.totalAmount?.value || 0,
                currency: data.totalAmount?.currency || 'EUR',
                confidence: data.totalAmount?.confidence || 0,
                rawText: data.totalAmount?.rawText
            },
            date: {
                value: data.date?.value || new Date().toISOString().split('T')[0],
                confidence: data.date?.confidence || 0,
                rawText: data.date?.rawText
            },
            merchantName: {
                value: data.merchantName?.value || 'Marchand inconnu',
                confidence: data.merchantName?.confidence || 0,
                rawText: data.merchantName?.rawText
            },
            items: data.items || [],
            summary: data.summary || 'Reçu analysé par IA',
            paymentMethod: data.paymentMethod,
            receiptNumber: data.receiptNumber,
            aiProcessed: true,
            aiModel: config.openai.model,
            aiConfidence: data.aiConfidence || 0.5
        };
    }

    /**
     * Check if OpenAI service is available
     */
    isAvailable(): boolean {
        return this.isInitialized && !!this.client;
    }

    /**
     * Get service health status
     */
    async getHealthStatus(): Promise<{
        status: 'healthy' | 'unhealthy';
        initialized: boolean;
        hasApiKey: boolean;
    }> {
        return {
            status: this.isAvailable() ? 'healthy' : 'unhealthy',
            initialized: this.isInitialized,
            hasApiKey: !!config.openai.apiKey
        };
    }
}

export const openaiService = OpenAIService.getInstance();