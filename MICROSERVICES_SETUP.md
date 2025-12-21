# Microservices Migration Setup Guide

## Phase 0: Infrastructure Setup (Completed ✓)

### What Has Been Done

#### 1. Shared Library Package (@nocturnal/shared)
Created a shared library package containing:
- **Middleware**:
  - `auth.middleware.js` - JWT authentication and service-to-service auth
  - `security.middleware.js` - Security headers, CORS, suspicious request detection
  - `rateLimiter.middleware.js` - Rate limiting with Redis support
  - `errorHandler.middleware.js` - Centralized error handling

- **Utilities**:
  - `logger.js` - Winston logger factory with Loki integration
  - `monitoring.js` - Error tracking and Sentry integration
  - `sanitization.js` - NoSQL injection prevention

- **Constants**:
  - `roles.js` - Centralized role definitions and permissions

**Location**: `packages/shared/`

#### 2. Mono-repo Structure
- Converted root `package.json` to support npm workspaces
- Created `packages/` directory for shared libraries
- Created `services/` directory for future microservices
- Updated package scripts to support workspace operations

#### 3. Development Infrastructure
- Created `docker-compose.yml` with:
  - MongoDB 7.0 (port 27017)
  - Redis 7 (port 6379)
  - RabbitMQ 3 with management UI (ports 5672, 15672)
- Created `.env.example` with all required environment variables

### Next Steps

#### Start Local Infrastructure

1. **Start Docker Desktop** (required for Docker Compose)

2. **Start infrastructure services**:
   ```bash
   docker-compose up -d
   ```

3. **Verify services are running**:
   ```bash
   docker-compose ps
   ```

4. **Access service UIs**:
   - RabbitMQ Management: http://localhost:15672 (admin/admin123)
   - MongoDB: mongodb://admin:admin123@localhost:27017

5. **View logs**:
   ```bash
   docker-compose logs -f
   ```

6. **Stop services**:
   ```bash
   docker-compose down
   ```

#### Install Dependencies

```bash
# Install all workspace dependencies
npm run install:all

# Or install root dependencies
npm install

# Install shared package dependencies
npm run install:shared
```

## Phase 1: Patient Booking Service (Next)

### Week 1: Create Service Structure
```
services/patient-booking-service/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   ├── controllers/
│   │   └── middleware/
│   ├── models/
│   ├── services/
│   ├── events/
│   └── config/
├── tests/
├── k8s/
├── Dockerfile
└── package.json
```

### Week 2: Migrate Models
- Patient model
- NurseBooking model
- ServiceCatalog model
- Setup separate MongoDB database: `nocturnal-patient-booking`

### Week 3: Event-Driven Communication
- Setup RabbitMQ event publishers
- Implement event subscribers
- Add circuit breakers for HTTP calls

### Week 4: Testing & Deployment
- Unit tests (80% coverage)
- Integration tests
- Contract tests
- Deploy to staging with API Gateway routing

## Using the Shared Library

### Example: Patient Booking Service

```javascript
// services/patient-booking-service/src/app.js
const express = require('express');
const {
  createLogger,
  createMonitoring,
  createRateLimiterFactory,
  securityHeaders,
  corsConfig,
  sanitizationMiddleware,
  errorHandler
} = require('@nocturnal/shared');

const app = express();

// Initialize utilities
const logger = createLogger({ serviceName: 'patient-booking-service' });
const monitoring = createMonitoring({
  serviceName: 'patient-booking-service',
  sentryDsn: process.env.SENTRY_DSN
});
const rateLimiters = createRateLimiterFactory(process.env.REDIS_URL);

// Apply middleware
app.use(helmet(securityHeaders()));
app.use(cors(corsConfig()));
app.use(express.json());
app.use(sanitizationMiddleware());
app.use(rateLimiters.global);

// Routes
app.use('/api/v1/patients', require('./api/routes/patient.routes'));
app.use('/api/v1/bookings', require('./api/routes/booking.routes'));

// Error handling
app.use(errorHandler);

module.exports = app;
```

### Example: Service-to-Service Communication

```javascript
const {
  generateServiceToken,
  verifyServiceToken
} = require('@nocturnal/shared');
const axios = require('axios');

// In patient-booking-service: Call staffing service
const serviceToken = generateServiceToken('patient-booking-service');
const response = await axios.get(
  `${process.env.STAFFING_SERVICE_URL}/api/v1/providers/${providerId}`,
  {
    headers: { 'X-Service-Token': serviceToken },
    timeout: 2000
  }
);

// In staffing-service: Verify service token
const { verifyServiceToken } = require('@nocturnal/shared');
router.use('/internal', verifyServiceToken); // Protect internal endpoints
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway (NGINX)                     │
│                    http://localhost:5000                     │
└─────────────────┬───────────────────────────┬────────────────┘
                  │                           │
      ┌───────────▼──────────┐    ┌──────────▼───────────┐
      │  Patient Booking     │    │   Monolith (Legacy)  │
      │  Service :5001       │    │   (B2B Staffing)     │
      └───────────┬──────────┘    └──────────┬───────────┘
                  │                           │
                  │   ┌───────────────────────┴────┐
                  │   │                            │
      ┌───────────▼───▼─────┐          ┌──────────▼─────────┐
      │  RabbitMQ Event Bus │          │  Redis (Caching)   │
      └─────────────────────┘          └────────────────────┘
                  │
      ┌───────────┴──────────────────────────┐
      │                                      │
┌─────▼─────────────┐              ┌────────▼──────────┐
│  MongoDB          │              │  MongoDB          │
│  patient-booking  │              │  nocturnal        │
└───────────────────┘              └───────────────────┘
```

## Environment Variables

Copy `.env.example` to `.env` and update with your values:

```bash
cp .env.example .env
```

Required variables:
- `MONGO_URI` - MongoDB connection string
- `REDIS_URL` - Redis connection string
- `RABBITMQ_URL` - RabbitMQ connection string
- `JWT_SECRET` - JWT signing secret
- `SERVICE_SECRET` - Service-to-service token secret

## Testing Infrastructure

```bash
# Test MongoDB connection
docker exec -it nocturnal-mongodb mongosh -u admin -p admin123

# Test Redis connection
docker exec -it nocturnal-redis redis-cli -a redis123 ping

# Test RabbitMQ
curl -u admin:admin123 http://localhost:15672/api/overview
```

## Troubleshooting

### Docker Compose Issues
- Ensure Docker Desktop is running
- Check port conflicts: `netstat -ano | findstr "27017 6379 5672"`
- View logs: `docker-compose logs <service-name>`

### Workspace Issues
- Clear npm cache: `npm cache clean --force`
- Remove node_modules: `rm -rf node_modules packages/*/node_modules`
- Reinstall: `npm run install:all`

### Shared Package Issues
- Link package locally: `cd packages/shared && npm link`
- Use in service: `cd services/my-service && npm link @nocturnal/shared`

## Resources

- [Microservices Migration Plan](C:\Users\wgshx\.claude\plans\generic-purring-aho.md)
- [Shared Package README](packages/shared/README.md)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [RabbitMQ Tutorials](https://www.rabbitmq.com/getstarted.html)
