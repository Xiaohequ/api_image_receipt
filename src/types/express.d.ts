import { RateLimitInfo } from './index';

declare global {
  namespace Express {
    interface Request {
      clientId?: string;
      apiKey?: string;
      sanitizedHeaders?: Record<string, any>;
      rateLimitInfo?: RateLimitInfo;
      requestId?: string;
      startTime?: number;
    }
  }
}

export {};