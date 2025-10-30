// Basic Node.js type declarations for development
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: string;
      PORT?: string;
      MONGODB_URI?: string;
      DB_NAME?: string;
      REDIS_HOST?: string;
      REDIS_PORT?: string;
      REDIS_PASSWORD?: string;
      TESSERACT_LANG?: string;
      OCR_CONFIDENCE_THRESHOLD?: string;
      OPENAI_API_KEY?: string;
      OPENAI_MODEL?: string;
      OPENAI_MAX_TOKENS?: string;
      OPENAI_TEMPERATURE?: string;
      MAX_FILE_SIZE?: string;
      ALLOWED_FORMATS?: string;
      UPLOAD_DIR?: string;
      RATE_LIMIT_WINDOW_MS?: string;
      RATE_LIMIT_MAX_REQUESTS?: string;
      RATE_LIMIT_WHITELIST?: string;
      API_KEY_HEADER?: string;
      JWT_SECRET?: string;
      API_KEYS?: string;
      CORS_ORIGIN?: string;
      CORS_CREDENTIALS?: string;
      LOG_LEVEL?: string;
      LOG_FILE?: string;
      PROCESSING_TIMEOUT_MS?: string;
      QUEUE_CONCURRENCY?: string;
      CACHE_DEFAULT_TTL?: string;
      CACHE_STATUS_TTL?: string;
      CACHE_RESULT_TTL?: string;
      CACHE_OCR_TTL?: string;
      ENABLE_INPUT_SANITIZATION?: string;
      LOG_SENSITIVE_DATA?: string;
    }
  }

  var process: {
    env: NodeJS.ProcessEnv;
    exit(code?: number): never;
  };

  var console: {
    log(...args: any[]): void;
    error(...args: any[]): void;
    warn(...args: any[]): void;
    info(...args: any[]): void;
  };

  function require(id: string): any;

  var Buffer: {
    from(data: string | ArrayBuffer | number[], encoding?: string): Buffer;
    alloc(size: number): Buffer;
  };

  interface Buffer {
    toString(encoding?: string): string;
    length: number;
  }
}

// Crypto module types
declare module 'crypto' {
  export function randomBytes(size: number): Buffer;
  export function randomUUID(): string;
  export function createHash(algorithm: string): Hash;
  export function createCipher(algorithm: string, key: Buffer): Cipher;
  export function createDecipher(algorithm: string, key: Buffer): Decipher;
  export function pbkdf2Sync(password: string, salt: string, iterations: number, keylen: number, digest: string): Buffer;
  export function scryptSync(password: string, salt: string, keylen: number): Buffer;

  interface Hash {
    update(data: string | Buffer): Hash;
    digest(encoding?: string): string | Buffer;
  }

  interface Cipher {
    update(data: string, inputEncoding?: string, outputEncoding?: string): string;
    final(outputEncoding?: string): string;
    getAuthTag(): Buffer;
  }

  interface Decipher {
    update(data: string, inputEncoding?: string, outputEncoding?: string): string;
    final(outputEncoding?: string): string;
    setAuthTag(tag: Buffer): void;
  }
}

export {};