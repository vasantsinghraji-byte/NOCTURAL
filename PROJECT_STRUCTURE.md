# Nocturnal Platform - Project Structure

## Clean, Organized Architecture ✅

After cleanup, the project now has a clear, maintainable structure with no duplicate directories.

## Directory Structure

```
nocturnal/
│
├── 📁 client/                    # Frontend Application
│   ├── public/                  # Static HTML/JS/CSS files
│   │   ├── *.html              # All UI pages
│   │   ├── *.js                # Frontend JavaScript
│   │   └── *.css               # Stylesheets
│   ├── src/                     # Source files (mostly empty, using public/)
│   ├── webpack.config.js        # Build configuration
│   └── package.json             # Frontend dependencies
│
├── 📁 routes/                    # API Route Handlers (16+ files)
│   ├── auth.js                  # Authentication endpoints
│   ├── duties.js                # Duty listings
│   ├── applications.js          # Job applications
│   ├── calendar.js              # Scheduling
│   ├── earnings.js              # Financial tracking
│   ├── certifications.js        # Credentials
│   ├── reviews.js               # Reviews/ratings
│   ├── achievements.js          # Gamification
│   ├── messaging.js             # Messaging system
│   ├── analytics.js             # Analytics
│   ├── admin/                   # Admin routes
│   │   ├── metrics.js          # System metrics
│   │   └── ...
│   └── ...                      # More routes
│
├── 📁 middleware/                # Express Middleware
│   ├── auth.js                  # Authentication middleware
│   ├── errorHandler.js          # Global error handling
│   ├── rateLimiter.js           # Rate limiting
│   ├── upload.js                # File upload handling
│   ├── validateRequest.js       # Request validation
│   └── validation.js            # Additional validators
│
├── 📁 models/                    # Mongoose Database Models
│   ├── User.js                  # User model
│   ├── Duty.js                  # Duty model
│   ├── Application.js           # Application model
│   ├── Certification.js         # Certification model
│   ├── Earning.js               # Earning model
│   ├── Notification.js          # Notification model
│   └── ...                      # More models
│
├── 📁 controllers/               # Business Logic Controllers
│   ├── authController.js        # Authentication logic
│   ├── dutyController.js        # Duty management
│   └── ...                      # More controllers
│
├── 📁 config/                    # Configuration Files
│   ├── database.js              # Database configuration
│   ├── environments.js          # Environment configs (dev/staging/prod)
│   ├── rateLimit.js             # Rate limiting config
│   └── firebase.js              # Firebase config
│
├── 📁 utils/                     # Utility Functions
│   ├── pagination.js            # Pagination utilities
│   ├── logger.js                # Winston logger
│   ├── encryption.js            # Encryption utilities
│   └── ...                      # More utilities
│
├── 📁 scripts/                   # Database & Maintenance Scripts
│   ├── add-indexes.js           # Create database indexes
│   ├── seed.js                  # Seed test data
│   └── ...                      # More scripts
│
├── 📁 tests/                     # Test Suites
│   ├── setup.js                 # Test configuration
│   └── ...                      # Test files
│
├── 📁 uploads/                   # User-uploaded Files
│   ├── profile-photos/          # Profile pictures
│   └── documents/               # User documents
│
├── 📁 logs/                      # Application Logs
│   ├── error.log                # Error logs
│   ├── combined.log             # All logs
│   └── ...                      # More logs
│
├── 📁 views/                     # Server-side Templates (if any)
│
├── 📁 constants/                 # Application Constants
│
├── 📄 server.js                  # ⭐ Main Express Application (268 lines)
├── 📄 package.json               # Root dependencies
├── 📄 .env                       # Environment variables
├── 📄 .env.development          # Development environment
├── 📄 .env.production           # Production environment
├── 📄 .env.staging              # Staging environment
├── 📄 .gitignore                # Git ignore rules
├── 📄 serviceAccountKey.json    # Firebase credentials (gitignored)
│
└── 📄 Documentation Files
    ├── README.md
    ├── QUICK_START.md
    ├── API_DOCUMENTATION.md
    ├── COMPRESSION_GUIDE.md
    ├── ENVIRONMENT_AND_PAGINATION_GUIDE.md
    ├── MONGODB_AUTH_COMPLETE.md
    ├── SECURITY_AND_ARCHITECTURE_FIXES.md
    └── ... (many more)
```

## Key Features by Directory

### 🎨 Frontend (client/)
- **Technology**: Static HTML/JS/CSS + Firebase Auth
- **Pages**: 30+ HTML pages for doctors, admins, hospitals
- **Build**: Webpack for optimization
- **Serving**: Express static middleware

### 🔧 Backend (Root Level)
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT + Firebase
- **Security**: Helmet, CORS, Rate Limiting
- **Optimization**: Compression, Pagination, Indexes

### 📊 Database (MongoDB)
- **Collections**: Users, Duties, Applications, Earnings, Certifications, etc.
- **Indexes**: 22 optimized indexes for performance
- **Authentication**: SCRAM-SHA-256 with separate users

### 🔐 Security Features
- **Helmet**: Security headers
- **CORS**: Whitelist-based origin control
- **Rate Limiting**: Tiered limits by endpoint type
- **MongoDB Sanitization**: NoSQL injection prevention
- **Compression**: Bandwidth optimization
- **Authentication**: MongoDB auth enabled

## Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js 5.1.0
- **Database**: MongoDB 8.2 with Mongoose 8.19.0
- **Authentication**: JWT + Firebase Admin SDK
- **Security**: Helmet, CORS, express-rate-limit
- **Logging**: Winston
- **Validation**: express-validator

### Frontend
- **Languages**: HTML5, CSS3, JavaScript (ES6+)
- **Authentication**: Firebase Client SDK
- **Build**: Webpack 5
- **Development**: Live Server

### DevOps
- **Environment Management**: dotenv
- **Testing**: Jest
- **Linting**: ESLint with security plugin
- **Process Manager**: nodemon (development)

## API Structure

### Public Endpoints (No Auth)
```
POST /api/auth/register         # User registration
POST /api/auth/login           # User login
POST /api/auth/forgot-password # Password reset
GET  /api/health               # Health check
```

### Protected Endpoints (Auth Required)
```
GET    /api/duties             # List duties (paginated)
POST   /api/duties             # Create duty (admin)
GET    /api/applications       # List applications
POST   /api/applications       # Apply to duty
GET    /api/calendar           # Get calendar events
GET    /api/earnings           # Get earnings
POST   /api/certifications     # Add certification
GET    /api/messages           # Get messages
GET    /api/notifications      # Get notifications
POST   /api/payments           # Process payment
```

### Admin Endpoints (Admin Auth Required)
```
GET    /api/admin/metrics      # System metrics
POST   /api/admin/duties       # Post new duty
GET    /api/admin/applications # Review applications
PUT    /api/admin/settings     # Update settings
```

## Environment Configuration

### Development (.env.development)
- MongoDB: localhost with authentication
- Logging: Debug level, console output
- Rate Limits: Relaxed (1000 req/15min)
- Compression: Level 1 (fast)

### Staging (.env.staging)
- MongoDB: Staging database
- Logging: Info level
- Rate Limits: Moderate (250 req/15min)
- Compression: Level 6 (balanced)

### Production (.env.production)
- MongoDB: Production cluster
- Logging: Error level only
- Rate Limits: Strict (100 req/15min)
- Compression: Level 6 (balanced)

## Startup Process

### 1. Load Environment
```javascript
dotenv.config()
// Loads .env or NODE_ENV-specific file
```

### 2. Connect to Database
```javascript
mongoose.connect(process.env.MONGODB_URI)
// With authentication and monitoring
```

### 3. Initialize Middleware
```javascript
app.use(helmet())           // Security headers
app.use(cors())            // CORS policy
app.use(compression())     // Response compression
app.use(rateLimiters.api)  // Rate limiting
app.use(mongoSanitize())   // NoSQL injection prevention
```

### 4. Mount Routes
```javascript
app.use('/api/auth', authRoutes)
app.use('/api/duties', dutyRoutes)
// ... all other routes
```

### 5. Error Handling
```javascript
app.use(errorHandler)  // Global error handler
```

### 6. Start Server
```javascript
app.listen(PORT)
console.log(`Server running on port ${PORT}`)
```

## Development Workflow

### Start Development Server
```bash
npm run dev
# Uses nodemon for auto-restart
```

### Run Tests
```bash
npm test
# Runs Jest test suites
```

### Build Frontend
```bash
npm run build
# Webpack bundles client code
```

### Create Database Indexes
```bash
npm run db:indexes
# Creates 22 performance indexes
```

### Check Code Quality
```bash
npm run lint
# ESLint with security rules
```

## Performance Optimizations

### ✅ Database
- 22 strategic indexes (10-100x faster queries)
- Compound indexes for common queries
- TTL indexes for auto-cleanup
- Mongoose lean queries

### ✅ API
- Response compression (70-80% bandwidth reduction)
- Pagination (offset and cursor-based)
- Rate limiting (prevent abuse)
- Request caching (where appropriate)

### ✅ Frontend
- Webpack bundling
- Code minification
- Asset optimization
- CDN-ready static files

## Security Measures

### ✅ Implemented
- MongoDB authentication (SCRAM-SHA-256)
- JWT with secure secrets (rotated)
- Helmet security headers
- CORS whitelist
- Rate limiting (tiered by endpoint)
- NoSQL injection prevention
- Input validation
- File upload restrictions
- Secure session handling

### ✅ Best Practices
- Environment-specific configs
- Secrets in .env (gitignored)
- Firebase credentials secured
- Error messages sanitized
- Audit logging
- Security-focused ESLint rules

---

## Summary

✅ **Clean Architecture**: Single source of truth, no duplicates
✅ **Well Organized**: Clear separation of concerns
✅ **Fully Featured**: Authentication, authorization, rate limiting, compression
✅ **Production Ready**: Environment separation, logging, error handling
✅ **Performant**: Database indexes, compression, pagination
✅ **Secure**: Multiple security layers, best practices followed

The project structure is now clean, maintainable, and ready for development!
