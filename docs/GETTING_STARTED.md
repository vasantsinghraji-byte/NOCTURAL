# Getting Started with Nocturnal

> **Consolidated Quick Start Guide** - This replaces QUICK_START.md, QUICK_START_AFTER_RENAME.md, and QUICK_START_BUILD.md

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Building for Production](#building-for-production)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v18.x or higher (v22.x recommended)
- **MongoDB**: v6.x or higher (v8.x recommended)
- **Redis**: v6.x or higher (optional but recommended for caching)
- **npm**: v9.x or higher
- **Git**: Latest version

### Verify Installation

```bash
node --version    # Should be v18.x or higher
npm --version     # Should be v9.x or higher
mongosh --version # Should be v1.x or higher
redis-cli --version # Optional
```

---

## Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/nocturnal.git
cd nocturnal
```

### Step 2: Install Backend Dependencies

```bash
npm install
```

**Expected time**: 2-3 minutes

### Step 3: Install Frontend Dependencies

```bash
cd client
npm install
cd ..
```

**Expected time**: 2-3 minutes

---

## Configuration

### Step 1: Create Environment File

Copy the example environment file:

```bash
cp .env.example .env
```

### Step 2: Configure Environment Variables

Edit `.env` and update the following required variables:

```env
# Server Configuration
NODE_ENV=development
PORT=5000

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/nocturnal_dev

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
JWT_EXPIRE=7d

# Redis Configuration (optional)
REDIS_ENABLED=false
REDIS_URL=redis://localhost:6379

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000

# File Upload
MAX_FILE_SIZE=10485760  # 10MB

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

### Step 3: Set Up MongoDB

#### Option A: Local MongoDB (Recommended for Development)

```bash
# Start MongoDB service
# Windows:
net start MongoDB

# macOS/Linux:
brew services start mongodb-community
# or
sudo systemctl start mongod
```

#### Option B: MongoDB Atlas (Cloud)

1. Create account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a cluster
3. Get connection string
4. Update `MONGODB_URI` in `.env`:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/nocturnal_dev
```

### Step 4: Create Database Indexes (Critical for Performance)

```bash
npm run db:indexes
```

**Expected output**:
```
✅ All indexes created successfully!
Performance Impact:
- Queries on status + date: ~10-100x faster
- User-specific queries: ~5-50x faster
- Notification fetching: ~20-100x faster
```

---

## Running the Application

### Development Mode (Recommended for Development)

Runs with auto-restart on file changes:

```bash
npm run dev
```

**Server will start on**: `http://localhost:5000`

### Production Mode

```bash
npm start
```

### Using PM2 (Process Manager)

For production deployment with cluster mode:

```bash
# Start application
npm run pm2:start:prod

# View logs
npm run pm2:logs

# Monitor
npm run pm2:monit

# Restart
npm run pm2:restart
```

---

## Building for Production

### Step 1: Build Frontend Assets

```bash
cd client
npm run build
cd ..
```

Creates optimized files in `client/dist/`:
- `/js/` - Minified JavaScript bundles (~70% size reduction)
- `/css/` - Optimized CSS files
- `/*.html` - HTML files with cache-busted URLs

**Expected output**:
```
Build complete. The dist directory is ready to be deployed.
Files:
- main.bundle.js (128 KB)
- styles.css (45 KB)
- 40+ HTML pages
```

### Step 2: Update Server Configuration

If using production build, update `server.js` line 195:

```javascript
// Change from:
app.use(express.static('client/public'));

// To:
app.use(express.static('client/dist'));
```

### Step 3: Run Production Build

```bash
npm run build:prod
```

This command:
1. Builds frontend with production optimizations
2. Runs optimization scripts
3. Starts server in production mode

---

## Verification

### 1. Check Server Health

```bash
curl http://localhost:5000/api/v1/health
```

**Expected response**:
```json
{
  "status": "ok",
  "timestamp": "2024-11-21T10:30:00.000Z",
  "database": "connected",
  "redis": "connected"
}
```

### 2. Check Database Connection

```bash
node test-mongo-connection.js
```

**Expected output**:
```
✅ MongoDB connection successful
Database: nocturnal_dev
Collections: 0 (if fresh install)
```

### 3. Check Indexes

```bash
npm run db:indexes
```

Should show all indexes created successfully.

### 4. Test API Documentation

Open browser: `http://localhost:5000/api-docs`

Should display interactive Swagger UI.

### 5. Test Frontend

Open browser: `http://localhost:5000`

Should display landing page with:
- Hero section
- Login/Register buttons
- Responsive navigation

---

## Troubleshooting

### Issue: "Cannot connect to MongoDB"

**Solution 1**: Check MongoDB is running
```bash
# Windows
sc query MongoDB

# macOS/Linux
brew services list | grep mongodb
# or
sudo systemctl status mongod
```

**Solution 2**: Verify connection string in `.env`
```bash
# Test connection
node test-mongo-connection.js
```

**Solution 3**: Check MongoDB authentication
```bash
mongosh
use nocturnal_dev
db.auth('username', 'password')
```

### Issue: "Port 5000 is already in use"

**Solution 1**: Change port in `.env`
```env
PORT=5001
```

**Solution 2**: Kill existing process
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:5000 | xargs kill -9
```

### Issue: "Frontend build fails"

**Solution**: Clean install dependencies
```bash
cd client
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: "Redis connection failed"

**Solution**: Disable Redis (app works without it)
```env
REDIS_ENABLED=false
```

Or install Redis:
```bash
# Windows: Download from https://github.com/microsoftarchive/redis/releases
# macOS:
brew install redis
brew services start redis

# Linux:
sudo apt install redis-server
sudo systemctl start redis
```

### Issue: "Database indexes fail to create"

**Solution 1**: Check MongoDB authentication
```bash
# Update .env with auth credentials
MONGODB_URI=mongodb://username:password@localhost:27017/nocturnal_dev?authSource=admin
```

**Solution 2**: Manually create indexes
```bash
mongosh
use nocturnal_dev
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ role: 1 })
# ... (see scripts/add-indexes.js for complete list)
```

---

## Next Steps

### For Developers

1. **Read Architecture Documentation**: [docs/architecture/overview.md](architecture/overview.md)
2. **Set Up Database Security**: [docs/guides/database-security.md](guides/database-security.md)
3. **Configure Monitoring**: [docs/guides/monitoring.md](guides/monitoring.md)
4. **Review API Documentation**: `http://localhost:5000/api-docs`

### For Deployment

1. **Production Deployment Guide**: [docs/deployment/production.md](deployment/production.md)
2. **Docker Deployment**: [docs/deployment/docker.md](deployment/docker.md)
3. **Kubernetes Deployment**: [docs/deployment/kubernetes.md](deployment/kubernetes.md)
4. **CI/CD Setup**: [docs/deployment/cicd.md](deployment/cicd.md)

### For Testing

1. **Run Test Suite**:
   ```bash
   npm test
   npm run test:coverage
   ```

2. **Security Scan**:
   ```bash
   npm run security:scan
   ```

3. **Lint Code**:
   ```bash
   npm run lint
   npm run lint:fix
   ```

---

## Quick Reference

### Common Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with auto-reload |
| `npm test` | Run test suite |
| `npm run build` | Build frontend for production |
| `npm run db:indexes` | Create database indexes |
| `npm run lint` | Check code quality |
| `npm run pm2:start:prod` | Start with PM2 cluster mode |

### Default Ports

| Service | Port | URL |
|---------|------|-----|
| Backend API | 5000 | http://localhost:5000 |
| Frontend Dev | 3000 | http://localhost:3000 |
| MongoDB | 27017 | mongodb://localhost:27017 |
| Redis | 6379 | redis://localhost:6379 |
| Swagger Docs | 5000 | http://localhost:5000/api-docs |

### Important Files

| File | Purpose |
|------|---------|
| `.env` | Environment configuration |
| `server.js` | Main application entry point |
| `ecosystem.config.js` | PM2 configuration |
| `docker-compose.yml` | Docker orchestration |
| `package.json` | Dependencies and scripts |

---

## Time Estimate

- **Installation**: 5-10 minutes
- **Configuration**: 5 minutes
- **First Run**: 2 minutes
- **Production Build**: 3-5 minutes
- **Total**: ~15-25 minutes

---

## Support

- **Issues**: https://github.com/yourusername/nocturnal/issues
- **Documentation**: See [docs/](../) directory
- **API Documentation**: http://localhost:5000/api-docs

---

✅ **Setup Complete!** Your Nocturnal platform is ready for development.
