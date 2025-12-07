# MongoDB Authentication Setup Guide

## Current Status
- MongoDB is currently running WITHOUT authentication
- Database URI uses unauthenticated connection

## Steps to Enable MongoDB Authentication

### 1. Connect to MongoDB Shell
```bash
mongosh
```

### 2. Switch to Admin Database
```javascript
use admin
```

### 3. Create Admin User
```javascript
db.createUser({
  user: "admin",
  pwd: "YOUR_STRONG_ADMIN_PASSWORD_HERE",
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    { role: "readWriteAnyDatabase", db: "admin" },
    { role: "dbAdminAnyDatabase", db: "admin" }
  ]
})
```

### 4. Create Development Database User
```javascript
use nocturnal_dev

db.createUser({
  user: "nocturnaldev",
  pwd: "CHANGE_THIS_PASSWORD",
  roles: [
    { role: "readWrite", db: "nocturnal_dev" },
    { role: "dbAdmin", db: "nocturnal_dev" }
  ]
})
```

### 5. Create Production Database User (if applicable)
```javascript
use nocturnal_prod

db.createUser({
  user: "nocturnalprod",
  pwd: "STRONG_PRODUCTION_PASSWORD_HERE",
  roles: [
    { role: "readWrite", db: "nocturnal_prod" },
    { role: "dbAdmin", db: "nocturnal_prod" }
  ]
})
```

### 6. Enable Authentication in MongoDB

#### For MongoDB Running as Service (Windows):
1. Locate your MongoDB configuration file (usually `C:\Program Files\MongoDB\Server\<version>\bin\mongod.cfg`)
2. Add or update the security section:
```yaml
security:
  authorization: enabled
```
3. Restart MongoDB service:
```bash
net stop MongoDB
net start MongoDB
```

#### For MongoDB Running Manually:
Stop MongoDB and restart with authentication:
```bash
mongod --auth --dbpath /path/to/your/data
```

### 7. Update Environment Files
After creating the database users, update the passwords in:
- `.env`
- `.env.development`
- `.env.production`

Replace `CHANGE_THIS_PASSWORD` with the actual password you set for `nocturnaldev` user.

### 8. Test Connection
```bash
# Test from command line
mongosh "mongodb://nocturnaldev:YOUR_PASSWORD@localhost:27017/nocturnal_dev?authSource=admin"

# Or start your application and verify it connects successfully
npm start
```

## Security Best Practices

1. **Strong Passwords**: Use complex passwords with:
   - Minimum 16 characters
   - Mix of uppercase, lowercase, numbers, and special characters
   - Generate using: `node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"`

2. **Separate Users**: Different users for different environments/purposes

3. **Principle of Least Privilege**: Grant only necessary permissions

4. **Regular Rotation**: Change passwords periodically

5. **Audit Logging**: Enable MongoDB audit logging in production

## Troubleshooting

### Authentication Failed Error
- Verify username and password are correct
- Check the authSource parameter in connection string
- Ensure user exists in the correct database

### Connection Timeout
- Verify MongoDB service is running
- Check firewall settings
- Verify network connectivity

### Access Denied
- Verify user has correct roles/permissions
- Check if authentication is properly enabled in MongoDB config
