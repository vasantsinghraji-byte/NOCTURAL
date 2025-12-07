# Nocturnal - Healthcare Duty Shift Platform

A comprehensive healthcare platform connecting doctors and nurses with hospitals for duty shift management, featuring real-time analytics, intelligent matching, and automated workflows.

## 📚 Documentation

**Looking for detailed documentation?** Visit **[docs/README.md](docs/README.md)** for the complete documentation index.

### Quick Links

- **[🚀 Getting Started](docs/GETTING_STARTED.md)** - Installation, configuration, and first run
- **[🔐 Security Guide](docs/guides/security.md)** - Enterprise-grade security features
- **[⚡ Performance Optimization](docs/guides/performance-optimization.md)** - Speed and efficiency
- **[🚢 Deployment Guide](docs/deployment/README.md)** - PM2, Docker, Kubernetes, AWS
- **[📖 API Documentation](docs/api/endpoints.md)** - Complete API reference
- **[💻 Interactive API Docs](http://localhost:5000/api-docs)** - Swagger UI (when server running)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Features

### For Healthcare Professionals
- **Smart Duty Matching**: AI-powered recommendations based on specialization, experience, and location
- **Real-time Notifications**: Instant alerts for new shifts and application updates
- **Analytics Dashboard**: Track application success rates, earnings, and performance metrics
- **Application Insights**: Understand why applications were rejected and get improvement suggestions
- **Profile Management**: Comprehensive profile with certifications, experience, and ratings

### For Hospitals
- **Intelligent Staffing**: Predictive analytics for staffing needs and budget management
- **Quick Hiring**: Post shifts and receive applications within minutes
- **Budget Tracking**: Real-time spend tracking with alerts and forecasting
- **Performance Analytics**: Track fill rates, time-to-fill, and doctor performance
- **Preferred Doctor Network**: Build and manage a network of trusted healthcare professionals

### Platform Features
- **Secure Authentication**: JWT-based authentication with role-based access control
- **File Upload Management**: Secure document upload with validation and virus scanning
- **Rate Limiting**: Adaptive rate limiting with intelligent abuse detection
- **Caching Layer**: Redis-based caching for optimal performance
- **Real-time Updates**: WebSocket support for instant notifications
- **Audit Logging**: Comprehensive security and activity logging
- **Performance Monitoring**: Built-in metrics and health checks

## Tech Stack

### Backend
- **Runtime**: Node.js 22.x
- **Framework**: Express.js 5.x
- **Database**: MongoDB 8.x with Mongoose ODM
- **Cache**: Redis (optional, graceful degradation)
- **Authentication**: JWT (jsonwebtoken)
- **File Storage**: Local filesystem with Multer
- **Logging**: Winston with daily rotation
- **Documentation**: Swagger/OpenAPI 3.0

### Frontend
- **Core**: Vanilla JavaScript (ES6+)
- **PWA**: Service Workers for offline support
- **Optimization**: Lazy loading, code splitting, asset versioning
- **Build**: Custom build pipeline with minification

### Security
- **Helmet.js**: Security headers
- **Rate Limiting**: express-rate-limit with adaptive thresholds
- **Input Validation**: express-validator
- **Sanitization**: express-mongo-sanitize, xss-clean
- **Encryption**: bcryptjs for password hashing

## Quick Start

### Prerequisites

- **Node.js** v18+ (v22 recommended)
- **MongoDB** v6+ (v8 recommended)
- **Redis** v6+ (optional, recommended)

### Installation

```bash
# 1. Clone repository
git clone https://github.com/yourusername/nocturnal.git
cd nocturnal

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your settings

# 4. Create database indexes
npm run db:indexes

# 5. Start development server
npm run dev
```

Server starts at: `http://localhost:5000`

**Need detailed setup instructions?** See **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)** for complete installation guide with troubleshooting.

---

## Documentation

### Core Documentation

| Guide | Description |
|-------|-------------|
| **[Getting Started](docs/GETTING_STARTED.md)** | Complete setup guide with troubleshooting |
| **[Security](docs/guides/security.md)** | Rate limiting, DDoS protection, secrets management |
| **[Performance](docs/guides/performance-optimization.md)** | Caching, indexing, optimization strategies |
| **[Deployment](docs/deployment/README.md)** | PM2, Docker, Kubernetes deployment options |
| **[API Reference](docs/api/endpoints.md)** | Complete API endpoint documentation |

### Quick Reference

```bash
# Development
npm run dev              # Start with auto-reload
npm test                 # Run test suite
npm run lint             # Check code quality

# Production
npm start                # Start production server
npm run build            # Build frontend
npm run pm2:start:prod   # Start with PM2 cluster

# Database
npm run db:indexes       # Create performance indexes
npm run db:migrate       # Run migrations

# Security
npm run security:scan    # Security vulnerability scan
# Server Configuration
NODE_ENV=development
PORT=5000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/nocturnal_dev
MONGODB_READ_PREFERENCE=primary
MONGODB_WRITE_CONCERN_W=majority
MONGODB_WRITE_CONCERN_TIMEOUT=5000
MONGODB_READ_CONCERN=majority

# Redis Configuration (Optional)
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
WHITELISTED_IPS=127.0.0.1

# File Upload
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@nocturnal.com
FROM_NAME=Nocturnal Platform

# Client URL
CLIENT_URL=http://localhost:3000

# Monitoring
LOG_LEVEL=info
ENABLE_MONITORING=true
```

### 2. Firebase Configuration (Optional)

If using Firebase for notifications:

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Download service account key
3. Save as `firebase-service-account.json` in project root
4. Add to `.env`:
```env
FIREBASE_PROJECT_ID=your-project-id
```

## Running the Application

### Development Mode

#### Start Backend Server
```bash
npm run dev
```
Server runs on http://localhost:5000

#### Start Frontend (Separate Terminal)
```bash
cd client
npm start
# or use live-server
live-server --port=3000
```
Client runs on http://localhost:3000

### Production Mode

#### Build Frontend
```bash
cd client
npm run build:optimize
```

#### Start Production Server
```bash
npm start
```

#### Using PM2 (Recommended for Production)
PM2 provides production-grade process management with auto-restart, clustering, and zero-downtime deployments.

```bash
# Development Mode (1 instance)
npm run pm2:start

# Production Mode (cluster mode, all CPUs)
npm run pm2:start:prod

# Monitor processes
npm run pm2:monit

# View logs
npm run pm2:logs

# Zero-downtime reload (production)
npm run pm2:reload

# Stop
npm run pm2:stop

# See PM2_DEPLOYMENT_GUIDE.md for complete documentation
# See PM2_QUICK_REFERENCE.md for quick commands
```

## API Documentation

### Interactive API Documentation

Once the server is running, access the interactive Swagger UI documentation at:

```
http://localhost:5000/api-docs
```

### Authentication

Most endpoints require a JWT token. Include it in the Authorization header:

```bash
Authorization: Bearer <your-jwt-token>
```

### Example API Calls

#### Register a New User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dr. John Doe",
    "email": "john@example.com",
    "password": "SecurePassword123!",
    "role": "doctor",
    "phone": "+1234567890",
    "specialization": "Cardiology",
    "experience": 5
  }'
```

#### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePassword123!"
  }'
```

#### Get Available Duties (Authenticated)
```bash
curl -X GET "http://localhost:5000/api/duties?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Apply for a Duty
```bash
curl -X POST http://localhost:5000/api/applications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dutyId": "507f1f77bcf86cd799439011",
    "message": "I am interested in this shift"
  }'
```

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Browser    │  │  Mobile PWA  │  │   Desktop    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
│         └─────────────────┴──────────────────┘               │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Load Balancer │
                    │   (Nginx)      │
                    └───────┬────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                   Application Layer                           │
│         ┌─────────────────┴─────────────────┐                │
│         │                                   │                │
│   ┌─────▼─────┐                       ┌────▼────┐           │
│   │  Node.js  │ ◄──────────────────► │ Node.js │           │
│   │  Server 1 │    (Cluster Mode)     │ Server N│           │
│   └─────┬─────┘                       └────┬────┘           │
│         │                                   │                │
└─────────┼───────────────────────────────────┼────────────────┘
          │                                   │
          ├───────────────┬───────────────────┤
          │               │                   │
┌─────────▼─────┐  ┌──────▼──────┐  ┌────────▼────────┐
│  MongoDB      │  │   Redis     │  │  File Storage   │
│  (Primary +   │  │   Cache     │  │   (Local/S3)    │
│   Replicas)   │  │             │  │                 │
└───────────────┘  └─────────────┘  └─────────────────┘
```

### Application Architecture

```
nocturnal/
├── server.js                    # Application entry point
├── config/                      # Configuration files
│   ├── database.js             # MongoDB connection & pooling
│   ├── redis.js                # Redis cache configuration
│   ├── rateLimit.js            # Rate limiting rules
│   ├── swagger.js              # API documentation config
│   └── validateEnv.js          # Environment validation
├── models/                      # Mongoose data models
│   ├── user.js                 # User schema
│   ├── duty.js                 # Duty shift schema
│   ├── application.js          # Job application schema
│   ├── analytics.js            # Analytics schemas
│   └── hospitalSettings.js     # Hospital configuration
├── routes/                      # API route handlers
│   ├── auth.js                 # Authentication routes
│   ├── users.js                # User management
│   ├── duties.js               # Duty management
│   ├── applications.js         # Application handling
│   ├── analytics.js            # Analytics endpoints
│   └── admin/                  # Admin-only routes
│       ├── metrics.js          # System metrics
│       └── monitoring.js       # Health checks
├── middleware/                  # Express middleware
│   ├── auth.js                 # JWT authentication
│   ├── cache.js                # Response caching
│   ├── pagination.js           # Result pagination
│   ├── fieldSelection.js       # Sparse fieldsets
│   ├── upload.js               # File upload handling
│   └── errorHandler.js         # Error handling
├── utils/                       # Utility functions
│   ├── logger.js               # Winston logger
│   ├── monitoring.js           # Performance monitoring
│   └── validation.js           # Input validation
├── client/                      # Frontend application
│   ├── public/                 # Static assets
│   │   ├── js/                # JavaScript files
│   │   ├── css/               # Stylesheets
│   │   └── service-worker.js  # PWA service worker
│   └── build.config.js         # Build configuration
└── logs/                        # Application logs
    ├── combined.log            # All logs
    ├── error.log              # Error logs
    └── security.log           # Security events
```

### Request Flow

```
1. Client Request
   ↓
2. Rate Limiter (Adaptive throttling)
   ↓
3. Authentication (JWT verification)
   ↓
4. Authorization (Role-based access)
   ↓
5. Input Validation (express-validator)
   ↓
6. Cache Check (Redis - if applicable)
   ↓
7. Controller Logic
   ↓
8. Database Query (MongoDB with pooling)
   ↓
9. Response Formatting (Field selection)
   ↓
10. Cache Update (If cacheable)
    ↓
11. Client Response
```

## Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique, indexed),
  password: String (hashed),
  role: String ['doctor', 'nurse', 'admin'],
  phone: String,
  specialization: String,
  experience: Number,
  rating: Number,
  completedDuties: Number,
  verified: Boolean,
  documents: {
    mciCertificate: String,
    mbbsDegree: String,
    photoId: String
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Duties Collection
```javascript
{
  _id: ObjectId,
  title: String,
  description: String,
  hospital: String,
  date: Date (indexed),
  shift: String ['morning', 'afternoon', 'night'],
  startTime: String,
  endTime: String,
  salary: Number,
  requirements: {
    specialization: String,
    minExperience: Number,
    minRating: Number
  },
  status: String ['OPEN', 'FILLED', 'CLOSED'] (indexed),
  postedBy: ObjectId (ref: User, indexed),
  applicationsCount: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### Applications Collection
```javascript
{
  _id: ObjectId,
  duty: ObjectId (ref: Duty, indexed),
  applicant: ObjectId (ref: User, indexed),
  status: String ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  message: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes
- `users.email`: Unique index for fast login lookups
- `duties.date`: For date-based queries
- `duties.status`: For filtering open/filled duties
- `duties.postedBy`: For hospital duty listings
- `applications.duty`: For duty-specific applications
- `applications.applicant`: For user application history
- Compound index: `(duty, applicant)` for uniqueness

## Deployment

### Docker Deployment

#### 1. Create Dockerfile
```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN cd client && npm ci && npm run build:optimize

EXPOSE 5000

CMD ["npm", "start"]
```

#### 2. Create docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/nocturnal
      - REDIS_HOST=redis
    depends_on:
      - mongo
      - redis
    restart: unless-stopped

  mongo:
    image: mongo:8
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    restart: unless-stopped

volumes:
  mongo-data:
```

#### 3. Deploy
```bash
docker-compose up -d
```

### Traditional Server Deployment

#### 1. Server Setup (Ubuntu 22.04)
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-8.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt update
sudo apt install -y mongodb-org

# Install Redis
sudo apt install -y redis-server

# Install Nginx
sudo apt install -y nginx

# Install PM2
sudo npm install -g pm2
```

#### 2. Application Setup
```bash
# Clone repository
cd /var/www
sudo git clone https://github.com/yourusername/nocturnal.git
cd nocturnal

# Install dependencies
npm install
cd client && npm install && npm run build:optimize && cd ..

# Configure environment
sudo cp .env.example .env
sudo nano .env  # Edit with production values

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### 3. Nginx Configuration
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

#### 4. SSL with Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Performance Optimizations

### Backend Optimizations
- **Connection Pooling**: Dynamic MongoDB connection pool based on CPU cores
- **Redis Caching**: 5-tier caching strategy (SHORT, MEDIUM, LONG, HOUR, DAY)
- **Database Indexes**: Optimized indexes on frequently queried fields
- **Lean Queries**: Use `.lean()` for 50% memory reduction on read operations
- **Aggregation Pipelines**: Database-side processing instead of in-memory operations
- **Rate Limiting**: Adaptive rate limiting with TTL cleanup every 5 minutes
- **Memory Management**: 2GB heap limit with automatic garbage collection
- **Compression**: Zlib compression for MongoDB network traffic

### Frontend Optimizations
- **Code Splitting**: Lazy loading for routes and components
- **Asset Minification**: HTML, CSS, JS minification
- **Asset Versioning**: MD5-based cache busting
- **Service Worker**: Offline support with cache-first strategy
- **Lazy Loading**: IntersectionObserver for images
- **Resource Hints**: Preconnect, DNS-prefetch, preload

### Performance Metrics
- API response time: <100ms (cached), <500ms (uncached)
- Database query time: <50ms (indexed queries)
- Cache hit rate: >80%
- Time to First Byte: <200ms
- First Contentful Paint: <1.5s

## Security Features

### Authentication & Authorization
- JWT-based stateless authentication
- Role-based access control (RBAC)
- Bcrypt password hashing (10 salt rounds)
- Token expiration and refresh mechanism

### API Security
- Rate limiting with adaptive thresholds
- CORS configuration
- Helmet.js security headers
- XSS protection
- NoSQL injection prevention
- Input validation and sanitization

### Data Security
- MongoDB field-level encryption (at rest)
- HTTPS/TLS encryption (in transit)
- Sensitive field exclusion in API responses
- Audit logging for security events

### File Upload Security
- File type validation (MIME + extension)
- File size limits (10MB default)
- Virus scanning integration ready
- Secure file storage with unique naming

## Monitoring & Analytics

### Application Monitoring
```bash
# View real-time metrics
curl http://localhost:5000/api/admin/metrics \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Health check
curl http://localhost:5000/api/admin/health

# Rate limit metrics
curl http://localhost:5000/api/admin/rate-limits \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Log Management
```bash
# View recent logs
tail -f logs/combined.log

# View errors only
tail -f logs/error.log

# View security events
tail -f logs/security.log

# Search logs
grep "ERROR" logs/combined.log
```

### Database Monitoring
```bash
# MongoDB status
mongosh --eval 'db.serverStatus()'

# Connection pool stats
mongosh --eval 'db.serverStatus().connections'

# Redis stats
redis-cli INFO stats
```

## Test Accounts

For testing purposes, you can use these pre-configured accounts:

- **Doctor**: doctor@test.com / password123
- **Admin**: demo@hospital.com / demo123

## Contributing

We welcome contributions! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Style
- Use ESLint configuration provided
- Follow JSDoc documentation standards
- Write meaningful commit messages
- Add tests for new features

### Testing
```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run linter
npm run lint
```

## License

This project is licensed under the ISC License - see the LICENSE file for details.

## Support

For support, email support@nocturnal.com or open an issue on GitHub.

## Acknowledgments

- Express.js team for the excellent framework
- MongoDB team for the robust database
- Redis team for the high-performance cache
- All contributors and users of this platform
