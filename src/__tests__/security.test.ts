import { 
  encrypt, 
  decrypt, 
  hash, 
  verifyHash, 
  sanitize, 
  validate, 
  generateToken,
  securityHeaders,
  rateLimitUtils
} from '../utils/security';

// Mock config
jest.mock('../config/config', () => ({
  config: {
    security: {
      jwtSecret: 'test-secret-key-for-encryption'
    }
  }
}));

jest.mock('../utils/logger');

describe('Security Utilities', () => {
  describe('Encryption/Decryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const originalText = 'sensitive data to encrypt';
      
      const encrypted = encrypt(originalText);
      expect(encrypted).not.toBe(originalText);
      expect(encrypted).toContain(':'); // Should contain separators
      
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('should produce different encrypted values for same input', () => {
      const text = 'test data';
      
      const encrypted1 = encrypt(text);
      const encrypted2 = encrypt(text);
      
      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(text);
      expect(decrypt(encrypted2)).toBe(text);
    });

    it('should throw error for invalid encrypted data format', () => {
      expect(() => decrypt('invalid-format')).toThrow();
      expect(() => decrypt('part1:part2')).toThrow(); // Missing part
    });
  });

  describe('Hashing', () => {
    it('should hash data with salt', () => {
      const data = 'password123';
      
      const hashed = hash(data);
      expect(hashed).toContain(':'); // Should contain salt separator
      expect(hashed).not.toBe(data);
    });

    it('should verify hashed data correctly', () => {
      const data = 'password123';
      const hashed = hash(data);
      
      expect(verifyHash(data, hashed)).toBe(true);
      expect(verifyHash('wrong-password', hashed)).toBe(false);
    });

    it('should produce different hashes for same input', () => {
      const data = 'test-data';
      
      const hash1 = hash(data);
      const hash2 = hash(data);
      
      expect(hash1).not.toBe(hash2);
      expect(verifyHash(data, hash1)).toBe(true);
      expect(verifyHash(data, hash2)).toBe(true);
    });

    it('should handle invalid hash format', () => {
      expect(verifyHash('data', 'invalid-format')).toBe(false);
    });
  });

  describe('Input Sanitization', () => {
    describe('HTML sanitization', () => {
      it('should remove HTML tags', () => {
        const input = '<script>alert("xss")</script>Hello World';
        const result = sanitize.html(input);
        
        expect(result).toBe('Hello World');
        expect(result).not.toContain('<script>');
      });

      it('should remove dangerous characters', () => {
        const input = 'Hello<>&\'"World';
        const result = sanitize.html(input);
        
        expect(result).toBe('HelloWorld');
      });

      it('should handle non-string input', () => {
        expect(sanitize.html(null as any)).toBe('');
        expect(sanitize.html(undefined as any)).toBe('');
        expect(sanitize.html(123 as any)).toBe('');
      });
    });

    describe('Filename sanitization', () => {
      it('should allow safe characters', () => {
        const input = 'document_v1.2-final.pdf';
        const result = sanitize.filename(input);
        
        expect(result).toBe('document_v1.2-final.pdf');
      });

      it('should remove dangerous characters', () => {
        const input = '../../../etc/passwd';
        const result = sanitize.filename(input);
        
        expect(result).toBe('etcpasswd');
        expect(result).not.toContain('../');
      });

      it('should prevent path traversal', () => {
        const input = '....//....//file.txt';
        const result = sanitize.filename(input);
        
        expect(result).not.toContain('..');
        expect(result).not.toContain('//');
      });

      it('should limit filename length', () => {
        const longName = 'a'.repeat(300);
        const result = sanitize.filename(longName);
        
        expect(result.length).toBeLessThanOrEqual(255);
      });
    });

    describe('API key sanitization', () => {
      it('should allow valid API key characters', () => {
        const input = 'ak_1234567890abcdef-test_key';
        const result = sanitize.apiKey(input);
        
        expect(result).toBe('ak_1234567890abcdef-test_key');
      });

      it('should remove invalid characters', () => {
        const input = 'ak_123!@#$%^&*()+={}[]|\\:";\'<>?,./';
        const result = sanitize.apiKey(input);
        
        expect(result).toBe('ak_123');
      });
    });

    describe('Client ID sanitization', () => {
      it('should accept valid UUID', () => {
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        const result = sanitize.clientId(uuid);
        
        expect(result).toBe(uuid);
      });

      it('should reject invalid UUID format', () => {
        const invalid = 'not-a-uuid';
        const result = sanitize.clientId(invalid);
        
        expect(result).toBe('');
      });

      it('should normalize case', () => {
        const uuid = '123E4567-E89B-12D3-A456-426614174000';
        const result = sanitize.clientId(uuid);
        
        expect(result).toBe(uuid.toLowerCase());
      });
    });

    describe('Text sanitization', () => {
      it('should remove control characters', () => {
        const input = 'Hello\x00\x1f\x7f\x9fWorld';
        const result = sanitize.text(input);
        
        expect(result).toBe('HelloWorld');
      });

      it('should respect max length', () => {
        const longText = 'a'.repeat(2000);
        const result = sanitize.text(longText, 100);
        
        expect(result.length).toBe(100);
      });

      it('should trim whitespace', () => {
        const input = '  Hello World  ';
        const result = sanitize.text(input);
        
        expect(result).toBe('Hello World');
      });
    });

    describe('Number sanitization', () => {
      it('should parse valid numbers', () => {
        expect(sanitize.number('123')).toBe(123);
        expect(sanitize.number('123.45')).toBe(123.45);
        expect(sanitize.number(456)).toBe(456);
      });

      it('should return null for invalid numbers', () => {
        expect(sanitize.number('not-a-number')).toBeNull();
        expect(sanitize.number('')).toBeNull();
        expect(sanitize.number(null)).toBeNull();
      });
    });

    describe('Boolean sanitization', () => {
      it('should handle boolean values', () => {
        expect(sanitize.boolean(true)).toBe(true);
        expect(sanitize.boolean(false)).toBe(false);
      });

      it('should parse string values', () => {
        expect(sanitize.boolean('true')).toBe(true);
        expect(sanitize.boolean('TRUE')).toBe(true);
        expect(sanitize.boolean('false')).toBe(false);
        expect(sanitize.boolean('anything-else')).toBe(true);
      });

      it('should handle other types', () => {
        expect(sanitize.boolean(1)).toBe(true);
        expect(sanitize.boolean(0)).toBe(false);
        expect(sanitize.boolean(null)).toBe(false);
      });
    });
  });

  describe('Input Validation', () => {
    describe('Email validation', () => {
      it('should validate correct email formats', () => {
        expect(validate.email('test@example.com')).toBe(true);
        expect(validate.email('user.name+tag@domain.co.uk')).toBe(true);
      });

      it('should reject invalid email formats', () => {
        expect(validate.email('invalid-email')).toBe(false);
        expect(validate.email('@domain.com')).toBe(false);
        expect(validate.email('user@')).toBe(false);
      });
    });

    describe('UUID validation', () => {
      it('should validate correct UUID format', () => {
        const uuid = '123e4567-e89b-12d3-a456-426614174000';
        expect(validate.uuid(uuid)).toBe(true);
      });

      it('should reject invalid UUID format', () => {
        expect(validate.uuid('not-a-uuid')).toBe(false);
        expect(validate.uuid('123e4567-e89b-12d3-a456')).toBe(false);
      });
    });

    describe('API key validation', () => {
      it('should validate correct API key format', () => {
        expect(validate.apiKey('ak_1234567890abcdef')).toBe(true);
        expect(validate.apiKey('very-long-api-key-with-valid-characters')).toBe(true);
      });

      it('should reject invalid API key format', () => {
        expect(validate.apiKey('short')).toBe(false);
        expect(validate.apiKey('invalid!@#$%')).toBe(false);
      });
    });

    describe('File extension validation', () => {
      it('should validate allowed extensions', () => {
        const allowed = ['jpg', 'png', 'pdf'];
        
        expect(validate.fileExtension('image.jpg', allowed)).toBe(true);
        expect(validate.fileExtension('document.PDF', allowed)).toBe(true);
      });

      it('should reject disallowed extensions', () => {
        const allowed = ['jpg', 'png'];
        
        expect(validate.fileExtension('script.exe', allowed)).toBe(false);
        expect(validate.fileExtension('file.txt', allowed)).toBe(false);
      });
    });

    describe('Content type validation', () => {
      it('should validate allowed content types', () => {
        const allowed = ['image/jpeg', 'application/pdf'];
        
        expect(validate.contentType('image/jpeg', allowed)).toBe(true);
        expect(validate.contentType('application/pdf', allowed)).toBe(true);
      });

      it('should reject disallowed content types', () => {
        const allowed = ['image/jpeg'];
        
        expect(validate.contentType('text/html', allowed)).toBe(false);
        expect(validate.contentType('application/javascript', allowed)).toBe(false);
      });
    });

    describe('IP address validation', () => {
      it('should validate IPv4 addresses', () => {
        expect(validate.ipAddress('192.168.1.1')).toBe(true);
        expect(validate.ipAddress('127.0.0.1')).toBe(true);
        expect(validate.ipAddress('255.255.255.255')).toBe(true);
      });

      it('should validate IPv6 addresses', () => {
        expect(validate.ipAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      });

      it('should reject invalid IP addresses', () => {
        expect(validate.ipAddress('256.256.256.256')).toBe(false);
        expect(validate.ipAddress('not-an-ip')).toBe(false);
      });
    });
  });

  describe('Token Generation', () => {
    describe('API key generation', () => {
      it('should generate unique API keys', () => {
        const key1 = generateToken.apiKey();
        const key2 = generateToken.apiKey();
        
        expect(key1).not.toBe(key2);
        expect(key1).toMatch(/^ak_/);
        expect(key2).toMatch(/^ak_/);
      });

      it('should use custom prefix', () => {
        const key = generateToken.apiKey('test');
        expect(key).toMatch(/^test_/);
      });
    });

    describe('Request ID generation', () => {
      it('should generate valid UUIDs', () => {
        const requestId = generateToken.requestId();
        expect(validate.uuid(requestId)).toBe(true);
      });

      it('should generate unique request IDs', () => {
        const id1 = generateToken.requestId();
        const id2 = generateToken.requestId();
        
        expect(id1).not.toBe(id2);
      });
    });

    describe('Session token generation', () => {
      it('should generate hex tokens', () => {
        const token = generateToken.session();
        expect(token).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should generate unique session tokens', () => {
        const token1 = generateToken.session();
        const token2 = generateToken.session();
        
        expect(token1).not.toBe(token2);
      });
    });
  });

  describe('Security Headers', () => {
    it('should provide security headers', () => {
      const headers = securityHeaders.getHeaders();
      
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
      expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    });

    it('should sanitize request headers', () => {
      const headers = {
        'authorization': 'Bearer secret-token',
        'x-api-key': 'secret-key',
        'user-agent': 'Mozilla/5.0',
        'content-type': 'application/json'
      };

      const sanitized = securityHeaders.sanitizeRequestHeaders(headers);

      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
      expect(sanitized['user-agent']).toBe('Mozilla/5.0');
      expect(sanitized['content-type']).toBe('application/json');
    });
  });

  describe('Rate Limit Utilities', () => {
    describe('calculateRetryAfter', () => {
      it('should calculate retry time from reset time', () => {
        const resetTime = new Date(Date.now() + 60000); // 1 minute from now
        const retryAfter = rateLimitUtils.calculateRetryAfter(3600000, resetTime);
        
        expect(retryAfter).toBeGreaterThan(50);
        expect(retryAfter).toBeLessThanOrEqual(60);
      });

      it('should use window time when no reset time provided', () => {
        const windowMs = 3600000; // 1 hour
        const retryAfter = rateLimitUtils.calculateRetryAfter(windowMs);
        
        expect(retryAfter).toBe(3600);
      });
    });

    describe('shouldBypassRateLimit', () => {
      it('should bypass for localhost', () => {
        expect(rateLimitUtils.shouldBypassRateLimit('127.0.0.1')).toBe(true);
        expect(rateLimitUtils.shouldBypassRateLimit('::1')).toBe(true);
      });

      it('should not bypass for regular IPs', () => {
        expect(rateLimitUtils.shouldBypassRateLimit('192.168.1.100')).toBe(false);
        expect(rateLimitUtils.shouldBypassRateLimit('8.8.8.8')).toBe(false);
      });
    });
  });
});