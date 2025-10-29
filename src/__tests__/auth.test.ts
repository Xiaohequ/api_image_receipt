import { 
  authenticateApiKey, 
  requirePermission, 
  optionalAuth, 
  requireAdmin, 
  apiKeyUtils 
} from '../middleware/auth';
import { ErrorCode, AuthenticationError } from '../types/errors';

// Mock Jest functions for testing
const mockFn = () => {
  const calls: any[][] = [];
  const fn = (...args: any[]) => {
    calls.push(args);
  };
  fn.mock = { calls };
  fn.toHaveBeenCalledWith = (expected: any) => {
    return calls.some(call => call.length === 1 && call[0] === expected);
  };
  fn.toHaveBeenCalled = () => calls.length > 0;
  return fn;
};

// Mock request and response objects for testing
const createMockRequest = (headers: Record<string, string> = {}, query: Record<string, string> = {}): any => ({
  headers,
  query,
  ip: '127.0.0.1',
  path: '/test',
  method: 'GET',
  get: (header: string) => headers[header.toLowerCase()]
});

const createMockResponse = (): any => {
  const res: any = {
    status: mockFn(),
    json: mockFn(),
    locals: {}
  };
  res.status.mockReturnThis = () => res;
  res.json.mockReturnThis = () => res;
  return res;
};

const createMockNext = (): any => mockFn();

describe('Authentication Middleware', () => {
  const validApiKey = 'dev-api-key-12345';
  const invalidApiKey = 'invalid-key-12345';
  
  beforeEach(() => {
    // Add test API keys
    apiKeyUtils.addApiKey({
      key: 'test-key-analyze',
      clientId: 'test-client-1',
      name: 'Test Client 1',
      isActive: true,
      permissions: ['analyze', 'status', 'result']
    });
    
    apiKeyUtils.addApiKey({
      key: 'test-key-admin',
      clientId: 'admin-client',
      name: 'Admin Client',
      isActive: true,
      permissions: ['analyze', 'status', 'result', 'admin']
    });
    
    apiKeyUtils.addApiKey({
      key: 'test-key-inactive',
      clientId: 'inactive-client',
      name: 'Inactive Client',
      isActive: false,
      permissions: ['analyze']
    });
  });
  
  afterEach(() => {
    // Clean up test keys
    apiKeyUtils.removeApiKey('test-key-analyze');
    apiKeyUtils.removeApiKey('test-key-admin');
    apiKeyUtils.removeApiKey('test-key-inactive');
  });

  describe('API Key Authentication', () => {
    it('should authenticate with valid API key in header', () => {
      const req = createMockRequest({ 'x-api-key': validApiKey });
      const res = createMockResponse();
      const next = createMockNext();

      authenticateApiKey(req, res, next);

      expect(req.clientId).toBe('dev-client');
      expect(req.apiKey).toBe(validApiKey);
      expect(next).toHaveBeenCalledWith();
    });

    it('should authenticate with valid API key in Authorization header', () => {
      const req = createMockRequest({ 'authorization': `Bearer ${validApiKey}` });
      const res = createMockResponse();
      const next = createMockNext();

      authenticateApiKey(req, res, next);

      expect(req.clientId).toBe('dev-client');
      expect(req.apiKey).toBe(validApiKey);
      expect(next).toHaveBeenCalledWith();
    });

    it('should authenticate with valid API key in query parameter', () => {
      const req = createMockRequest({}, { api_key: validApiKey });
      const res = createMockResponse();
      const next = createMockNext();

      authenticateApiKey(req, res, next);

      expect(req.clientId).toBe('dev-client');
      expect(req.apiKey).toBe(validApiKey);
      expect(next).toHaveBeenCalledWith();
    });

    it('should reject request without API key', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      authenticateApiKey(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.message).toContain('Clé API manquante');
    });

    it('should reject request with invalid API key', () => {
      const req = createMockRequest({ 'x-api-key': invalidApiKey });
      const res = createMockResponse();
      const next = createMockNext();

      authenticateApiKey(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.message).toContain('Clé API invalide');
    });

    it('should reject request with inactive API key', () => {
      const req = createMockRequest({ 'x-api-key': 'test-key-inactive' });
      const res = createMockResponse();
      const next = createMockNext();

      authenticateApiKey(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.message).toContain('Clé API invalide');
    });
  });

  describe('Permission-based Authorization', () => {
    it('should allow access with correct permissions', () => {
      const req = createMockRequest({ 'x-api-key': 'test-key-analyze' });
      req.clientId = 'test-client-1';
      req.apiKey = 'test-key-analyze';
      
      const res = createMockResponse();
      const next = createMockNext();

      const permissionMiddleware = requirePermission('analyze');
      permissionMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should deny access without required permissions', () => {
      // Create a key without analyze permission
      apiKeyUtils.addApiKey({
        key: 'test-key-no-analyze',
        clientId: 'limited-client',
        name: 'Limited Client',
        isActive: true,
        permissions: ['status', 'result']
      });

      const req = createMockRequest({ 'x-api-key': 'test-key-no-analyze' });
      req.clientId = 'limited-client';
      req.apiKey = 'test-key-no-analyze';
      
      const res = createMockResponse();
      const next = createMockNext();

      const permissionMiddleware = requirePermission('analyze');
      permissionMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.message).toContain('Permissions insuffisantes');

      // Cleanup
      apiKeyUtils.removeApiKey('test-key-no-analyze');
    });
  });

  describe('Admin Authorization', () => {
    it('should allow access to admin endpoints with admin permissions', () => {
      const req = createMockRequest({ 'x-api-key': 'test-key-admin' });
      req.clientId = 'admin-client';
      req.apiKey = 'test-key-admin';
      
      const res = createMockResponse();
      const next = createMockNext();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('should deny access to admin endpoints without admin permissions', () => {
      const req = createMockRequest({ 'x-api-key': 'test-key-analyze' });
      req.clientId = 'test-client-1';
      req.apiKey = 'test-key-analyze';
      
      const res = createMockResponse();
      const next = createMockNext();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.message).toContain('Accès administrateur requis');
    });
  });

  describe('Optional Authentication', () => {
    it('should work with valid API key', () => {
      const req = createMockRequest({ 'x-api-key': validApiKey });
      const res = createMockResponse();
      const next = createMockNext();

      optionalAuth(req, res, next);

      expect(req.clientId).toBe('dev-client');
      expect(req.apiKey).toBe(validApiKey);
      expect(next).toHaveBeenCalledWith();
    });

    it('should work without API key', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      optionalAuth(req, res, next);

      expect(req.clientId).toBeUndefined();
      expect(req.apiKey).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('should work with invalid API key (ignores invalid key)', () => {
      const req = createMockRequest({ 'x-api-key': invalidApiKey });
      const res = createMockResponse();
      const next = createMockNext();

      optionalAuth(req, res, next);

      expect(req.clientId).toBeUndefined();
      expect(req.apiKey).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('API Key Utilities', () => {
    it('should generate valid API keys', () => {
      const apiKey1 = apiKeyUtils.generateApiKey();
      const apiKey2 = apiKeyUtils.generateApiKey('test');
      
      expect(apiKey1).toMatch(/^ak_[a-z0-9]+_[a-z0-9]+$/);
      expect(apiKey2).toMatch(/^test_[a-z0-9]+_[a-z0-9]+$/);
      expect(apiKey1).not.toBe(apiKey2);
    });

    it('should add and remove API keys', () => {
      const testKey = 'test-util-key';
      
      apiKeyUtils.addApiKey({
        key: testKey,
        clientId: 'util-test-client',
        name: 'Utility Test Client',
        isActive: true,
        permissions: ['test']
      });
      
      const keyInfo = apiKeyUtils.getApiKeyInfo(testKey);
      expect(keyInfo).toBeTruthy();
      expect(keyInfo?.clientId).toBe('util-test-client');
      
      const removed = apiKeyUtils.removeApiKey(testKey);
      expect(removed).toBe(true);
      
      const keyInfoAfterRemoval = apiKeyUtils.getApiKeyInfo(testKey);
      expect(keyInfoAfterRemoval).toBeNull();
    });

    it('should deactivate API keys', () => {
      const testKey = 'test-deactivate-key';
      
      apiKeyUtils.addApiKey({
        key: testKey,
        clientId: 'deactivate-test-client',
        name: 'Deactivate Test Client',
        isActive: true,
        permissions: ['test']
      });
      
      const deactivated = apiKeyUtils.deactivateApiKey(testKey);
      expect(deactivated).toBe(true);
      
      const keyInfo = apiKeyUtils.getApiKeyInfo(testKey);
      expect(keyInfo?.isActive).toBe(false);
      
      // Cleanup
      apiKeyUtils.removeApiKey(testKey);
    });

    it('should list API keys without exposing actual keys', () => {
      const keys = apiKeyUtils.listApiKeys();
      
      expect(Array.isArray(keys)).toBe(true);
      keys.forEach(keyInfo => {
        expect(keyInfo).not.toHaveProperty('key');
        expect(keyInfo).toHaveProperty('clientId');
        expect(keyInfo).toHaveProperty('name');
        expect(keyInfo).toHaveProperty('isActive');
      });
    });
  });

  describe('Error Handling', () => {
    it('should create proper authentication errors', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      authenticateApiKey(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(error.message).toContain('Clé API manquante');
      expect(error.details).toHaveProperty('reason', 'missing_api_key');
      expect(error.details).toHaveProperty('headerName', 'x-api-key');
      expect(error.details).toHaveProperty('supportedMethods');
    });
  });
});