# Architecture Documentation - Nocturnal Platform

Complete technical architecture documentation covering system design, data flow, and technical decisions.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Patterns](#architecture-patterns)
- [Technology Stack](#technology-stack)
- [System Components](#system-components)
- [Data Flow](#data-flow)
- [Security Architecture](#security-architecture)
- [Scalability Design](#scalability-design)
- [Performance Optimization](#performance-optimization)
- [API Design](#api-design)
- [Database Design](#database-design)
- [Caching Strategy](#caching-strategy)
- [File Storage](#file-storage)
- [Monitoring & Logging](#monitoring--logging)

## System Overview

Nocturnal is a healthcare duty shift management platform built using a modern three-tier architecture with microservices principles. The system connects healthcare professionals (doctors and nurses) with hospitals requiring temporary staffing.

### High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │  Web App   │  │  PWA/Mob   │  │  Admin     │               │
│  │  (Vanilla  │  │  (Service  │  │  Dashboard │               │
│  │  JS + PWA) │  │   Worker)  │  │            │               │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘               │
│         │               │               │                       │
│         └───────────────┴───────────────┘                       │
│                         │                                       │
│                    HTTPS (TLS 1.3)                             │
│                         │                                       │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                ┌─────────▼─────────┐
                │   Load Balancer   │
                │   (Nginx/HAProxy) │
                │   - SSL Termination│
                │   - Rate Limiting │
                └─────────┬─────────┘
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│                   Application Layer                              │
│                         │                                        │
│        ┌────────────────┴────────────────┐                      │
│        │                                 │                      │
│  ┌─────▼──────┐                   ┌─────▼──────┐              │
│  │  Node.js   │ ◄─── Cluster ────►│  Node.js   │              │
│  │  Instance  │      Mode          │  Instance  │              │
│  │  (Worker)  │                    │  (Worker)  │              │
│  └─────┬──────┘                    └─────┬──────┘              │
│        │                                 │                      │
│        └────────────────┬────────────────┘                      │
│                         │                                        │
└─────────────────────────┼────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
┌─────────▼────┐   ┌──────▼──────┐   ┌───▼──────────┐
│   MongoDB    │   │    Redis    │   │  File Store  │
│   (Primary)  │   │   (Cache)   │   │  (S3/Local)  │
│      +       │   │             │   │              │
│  (Replica 1) │   │  - Sessions │   │  - Documents │
│      +       │   │  - Cache    │   │  - Images    │
│  (Replica 2) │   │  - Queues   │   │  - Logs      │
└──────────────┘   └─────────────┘   └──────────────┘
```

## Architecture Patterns

### 1. Layered Architecture

The application follows a strict layered architecture:

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│  (Routes, Controllers, API Endpoints)   │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│        Business Logic Layer             │
│    (Services, Business Rules, Core)     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Data Access Layer               │
│    (Models, Repositories, Database)     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│          Database Layer                 │
│      (MongoDB, Redis, File System)      │
└─────────────────────────────────────────┘
```

**Key Principles:**
- Each layer only communicates with adjacent layers
- Business logic is isolated from presentation
- Data access is abstracted from business logic
- Cross-cutting concerns handled via middleware

### 2. MVC Pattern

```
┌──────────┐       ┌─────────────┐       ┌────────────┐
│  Model   │◄──────│ Controller  │──────►│    View    │
│          │       │             │       │  (JSON)    │
│  (Data)  │       │  (Logic)    │       │            │
└──────────┘       └─────────────┘       └────────────┘
     │                    │
     │                    │
     ▼                    ▼
┌──────────┐       ┌─────────────┐
│ Database │       │ Middleware  │
└──────────┘       └─────────────┘
```

### 3. Repository Pattern

```javascript
// Model defines schema
const UserModel = mongoose.model('User', userSchema);

// Repository handles data access
class UserRepository {
  async findById(id) {
    return UserModel.findById(id).lean();
  }

  async create(data) {
    return UserModel.create(data);
  }
}

// Service contains business logic
class UserService {
  constructor(userRepository) {
    this.repo = userRepository;
  }

  async registerUser(data) {
    // Business logic here
    return this.repo.create(data);
  }
}
```

### 4. Middleware Chain Pattern

```
Request → Rate Limiter → CORS → Helmet → Body Parser →
         ↓
Authentication → Authorization → Validation →
         ↓
Cache Check → Controller → Response Formatter →
         ↓
Error Handler → Response
```

## Technology Stack

### Backend Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|----------|
| Runtime | Node.js | 22.x | JavaScript runtime |
| Framework | Express.js | 5.x | Web framework |
| Database | MongoDB | 8.x | Primary data store |
| ODM | Mongoose | 8.x | Object modeling |
| Cache | Redis | 7.x | In-memory cache |
| Cache Client | ioredis | 5.x | Redis client |
| Auth | JWT | 9.x | Authentication |
| Encryption | bcryptjs | 3.x | Password hashing |
| Validation | express-validator | 7.x | Input validation |
| Logging | Winston | 3.x | Application logging |
| Process Manager | PM2 | 5.x | Process management |

### Frontend Stack

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|----------|
| Language | JavaScript | ES2022 | Client-side logic |
| Modules | ES6 Modules | - | Code organization |
| PWA | Service Workers | - | Offline support |
| Build | Custom | - | Minification/bundling |
| CSS | Vanilla CSS3 | - | Styling |

### Security Stack

| Component | Technology | Purpose |
|-----------|-----------|----------|
| Helmet | helmet | Security headers |
| Rate Limiting | express-rate-limit | API protection |
| Sanitization | express-mongo-sanitize | NoSQL injection prevention |
| XSS Protection | xss-clean | Cross-site scripting prevention |
| CORS | cors | Cross-origin resource sharing |

## System Components

### 1. API Gateway (Express.js)

**Responsibilities:**
- Request routing
- Authentication/Authorization
- Rate limiting
- Request/Response transformation
- API versioning

**Implementation:**
```javascript
// server.js
const app = express();

// Middleware pipeline
app.use(helmet());           // Security headers
app.use(cors());            // CORS
app.use(compression());     // Response compression
app.use(rateLimit());       // Rate limiting
app.use(authentication);    // JWT auth
app.use(authorization);     // RBAC

// Route mounting
app.use('/api/v1', v1Routes);
```

### 2. Authentication Service

**Components:**
- JWT token generation
- Token verification
- Password hashing
- Session management

**Flow:**
```
1. User submits credentials
   ↓
2. Validate input
   ↓
3. Query database for user
   ↓
4. Compare password hash
   ↓
5. Generate JWT token
   ↓
6. Return token + user data
```

### 3. Data Access Layer

**Models:**
- User
- Duty
- Application
- Analytics
- HospitalSettings

**Schema Design Principles:**
- Normalized where possible
- Denormalized for performance-critical queries
- Embedded documents for 1:few relationships
- References for many:many relationships

### 4. Caching Layer (Redis)

**Cache Strategies:**

```javascript
// 1. Cache-Aside Pattern
async function getUser(id) {
  // Check cache
  let user = await cache.get(`user:${id}`);
  if (user) return user;

  // Query database
  user = await UserModel.findById(id);

  // Update cache
  await cache.set(`user:${id}`, user, 300); // 5 min TTL
  return user;
}

// 2. Write-Through Pattern
async function updateUser(id, data) {
  // Update database
  const user = await UserModel.findByIdAndUpdate(id, data);

  // Update cache
  await cache.set(`user:${id}`, user, 300);
  return user;
}

// 3. Cache Invalidation
async function deleteUser(id) {
  // Delete from database
  await UserModel.findByIdAndDelete(id);

  // Invalidate cache
  await cache.del(`user:${id}`);
}
```

### 5. File Storage Service

**Storage Strategy:**
- Local filesystem for development
- S3-compatible storage for production
- Unique file naming (UUID + timestamp)
- MIME type validation
- File size limits

**Structure:**
```
uploads/
├── profile-photos/
│   └── {userId}_{fieldname}_{timestamp}.{ext}
├── documents/
│   ├── mci/
│   ├── degrees/
│   ├── ids/
│   └── certificates/
```

## Data Flow

### Request Flow Example: Apply for Duty

```
┌─────────┐
│ Client  │
└────┬────┘
     │ POST /api/v1/applications
     │ { dutyId, message }
     ▼
┌─────────────────┐
│  Rate Limiter   │ ──► Check IP/User limits
└────┬────────────┘
     │ Allow
     ▼
┌─────────────────┐
│ Authentication  │ ──► Verify JWT token
└────┬────────────┘
     │ Authenticated
     ▼
┌─────────────────┐
│ Authorization   │ ──► Check role (doctor/nurse)
└────┬────────────┘
     │ Authorized
     ▼
┌─────────────────┐
│   Validation    │ ──► Validate input data
└────┬────────────┘
     │ Valid
     ▼
┌─────────────────┐
│   Controller    │
│  - Check duty   │ ──► Query: Duty.findById()
│  - Check dupe   │ ──► Query: Application.findOne()
│  - Check quals  │ ──► Compare requirements
│  - Create app   │ ──► Create: Application.create()
│  - Update count │ ──► Update: Duty.updateOne()
└────┬────────────┘
     │ Success
     ▼
┌─────────────────┐
│ Cache Update    │ ──► Invalidate duty cache
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│ Notification    │ ──► Notify hospital admin
└────┬────────────┘
     │
     ▼
┌─────────────────┐
│   Response      │ ──► 201 Created + application data
└────┬────────────┘
     │
     ▼
┌─────────┐
│ Client  │
└─────────┘
```

### Database Transaction Flow

```javascript
// Atomic operations for consistency
async function acceptApplication(applicationId, adminId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Update application status
    const application = await Application.findByIdAndUpdate(
      applicationId,
      { status: 'ACCEPTED' },
      { session, new: true }
    );

    // 2. Update duty status
    await Duty.findByIdAndUpdate(
      application.duty,
      { status: 'FILLED' },
      { session }
    );

    // 3. Reject other applications
    await Application.updateMany(
      { duty: application.duty, _id: { $ne: applicationId } },
      { status: 'REJECTED' },
      { session }
    );

    // 4. Update analytics
    await DoctorAnalytics.updateOne(
      { user: application.applicant },
      { $inc: { 'applicationStats.totalAccepted': 1 } },
      { session }
    );

    await session.commitTransaction();
    return application;

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

## Security Architecture

### 1. Authentication Flow

```
┌──────────┐
│  Client  │
└────┬─────┘
     │ 1. POST /api/auth/login
     │    { email, password }
     ▼
┌──────────────────┐
│     Server       │
│ 2. Validate input│
│ 3. Query database│
│ 4. Compare hash  │
│ 5. Generate JWT  │
└────┬─────────────┘
     │ 6. Return { token, user }
     ▼
┌──────────┐
│  Client  │
│ 7. Store token in memory
└────┬─────┘
     │ 8. Subsequent requests:
     │    Authorization: Bearer {token}
     ▼
┌──────────────────┐
│     Server       │
│ 9. Verify JWT    │
│ 10. Decode user  │
│ 11. Attach req.user
└──────────────────┘
```

### 2. Authorization (RBAC)

```javascript
const roles = {
  doctor: ['viewDuties', 'applyDuty', 'viewOwnApplications'],
  nurse: ['viewDuties', 'applyDuty', 'viewOwnApplications'],
  admin: ['postDuty', 'viewAllApplications', 'acceptReject', 'viewAnalytics']
};

// Middleware
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    next();
  };
}

// Usage
router.post('/duties', protect, authorize('admin'), createDuty);
```

### 3. Input Validation

```javascript
// Using express-validator
const validateApplication = [
  body('dutyId')
    .isMongoId().withMessage('Invalid duty ID'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 500 }).withMessage('Message must be 10-500 characters')
    .escape(),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
```

## Scalability Design

### Horizontal Scaling

```
┌───────────────────────────────────────────────┐
│           Load Balancer (Nginx)               │
│         Round Robin / Least Conn              │
└────┬──────────┬──────────┬──────────┬─────────┘
     │          │          │          │
┌────▼───┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐
│Node.js │ │Node.js │ │Node.js │ │Node.js │
│Worker 1│ │Worker 2│ │Worker 3│ │Worker N│
└────┬───┘ └───┬────┘ └───┬────┘ └───┬────┘
     │         │          │          │
     └─────────┴──────────┴──────────┘
               │
          ┌────▼────┐
          │ MongoDB │
          │ Cluster │
          └─────────┘
```

### Database Scaling

**Read Replicas:**
```javascript
// Primary for writes
const writeDB = mongoose.connection;

// Secondary for reads
const readDB = mongoose.connection.useDb('nocturnal', {
  readPreference: 'secondaryPreferred'
});
```

**Sharding Strategy:**
```javascript
// Shard key: userId (for user data)
db.users.createIndex({ "_id": "hashed" });
sh.shardCollection("nocturnal.users", { "_id": "hashed" });

// Shard key: date (for duties)
db.duties.createIndex({ "date": 1 });
sh.shardCollection("nocturnal.duties", { "date": 1 });
```

### Caching Layers

```
┌──────────────────────────────────────┐
│     Application Level Cache          │
│     (In-Memory LRU)                  │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│     Distributed Cache (Redis)        │
│     - Session data                   │
│     - API responses                  │
│     - Database query results         │
└──────────────┬───────────────────────┘
               │
┌──────────────▼───────────────────────┐
│     Database (MongoDB)               │
│     - Persistent data                │
└──────────────────────────────────────┘
```

## Performance Optimization

### Database Query Optimization

```javascript
// ❌ Bad: No index, fetches all fields
await User.find({ email: 'test@test.com' });

// ✅ Good: Indexed field, select only needed fields
await User.findOne({ email: 'test@test.com' })
  .select('name email role')
  .lean();

// ✅ Better: Aggregation for complex queries
await Duty.aggregate([
  { $match: { status: 'OPEN', date: { $gte: new Date() } } },
  { $lookup: {
      from: 'applications',
      localField: '_id',
      foreignField: 'duty',
      as: 'applications'
  }},
  { $project: {
      title: 1,
      hospital: 1,
      applicationsCount: { $size: '$applications' }
  }}
]);
```

### Connection Pooling

```javascript
// config/database.js
const poolSize = Math.max(10, os.cpus().length * 2);

mongoose.connect(MONGODB_URI, {
  maxPoolSize: poolSize,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
});
```

### Response Compression

```javascript
const compression = require('compression');

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Balance between speed and compression
}));
```

## API Design

### RESTful Principles

```
HTTP Method  Endpoint                   Description
-----------  -------------------------  ---------------------------
GET          /api/v1/duties            List all duties
GET          /api/v1/duties/:id        Get single duty
POST         /api/v1/duties            Create duty (admin only)
PUT          /api/v1/duties/:id        Update duty (admin only)
DELETE       /api/v1/duties/:id        Delete duty (admin only)

POST         /api/v1/applications      Apply for duty
GET          /api/v1/applications      Get user's applications
PUT          /api/v1/applications/:id  Update application status
```

### API Versioning

```javascript
// v1/index.js
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/duties', dutyRoutes);

// Future: v2/index.js
router.use('/auth', authRoutesV2);
router.use('/users', userRoutesV2);
```

### Response Format

```javascript
// Success response
{
  "success": true,
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}

// Error response
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error info",
  "code": "ERR_CODE"
}
```

## Monitoring & Logging

### Logging Strategy

```javascript
// utils/logger.js
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.File({ filename: 'logs/security.log', level: 'warn' })
  ]
});
```

### Metrics Collection

```javascript
// Performance metrics
const metrics = {
  requests: {
    total: 0,
    success: 0,
    error: 0
  },
  database: {
    queries: 0,
    avgTime: 0
  },
  cache: {
    hits: 0,
    misses: 0
  }
};

// Middleware to track
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    metrics.requests.total++;
    const duration = Date.now() - start;
    logger.info('Request processed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration
    });
  });

  next();
});
```

## Conclusion

This architecture provides:
- **Scalability**: Horizontal scaling of application servers
- **Reliability**: Database replication and failover
- **Performance**: Multi-layer caching and query optimization
- **Security**: Multiple layers of authentication and validation
- **Maintainability**: Clean separation of concerns
- **Extensibility**: Easy to add new features and services

The architecture is designed to handle growth from MVP to enterprise scale while maintaining performance and reliability.
