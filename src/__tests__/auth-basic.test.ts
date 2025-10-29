// Basic authentication middleware tests
// This file tests the core authentication functionality

import { apiKeyUtils } from '../middleware/auth';

// Simple test runner
const runTests = () => {
  console.log('🧪 Running Authentication Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  const test = (name: string, testFn: () => void) => {
    try {
      testFn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error}`);
      failed++;
    }
  };
  
  const expect = (actual: any) => ({
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toBeNull: () => {
      if (actual !== null) {
        throw new Error(`Expected null, got ${actual}`);
      }
    },
    toBeTruthy: () => {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${actual}`);
      }
    },
    toHaveProperty: (prop: string, value?: any) => {
      if (!(prop in actual)) {
        throw new Error(`Expected object to have property ${prop}`);
      }
      if (value !== undefined && actual[prop] !== value) {
        throw new Error(`Expected ${prop} to be ${value}, got ${actual[prop]}`);
      }
    },
    toMatch: (pattern: RegExp) => {
      if (!pattern.test(actual)) {
        throw new Error(`Expected ${actual} to match ${pattern}`);
      }
    },
    not: {
      toBe: (expected: any) => {
        if (actual === expected) {
          throw new Error(`Expected not to be ${expected}`);
        }
      }
    }
  });

  // Test API Key Generation
  test('should generate valid API keys', () => {
    const apiKey1 = apiKeyUtils.generateApiKey();
    const apiKey2 = apiKeyUtils.generateApiKey('test');
    
    expect(apiKey1).toMatch(/^ak_[a-z0-9]+_[a-z0-9]+$/);
    expect(apiKey2).toMatch(/^test_[a-z0-9]+_[a-z0-9]+$/);
    expect(apiKey1).not.toBe(apiKey2);
  });

  // Test API Key Management
  test('should add and retrieve API keys', () => {
    const testKey = 'test-key-123';
    
    apiKeyUtils.addApiKey({
      key: testKey,
      clientId: 'test-client',
      name: 'Test Client',
      isActive: true,
      permissions: ['analyze']
    });
    
    const keyInfo = apiKeyUtils.getApiKeyInfo(testKey);
    expect(keyInfo).toBeTruthy();
    expect(keyInfo?.clientId).toBe('test-client');
    expect(keyInfo?.name).toBe('Test Client');
    expect(keyInfo?.isActive).toBe(true);
    
    // Cleanup
    apiKeyUtils.removeApiKey(testKey);
  });

  test('should remove API keys', () => {
    const testKey = 'test-key-remove';
    
    apiKeyUtils.addApiKey({
      key: testKey,
      clientId: 'remove-client',
      name: 'Remove Client',
      isActive: true,
      permissions: ['test']
    });
    
    const removed = apiKeyUtils.removeApiKey(testKey);
    expect(removed).toBe(true);
    
    const keyInfo = apiKeyUtils.getApiKeyInfo(testKey);
    expect(keyInfo).toBeNull();
  });

  test('should deactivate API keys', () => {
    const testKey = 'test-key-deactivate';
    
    apiKeyUtils.addApiKey({
      key: testKey,
      clientId: 'deactivate-client',
      name: 'Deactivate Client',
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

  test('should list API keys without exposing actual keys', () => {
    const testKey1 = 'test-list-key-1';
    const testKey2 = 'test-list-key-2';
    
    apiKeyUtils.addApiKey({
      key: testKey1,
      clientId: 'list-client-1',
      name: 'List Client 1',
      isActive: true,
      permissions: ['test']
    });
    
    apiKeyUtils.addApiKey({
      key: testKey2,
      clientId: 'list-client-2',
      name: 'List Client 2',
      isActive: false,
      permissions: ['test']
    });
    
    const keys = apiKeyUtils.listApiKeys();
    
    expect(keys.length >= 2).toBe(true); // At least our test keys
    
    // Find our test keys in the list
    const key1Info = keys.find(k => k.clientId === 'list-client-1');
    const key2Info = keys.find(k => k.clientId === 'list-client-2');
    
    expect(key1Info).toBeTruthy();
    expect(key2Info).toBeTruthy();
    
    // Ensure no actual keys are exposed
    keys.forEach(keyInfo => {
      if (keyInfo.hasOwnProperty('key')) {
        throw new Error('API key list should not expose actual keys');
      }
      expect(keyInfo).toHaveProperty('clientId');
      expect(keyInfo).toHaveProperty('name');
      expect(keyInfo).toHaveProperty('isActive');
    });
    
    // Cleanup
    apiKeyUtils.removeApiKey(testKey1);
    apiKeyUtils.removeApiKey(testKey2);
  });

  // Summary
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('❌ Some tests failed');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
  }
};

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

export { runTests };