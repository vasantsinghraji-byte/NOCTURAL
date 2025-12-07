# Database Security Configuration

## Overview

This document provides comprehensive instructions for securing your MongoDB database for the Nocturnal Healthcare Staffing Platform.

**Security Status:** ⚠️ Requires Setup
**Priority:** Critical
**Estimated Time:** 30-45 minutes

---

## 📋 Table of Contents

1. [Current State](#current-state)
2. [Security Features](#security-features)
3. [Quick Start](#quick-start)
4. [Detailed Setup](#detailed-setup)
5. [Connection Configuration](#connection-configuration)
6. [Replica Set Setup](#replica-set-setup)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## ⚠️ Current State

**WARNING:** Your MongoDB instance is currently running **WITHOUT authentication**!

This means:
- ❌ Anyone with network access can read/write/delete data
- ❌ No access control or user permissions
- ❌ Vulnerable to unauthorized access
- ❌ Not production-ready

**You MUST enable authentication before deploying to production.**

---

## 🔐 Security Features

Our MongoDB security setup provides:

### 1. Authentication & Authorization
- ✅ Admin user with full database privileges
- ✅ Application users with minimal required permissions
- ✅ Separate users for dev, test, and production environments
- ✅ Strong auto-generated passwords (32 characters)

### 2. Connection Security
- ✅ Encrypted connection strings
- ✅ Authentication source configuration
- ✅ Connection pooling with optimal settings
- ✅ Automatic reconnection with exponential backoff

### 3. High Availability (Production)
- ✅ Replica set configuration
- ✅ Automatic failover
- ✅ Data redundancy
- ✅ Read scaling capabilities

### 4. Monitoring
- ✅ Connection health checks
- ✅ Pool metrics tracking
- ✅ Error logging and alerts
- ✅ Reconnection attempt monitoring

---

## 🚀 Quick Start

Follow these steps to enable MongoDB authentication:

### Step 1: Setup MongoDB Users

```bash
# Run the security setup script
npm run db:setup-security
```

This script will:
1. Connect to MongoDB (no auth required initially)
2. Create admin user with full privileges
3. Create application users for dev/test/production
4. Generate strong passwords
5. Save credentials to `mongodb-credentials.json`

**Output:**
```
📋 CREDENTIALS SUMMARY:

Admin User:
  Username: nocturnal_admin
  Password: [generated-32-char-password]
  Database: admin

Development User:
  Username: noctural_app_dev
  Password: [generated-32-char-password]
  Database: noctural_dev

Test User:
  Username: noctural_app_test
  Password: [generated-32-char-password]
  Database: noctural_test
```

### Step 2: Enable Authentication in MongoDB

**Windows:**
```bash
npm run db:enable-auth
```

**Manual (mongod.conf):**

1. Locate your `mongod.cfg` file:
   - Default: `C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg`

2. Add these lines:
```yaml
security:
  authorization: enabled
```

3. Restart MongoDB service:
```bash
net stop MongoDB
net start MongoDB
```

### Step 3: Update Environment Variables

Copy the connection string from `mongodb-credentials.json` to your `.env` file:

```env
# Development
MONGODB_URI=mongodb://noctural_app_dev:YOUR_PASSWORD@localhost:27017/noctural_dev?authSource=noctural_dev

# Test
MONGODB_URI_TEST=mongodb://noctural_app_test:YOUR_PASSWORD@localhost:27017/noctural_test?authSource=noctural_test
```

### Step 4: Test Connection

```bash
npm start
```

If successful, you'll see:
```
✅ Environment validated successfully (development)
🚀 Server running on port 5000 - Logs: ./logs/
ℹ MongoDB Connected
```

---

## 📖 Detailed Setup

### User Roles Explained

#### Admin User (`nocturnal_admin`)
- **Purpose:** Database administration and user management
- **Roles:**
  - `userAdminAnyDatabase` - Create/manage users
  - `readWriteAnyDatabase` - Read/write all databases
  - `dbAdminAnyDatabase` - Database maintenance
  - `clusterAdmin` - Cluster management

- **Usage:**
```bash
mongosh -u nocturnal_admin -p YOUR_ADMIN_PASSWORD --authenticationDatabase admin
```

#### Application Users
- **Purpose:** Application database access with minimal permissions
- **Role:** `readWrite` on specific database only
- **Principle:** Least privilege - can only access assigned database

**Development User:**
- Database: `noctural_dev`
- Username: `noctural_app_dev`

**Test User:**
- Database: `noctural_test`
- Username: `noctural_app_test`

**Production User:**
- Database: `noctural_prod`
- Username: `noctural_app_prod`
- ⚠️ Must be created on production MongoDB instance

### Security Best Practices

1. **Password Management**
   - ✅ Generated passwords are 32 characters
   - ✅ Include uppercase, lowercase, numbers, special characters
   - ✅ Stored in `mongodb-credentials.json` (gitignored)
   - ⚠️ Rotate passwords every 90 days

2. **Credential Storage**
   - ✅ Development: `.env` file (gitignored)
   - ✅ Production: Environment variables or secret manager
   - ❌ NEVER commit `mongodb-credentials.json` to git
   - ❌ NEVER hardcode credentials in source code

3. **Network Security**
   - ✅ Bind MongoDB to localhost in development
   - ✅ Use firewall rules in production
   - ✅ Enable TLS/SSL for production
   - ✅ Use VPN or private network for replica set

4. **Access Control**
   - ✅ Use separate users for each environment
   - ✅ Grant minimum required permissions
   - ✅ Regularly audit user permissions
   - ✅ Remove unused users

---

## 🔌 Connection Configuration

### Connection String Format

```
mongodb://[username]:[password]@[host]:[port]/[database]?[options]
```

### Development Connection

```env
MONGODB_URI=mongodb://noctural_app_dev:YOUR_PASSWORD@localhost:27017/noctural_dev?authSource=noctural_dev
```

**Options:**
- `authSource=noctural_dev` - Database containing user credentials

### Production Connection (Replica Set)

```env
MONGODB_URI=mongodb://noctural_app_prod:YOUR_PASSWORD@host1:27017,host2:27017,host3:27017/noctural_prod?replicaSet=noctural-rs0&authSource=noctural_prod&retryWrites=true&w=majority&readPreference=primaryPreferred
```

**Options:**
- `replicaSet=noctural-rs0` - Replica set name
- `retryWrites=true` - Retry failed writes
- `w=majority` - Wait for majority acknowledgment
- `readPreference=primaryPreferred` - Read from primary, fallback to secondary

### Additional Options

```env
# Authentication mechanism (default: SCRAM-SHA-256)
MONGODB_AUTH_MECHANISM=SCRAM-SHA-256

# Read preference
MONGODB_READ_PREFERENCE=primaryPreferred

# Write concern
MONGODB_WRITE_CONCERN_W=majority
MONGODB_WRITE_CONCERN_TIMEOUT=5000

# Read concern
MONGODB_READ_CONCERN=majority

# Max staleness for secondary reads (seconds)
MONGODB_MAX_STALENESS=90
```

---

## 🔄 Replica Set Setup

For production high availability, configure a replica set.

### Prerequisites

- 3+ MongoDB instances (odd number recommended)
- Network connectivity between instances
- MongoDB authentication configured on all instances

### Quick Setup

```bash
npm run db:setup-replica
```

### Environment Variables

```env
# Primary MongoDB instance
MONGODB_PRIMARY_URI=mongodb://nocturnal_admin:PASSWORD@host1:27017/admin

# Replica set configuration
MONGODB_REPLICA_SET=noctural-rs0
MONGODB_RS_HOST_1=host1:27017
MONGODB_RS_HOST_2=host2:27017
MONGODB_RS_HOST_3=host3:27017

# Optional arbiter (voting-only member)
MONGODB_RS_ARBITER=arbiter:27017
```

### Manual Setup

1. **Start MongoDB instances** with replica set configuration:
```yaml
# mongod.conf
replication:
  replSetName: noctural-rs0
```

2. **Connect to primary instance:**
```bash
mongosh mongodb://nocturnal_admin:PASSWORD@host1:27017/admin
```

3. **Initialize replica set:**
```javascript
rs.initiate({
  _id: "noctural-rs0",
  members: [
    { _id: 0, host: "host1:27017", priority: 2 },
    { _id: 1, host: "host2:27017", priority: 1 },
    { _id: 2, host: "host3:27017", priority: 1 }
  ]
})
```

4. **Check status:**
```javascript
rs.status()
```

### Replica Set Best Practices

1. **Member Count**
   - Use odd numbers (3, 5, 7) for voting members
   - Minimum 3 members for high availability
   - Maximum 7 voting members (50 total members)

2. **Geographic Distribution**
   - Place members in different data centers
   - Use priority to control which member becomes primary
   - Configure read preference for load distribution

3. **Arbiter Usage**
   - Use arbiter for tie-breaking in even-member sets
   - Arbiters don't store data (lightweight)
   - Place arbiter in separate location

4. **Monitoring**
   - Monitor replica lag
   - Alert on member health changes
   - Track oplog size and growth

---

## 💡 Best Practices

### Development

1. **Use Local MongoDB**
   ```bash
   # Start MongoDB without auth initially
   mongod --dbpath C:\data\db

   # Run security setup
   npm run db:setup-security

   # Enable auth and restart
   npm run db:enable-auth
   ```

2. **Test Connection**
   ```bash
   # Test with mongosh
   mongosh "mongodb://noctural_app_dev:PASSWORD@localhost:27017/noctural_dev?authSource=noctural_dev"

   # Test with application
   npm start
   ```

### Production

1. **Use Managed Service**
   - MongoDB Atlas (recommended)
   - AWS DocumentDB
   - Azure Cosmos DB

2. **Enable TLS/SSL**
   ```env
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/database?retryWrites=true&w=majority
   ```

3. **Configure Backups**
   - Automated daily backups
   - Point-in-time recovery
   - Backup retention policy (30+ days)
   - Test restore procedures

4. **Monitor Performance**
   - Set up monitoring alerts
   - Track slow queries
   - Monitor connection pool usage
   - Alert on replica lag

5. **Security Hardening**
   - Enable IP whitelisting
   - Use VPN or private network
   - Enable audit logging
   - Regular security updates

---

## 🔧 Troubleshooting

### Authentication Failed

**Error:**
```
MongoServerError: Authentication failed
```

**Solutions:**
1. Verify username and password
2. Check authSource matches database
3. Ensure user exists in correct database
4. Verify MongoDB auth is enabled

**Test:**
```bash
mongosh "mongodb://username:password@localhost:27017/database?authSource=database"
```

### Connection Timeout

**Error:**
```
MongoServerSelectionError: Server selection timed out
```

**Solutions:**
1. Verify MongoDB is running
2. Check firewall rules
3. Verify connection string
4. Check network connectivity

**Test:**
```bash
# Test MongoDB is running
mongosh --eval "db.adminCommand('ping')"

# Check port is open
telnet localhost 27017
```

### Insufficient Permissions

**Error:**
```
MongoServerError: not authorized on database to execute command
```

**Solutions:**
1. Verify user has correct role
2. Check database name in connection string
3. Use admin user to grant permissions

**Fix:**
```javascript
// Connect as admin
mongosh -u nocturnal_admin -p PASSWORD --authenticationDatabase admin

// Grant permissions
use noctural_dev
db.createUser({
  user: "noctural_app_dev",
  pwd: "password",
  roles: [{ role: "readWrite", db: "noctural_dev" }]
})
```

### Replica Set Issues

**Error:**
```
MongoServerError: not master
```

**Solutions:**
1. Check replica set status: `rs.status()`
2. Verify connection string includes all members
3. Ensure replicaSet parameter is correct
4. Check network connectivity between members

---

## 📊 Security Checklist

### Initial Setup
- [ ] Run `npm run db:setup-security`
- [ ] Save `mongodb-credentials.json` securely
- [ ] Add `mongodb-credentials.json` to `.gitignore`
- [ ] Enable authentication in `mongod.conf`
- [ ] Restart MongoDB service
- [ ] Update `.env` with connection string
- [ ] Test application connection

### Production Deployment
- [ ] Create production database user
- [ ] Configure replica set (3+ members)
- [ ] Enable TLS/SSL encryption
- [ ] Configure IP whitelisting
- [ ] Set up automated backups
- [ ] Configure monitoring and alerts
- [ ] Test failover procedures
- [ ] Document disaster recovery plan

### Ongoing Maintenance
- [ ] Rotate passwords every 90 days
- [ ] Review user permissions quarterly
- [ ] Monitor slow queries
- [ ] Check replica set health daily
- [ ] Test backup restores monthly
- [ ] Update MongoDB security patches
- [ ] Audit database access logs

---

## 📚 Additional Resources

- **MongoDB Security Checklist:** https://docs.mongodb.com/manual/administration/security-checklist/
- **Authentication Mechanisms:** https://docs.mongodb.com/manual/core/authentication/
- **Replica Sets:** https://docs.mongodb.com/manual/replication/
- **Connection String Options:** https://docs.mongodb.com/manual/reference/connection-string/
- **Production Notes:** https://docs.mongodb.com/manual/administration/production-notes/

---

## 🆘 Support

If you encounter issues:

1. Check MongoDB logs: `C:\Program Files\MongoDB\Server\8.0\log\mongod.log`
2. Review application logs: `./logs/`
3. Test connection with mongosh
4. Verify firewall and network settings

---

**Last Updated:** November 2024
**Next Review:** February 2025
