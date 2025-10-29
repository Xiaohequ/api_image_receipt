# Rate Limiting and Security Configuration

This document describes the rate limiting and security features implemented in the Receipt Analyzer API.

## Rate Limiting

### Overview

The API implements comprehensive rate limiting to prevent abuse and ensure fair usage across all clients.

### Configuration

Rate limiting is configured through environment variables:

```bash
# Rate limit window (default: 1 hour)
RATE_LIMIT_WINDOW_MS=3600000

# Maximum requests per window (default: 100)
RATE_LIMIT_MAX_REQUESTS=100

# Whitelisted IPs (bypass rate limiting)
RATE_LIMIT_WHITELIST=127.0.0.1,::1
```

### Rate Limit Tiers

1. **General API Endpoints**: 100 requests per hour per client
2. **Analysis Endpoint**: 20 requests per hour per client (stricter limit)
3. **Health Check**: 60 requests per minute (more permissive)

### Rate Limiting Strategy

- **Client-based**: Authenticated requests are rate-limited by client ID
- **IP-based**: Unauthenticated requests are rate-limited by IP address
- **Redis-backed**: Uses Redis for distributed rate limiting across multiple instances
- **Graceful degradation**: Fails open if cache is unavailable

### Rate Limit Headers

All responses include rate limit information:

```
RateLimit-Limit: 100
RateLimit-Remaining: 75
RateLimit-Reset: 1640995200
```

### Rate Limit Exceeded Response

When rate limit is exceeded, the API returns:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Limite de requêtes dépassée. Maximum 100 requêtes par heure autorisées.",
    "limit": 100,
    "windowMs": 3600000,
    "resetTime": "2023-12-31T23:59:59.999Z",
    "clientId": "client-123",
    "retryAfter": 3600
  },
  "timestamp": "2023-12-31T12:00:00.000Z"
}
```

### Admin Functions

Administrators can reset rate limits for specific clients:

```typescript
import { resetRateLimit } from '../middleware/rateLimiter';

// Reset rate limit for a specific client
await resetRateLimit('client-id');
```

## Input Validation and Sanitization

### Overview

All user inputs are validated and sanitized to prevent security vulnerabilities.

### Sanitization Features

1. **HTML Tag Removal**: Strips all HTML tags from text inputs
2. **XSS Prevention**: Removes dangerous characters and scripts
3. **SQL Injection Prevention**: Validates against SQL injection patterns
4. **Path Traversal Prevention**: Sanitizes file names and paths
5. **Control Character Removal**: Strips control characters from text

### Validation Schemas

The API uses Joi schemas for comprehensive validation:

```typescript
// Example: Receipt analysis request validation
const analyzeRequest = Joi.object({
  clientId: Joi.string().uuid().optional(),
  metadata: Joi.object({
    source: Joi.string()
      .max(50)
      .pattern(/^[a-zA-Z0-9_\-\s]+$/)
      .optional(),
    expectedType: Joi.string()
      .valid('retail', 'card_payment', 'cash_register')
      .optional()
  }).optional()
}).options({ allowUnknown: false });
```

### Custom Validators

Additional security validators are available:

```typescript
import { customValidators } from '../middleware/validation';

// Check for SQL injection patterns
customValidators.noSqlInjection(userInput);

// Check for XSS patterns
customValidators.noXss(userInput);

// Validate file extensions
customValidators.allowedFileExtension(filename, ['jpg', 'png', 'pdf']);
```

## Data Encryption

### Overview

Sensitive data is encrypted using AES-256-GCM encryption.

### Usage

```typescript
import { encrypt, decrypt } from '../utils/security';

// Encrypt sensitive data
const encrypted = encrypt('sensitive information');

// Decrypt data
const decrypted = decrypt(encrypted);
```

### Hashing

One-way hashing for passwords and sensitive data:

```typescript
import { hash, verifyHash } from '../utils/security';

// Hash data with salt
const hashed = hash('password123');

// Verify hashed data
const isValid = verifyHash('password123', hashed);
```

## Security Headers

### Implemented Headers

The API automatically adds security headers to all responses:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
```

### Header Sanitization

Sensitive headers are automatically sanitized in logs:

```typescript
import { securityHeaders } from '../utils/security';

// Sanitize request headers for logging
const sanitized = securityHeaders.sanitizeRequestHeaders(req.headers);
```

## API Key Security

### Format Validation

API keys must follow a specific format:
- Minimum 16 characters
- Alphanumeric characters, underscores, and hyphens only
- Pattern: `^[a-zA-Z0-9_-]{16,}$`

### Generation

Secure API key generation:

```typescript
import { generateToken } from '../utils/security';

// Generate API key with prefix
const apiKey = generateToken.apiKey('ak'); // Returns: ak_timestamp_random
```

## Testing Rate Limiting

### Test Script

Run the rate limiting test script:

```bash
npx ts-node src/scripts/test-rate-limiting.ts
```

### Manual Testing

Test rate limiting manually:

```bash
# Test normal usage (should succeed)
for i in {1..50}; do
  curl -H "X-API-Key: your-key" http://localhost:3000/health
done

# Test exceeding limit (should fail after 100 requests)
for i in {1..120}; do
  curl -H "X-API-Key: your-key" http://localhost:3000/health
done
```

## Configuration Best Practices

### Production Settings

For production environments:

```bash
# Use strong JWT secret
JWT_SECRET=your-very-long-and-random-secret-key-here

# Restrict CORS origins
CORS_ORIGIN=https://yourdomain.com

# Disable sensitive data logging
LOG_SENSITIVE_DATA=false

# Use appropriate rate limits
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=3600000
```

### Development Settings

For development environments:

```bash
# More permissive rate limits
RATE_LIMIT_MAX_REQUESTS=1000

# Allow localhost origins
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Enable detailed logging
LOG_LEVEL=debug
```

## Monitoring and Alerting

### Rate Limit Monitoring

Monitor rate limiting effectiveness:

1. **Rate limit hit rate**: Percentage of requests that hit rate limits
2. **Client distribution**: Which clients are hitting limits most often
3. **Endpoint analysis**: Which endpoints are most rate-limited

### Security Event Logging

Security events are automatically logged:

```json
{
  "level": "warn",
  "message": "Rate limit exceeded",
  "clientId": "client-123",
  "ip": "192.168.1.100",
  "path": "/api/v1/receipts/analyze",
  "method": "POST",
  "limit": 100,
  "resetTime": "2023-12-31T23:59:59.999Z",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2023-12-31T12:00:00.000Z"
}
```

## Troubleshooting

### Common Issues

1. **Rate limits too strict**: Adjust `RATE_LIMIT_MAX_REQUESTS`
2. **Cache connection issues**: Check Redis connectivity
3. **False positives in validation**: Review validation schemas
4. **Performance impact**: Monitor sanitization overhead

### Debug Mode

Enable debug logging for troubleshooting:

```bash
LOG_LEVEL=debug
```

### Health Checks

The `/health` endpoint includes rate limiting status:

```json
{
  "status": "healthy",
  "services": {
    "rateLimit": "up",
    "cache": "up"
  },
  "rateLimiting": {
    "enabled": true,
    "maxRequests": 100,
    "windowMs": 3600000
  }
}
```

## Security Considerations

### Rate Limiting Bypass

- Localhost IPs are whitelisted by default
- Admin endpoints may have different limits
- Health checks have more permissive limits

### Data Protection

- All sensitive data is encrypted at rest
- API keys are hashed in logs
- Request/response data is sanitized

### Attack Mitigation

- DDoS protection through rate limiting
- XSS prevention through input sanitization
- SQL injection prevention through validation
- Path traversal prevention in file uploads

## Compliance

This implementation helps meet various compliance requirements:

- **GDPR**: Data encryption and sanitization
- **OWASP**: Security headers and input validation
- **PCI DSS**: Secure data handling practices
- **SOC 2**: Logging and monitoring capabilities