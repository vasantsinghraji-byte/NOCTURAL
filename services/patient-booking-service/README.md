# Patient Booking Service

Microservice responsible for managing patient bookings, appointments, and healthcare service requests in the Nocturnal platform.

## Overview

This service handles:
- Patient registration and management
- Booking creation and management
- Service catalog (physiotherapy, nursing, etc.)
- Booking status tracking
- Integration with notification and payment services

## Architecture

### Technology Stack
- **Runtime**: Node.js 22+
- **Framework**: Express 5
- **Database**: MongoDB (dedicated database)
- **Cache**: Redis
- **Message Queue**: RabbitMQ
- **Shared Library**: @nocturnal/shared

### Design Patterns
- **Repository Pattern**: Data access abstraction
- **Service Layer**: Business logic separation
- **Event-Driven**: RabbitMQ for async communication
- **Circuit Breaker**: Resilient inter-service calls

## Project Structure

```
patient-booking-service/
├── src/
│   ├── api/
│   │   ├── routes/           # Express route definitions
│   │   ├── controllers/      # Request handlers
│   │   └── middleware/       # Service-specific middleware
│   ├── models/               # Mongoose models
│   │   ├── patient.js
│   │   ├── nurseBooking.js
│   │   └── serviceCatalog.js
│   ├── services/             # Business logic
│   ├── events/               # Event handling
│   │   ├── publishers/       # Publish events to RabbitMQ
│   │   └── subscribers/      # Subscribe to events
│   ├── config/               # Configuration
│   ├── utils/                # Utilities
│   └── server.js             # Entry point
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── e2e/                  # End-to-end tests
├── k8s/                      # Kubernetes manifests
└── package.json
```

## Getting Started

### Prerequisites
- Node.js 22+
- MongoDB 7+
- Redis 7+
- RabbitMQ 3+

### Installation

1. **Install dependencies**:
```bash
cd services/patient-booking-service
npm install
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start infrastructure** (if using Docker Compose from root):
```bash
cd ../..
docker-compose up -d mongodb redis rabbitmq
```

4. **Run the service**:
```bash
npm run dev  # Development with nodemon
npm start    # Production
```

### Development Workflow

1. **Run in development mode**:
```bash
npm run dev
```

2. **Run tests**:
```bash
npm test              # All tests with coverage
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests
npm run test:watch    # Watch mode
```

3. **Linting**:
```bash
npm run lint          # Check code style
npm run lint:fix      # Auto-fix issues
```

## API Endpoints

### Health Check
```
GET /health
```

### Patient Management
```
POST   /api/patients/register
POST   /api/patients/login
GET    /api/patients/:id
PUT    /api/patients/:id
```

### Booking Management
```
POST   /api/bookings           # Create booking
GET    /api/bookings           # List bookings (paginated)
GET    /api/bookings/:id       # Get booking details
PUT    /api/bookings/:id       # Update booking
DELETE /api/bookings/:id       # Cancel booking
```

### Service Catalog
```
GET    /api/services           # List available services
GET    /api/services/:id       # Service details
```

## Event-Driven Communication

### Published Events

| Event | Exchange | Routing Key | Description |
|-------|----------|-------------|-------------|
| `booking.created` | `booking.events` | `booking.created` | New booking created |
| `booking.cancelled` | `booking.events` | `booking.cancelled` | Booking cancelled |
| `patient.registered` | `patient.events` | `patient.registered` | New patient registered |

### Subscribed Events

| Event | Source Service | Action |
|-------|----------------|--------|
| `payment.completed` | payment-service | Mark booking as paid |
| `notification.sent` | notification-service | Update notification status |

## Database Schema

### Collections

1. **patients**: Patient information
2. **nursebookings**: Booking records
3. **servicecatalogs**: Available services

See [models/](src/models/) directory for detailed schemas.

## Inter-Service Communication

### HTTP Calls (with Circuit Breaker)
- **Notification Service**: Send booking confirmations
- **Payment Service**: Process payments
- **Main API**: Fetch nurse/doctor data

### Event Bus (RabbitMQ)
- Publish booking events
- Subscribe to payment/notification events

## Configuration

Key environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Service port |
| `MONGODB_URI` | Yes | - | MongoDB connection string |
| `REDIS_URL` | Yes | - | Redis connection URL |
| `RABBITMQ_URL` | Yes | - | RabbitMQ connection URL |
| `JWT_SECRET` | Yes | - | JWT signing secret |
| `MAIN_API_URL` | Yes | - | Main API base URL |

See [.env.example](.env.example) for full list.

## Testing

### Unit Tests
```bash
npm run test:unit
```
Tests individual functions and modules in isolation.

### Integration Tests
```bash
npm run test:integration
```
Tests API endpoints and database interactions.

### End-to-End Tests
```bash
npm run test:e2e
```
Tests complete user workflows.

### Coverage Target
- **Overall**: 80%
- **Critical paths**: 100% (booking creation, payment processing)

## Deployment

### Docker
```bash
docker build -t nocturnal/patient-booking-service .
docker run -p 3001:3001 --env-file .env nocturnal/patient-booking-service
```

### Kubernetes
```bash
kubectl apply -f k8s/
```

### Render
Service is deployed as part of the monorepo. See root [render.yaml](../../render.yaml).

## Monitoring

- **Logs**: Winston (file + console)
- **Metrics**: Custom metrics endpoint
- **Error Tracking**: Sentry (if configured)
- **Health Checks**: `/health` endpoint

## Migration from Monolith

This service is being extracted from the main monolith using the Strangler Fig pattern:

**Phase 1** (Current):
1. Create service structure ✓
2. Migrate models
3. Implement API endpoints
4. Add event publishing
5. Deploy alongside monolith

**Phase 2**:
1. Route traffic to new service
2. Deprecate monolith endpoints
3. Remove code from monolith

See [MICROSERVICES_SETUP.md](../../MICROSERVICES_SETUP.md) for details.

## Contributing

1. Create feature branch
2. Write tests
3. Implement feature
4. Ensure tests pass
5. Submit PR

## License

ISC
