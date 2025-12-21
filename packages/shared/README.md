# @nocturnal/shared

Shared middleware, utilities, and constants for Nocturnal microservices.

## Installation

```bash
npm install @nocturnal/shared
```

## Usage

### Authentication Middleware

```javascript
const { createProtectMiddleware, authorize, generateToken } = require('@nocturnal/shared');

// Create protect middleware with your User repository
const User = require('./models/User');
const protect = createProtectMiddleware(async (id) => {
  return await User.findById(id).select('-password');
});

// Use in routes
router.get('/profile', protect, authorize('doctor', 'nurse'), getProfile);

// Generate JWT token
const token = generateToken(user._id);
```

### Service-to-Service Authentication

```javascript
const { verifyServiceToken, generateServiceToken } = require('@nocturnal/shared');

// Generate service token
const serviceToken = generateServiceToken('patient-booking-service');

// Make inter-service request
const response = await axios.get('http://staffing-service/api/providers/123', {
  headers: { 'X-Service-Token': serviceToken }
});

// Verify service token in receiving service
router.use('/internal', verifyServiceToken);
```

### Security Middleware

```javascript
const { securityHeaders, corsConfig, detectSuspiciousRequests } = require('@nocturnal/shared');
const helmet = require('helmet');
const cors = require('cors');

// Apply security headers
app.use(helmet(securityHeaders()));

// Configure CORS
app.use(cors(corsConfig()));

// Detect suspicious requests
app.use(detectSuspiciousRequests);
```

### Rate Limiting

```javascript
const { createRateLimiterFactory, createDDoSProtection } = require('@nocturnal/shared');

// Create rate limiters
const rateLimiters = createRateLimiterFactory(process.env.REDIS_URL);

// Apply rate limiters
app.use(rateLimiters.global);
app.use('/api/auth/login', rateLimiters.auth);
app.use('/api/payments', rateLimiters.payment);

// DDoS protection
app.use(createDDoSProtection());
```

### Logger

```javascript
const { createLogger } = require('@nocturnal/shared');

const logger = createLogger({
  serviceName: 'patient-booking-service',
  logsDir: './logs'
});

logger.info('Service started');
logger.error('Error occurred', { error: err.message });
logger.logAuth('login', 'user@example.com', true);
logger.logSecurity('unauthorized_access', { userId: '123' });
```

### Monitoring

```javascript
const { createMonitoring } = require('@nocturnal/shared');

const monitoring = createMonitoring({
  serviceName: 'patient-booking-service',
  sentryDsn: process.env.SENTRY_DSN
});

// Track errors
try {
  // ... code
} catch (error) {
  monitoring.trackError('database', error, { operation: 'findUser' });
}

// Track events
monitoring.trackEvent('booking_created', { bookingId: '123' });

// Get statistics
const stats = monitoring.getStats();
```

### Sanitization

```javascript
const { sanitizationMiddleware, sanitizeData } = require('@nocturnal/shared');

// Apply as middleware
app.use(sanitizationMiddleware());

// Manual sanitization
const cleanData = sanitizeData(userInput);
```

### Error Handler

```javascript
const { errorHandler } = require('@nocturnal/shared');

// Apply at the end of middleware chain
app.use(errorHandler);
```

### Role Constants

```javascript
const { ROLES, hasPermission, isValidRole } = require('@nocturnal/shared');

// Use role constants
if (user.role === ROLES.DOCTOR) {
  // ...
}

// Check permissions
if (hasPermission(user.role, 'view_shifts')) {
  // ...
}

// Validate role
if (isValidRole(req.body.role)) {
  // ...
}
```

## Environment Variables

- `JWT_SECRET` - Secret for JWT signing
- `JWT_EXPIRE` - JWT expiration time (default: 7d)
- `SERVICE_SECRET` - Secret for service-to-service tokens
- `REDIS_URL` - Redis connection URL for rate limiting
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
- `LOG_LEVEL` - Logging level (info, debug, error)
- `SENTRY_DSN` - Sentry DSN for error tracking
- `ENABLE_LOKI` - Enable Loki logging transport
- `LOKI_HOST` - Loki server URL

## License

ISC
