// Authentication Middleware Example
// This demonstrates the API key authentication functionality

import { apiKeyUtils } from '../middleware/auth';

console.log('🔐 API Key Authentication Example\n');

// 1. Generate API keys
console.log('1. Generating API keys...');
const apiKey1 = apiKeyUtils.generateApiKey('client');
const apiKey2 = apiKeyUtils.generateApiKey('admin');
console.log(`   Generated client key: ${apiKey1}`);
console.log(`   Generated admin key: ${apiKey2}\n`);

// 2. Add API keys to the system
console.log('2. Adding API keys to system...');
apiKeyUtils.addApiKey({
  key: apiKey1,
  clientId: 'client-001',
  name: 'Demo Client',
  isActive: true,
  permissions: ['analyze', 'status', 'result']
});

apiKeyUtils.addApiKey({
  key: apiKey2,
  clientId: 'admin-001',
  name: 'Demo Admin',
  isActive: true,
  permissions: ['analyze', 'status', 'result', 'admin', 'stats']
});
console.log('   ✅ API keys added successfully\n');

// 3. Retrieve API key information
console.log('3. Retrieving API key information...');
const clientInfo = apiKeyUtils.getApiKeyInfo(apiKey1);
const adminInfo = apiKeyUtils.getApiKeyInfo(apiKey2);

console.log('   Client Info:', {
  clientId: clientInfo?.clientId,
  name: clientInfo?.name,
  permissions: clientInfo?.permissions,
  isActive: clientInfo?.isActive
});

console.log('   Admin Info:', {
  clientId: adminInfo?.clientId,
  name: adminInfo?.name,
  permissions: adminInfo?.permissions,
  isActive: adminInfo?.isActive
});
console.log();

// 4. List all API keys (without exposing actual keys)
console.log('4. Listing all API keys...');
const allKeys = apiKeyUtils.listApiKeys();
console.log(`   Total API keys: ${allKeys.length}`);
allKeys.forEach((keyInfo, index) => {
  console.log(`   ${index + 1}. ${keyInfo.name} (${keyInfo.clientId}) - Active: ${keyInfo.isActive}`);
});
console.log();

// 5. Deactivate an API key
console.log('5. Deactivating client API key...');
const deactivated = apiKeyUtils.deactivateApiKey(apiKey1);
console.log(`   Deactivation result: ${deactivated ? 'Success' : 'Failed'}`);

const updatedClientInfo = apiKeyUtils.getApiKeyInfo(apiKey1);
console.log(`   Client is now active: ${updatedClientInfo?.isActive}\n`);

// 6. Remove API keys
console.log('6. Cleaning up API keys...');
const removed1 = apiKeyUtils.removeApiKey(apiKey1);
const removed2 = apiKeyUtils.removeApiKey(apiKey2);
console.log(`   Removed client key: ${removed1 ? 'Success' : 'Failed'}`);
console.log(`   Removed admin key: ${removed2 ? 'Success' : 'Failed'}\n`);

// 7. Verify removal
console.log('7. Verifying removal...');
const removedClientInfo = apiKeyUtils.getApiKeyInfo(apiKey1);
const removedAdminInfo = apiKeyUtils.getApiKeyInfo(apiKey2);
console.log(`   Client key exists: ${removedClientInfo !== null ? 'Yes' : 'No'}`);
console.log(`   Admin key exists: ${removedAdminInfo !== null ? 'Yes' : 'No'}\n`);

console.log('✅ Authentication example completed successfully!');

// Example of how the middleware would work in practice
console.log('\n📋 Middleware Usage Example:');
console.log('   1. Client sends request with header: x-api-key: client_abc123_def456');
console.log('   2. authenticateApiKey middleware validates the key');
console.log('   3. If valid, req.clientId and req.apiKey are set');
console.log('   4. requirePermission("analyze") checks if client has analyze permission');
console.log('   5. If authorized, request proceeds to route handler');
console.log('   6. If not authorized, AuthenticationError is thrown');

console.log('\n🔒 Security Features:');
console.log('   ✓ API keys are validated against stored keys');
console.log('   ✓ Inactive keys are rejected');
console.log('   ✓ Permission-based access control');
console.log('   ✓ Admin-only endpoints protection');
console.log('   ✓ Optional authentication for public endpoints');
console.log('   ✓ Detailed error messages in French');
console.log('   ✓ Security event logging');
console.log('   ✓ Multiple authentication methods (header, bearer, query)');