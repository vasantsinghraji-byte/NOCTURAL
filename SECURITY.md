# Nocturnal Platform - Security Documentation

## 🔐 Security Overview

The Nocturnal Healthcare Staffing Platform implements enterprise-grade security measures following OWASP Top 10 guidelines and industry best practices.

**Security Status:** ✅ Production-Ready
**Last Updated:** November 2024
**Security Level:** Enterprise-Grade

---

## 📋 Table of Contents

1. [Secrets Management](#secrets-management)
2. [Rate Limiting & DDoS Protection](#rate-limiting--ddos-protection)
3. [Input Validation](#input-validation)
4. [Security Headers](#security-headers)
5. [Attack Prevention](#attack-prevention)
6. [Security Monitoring](#security-monitoring)
7. [Automated Security Testing](#automated-security-testing)
8. [Security Best Practices](#security-best-practices)

---

## 🔑 Secrets Management

### HashiCorp Vault Integration

**Files:**
- [config/vault.js](config/vault.js) - Vault client and manager
- [scripts/init-vault.js](scripts/init-vault.js) - Vault initialization
- [scripts/rotate-secrets.js](scripts/rotate-secrets.js) - Secret rotation
- [scripts/re-encrypt-data.js](scripts/re-encrypt-data.js) - Data re-encryption

### Setup Vault

```bash
# 1. Start Vault (dev mode)
vault server -dev

# 2. Set environment variables
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='your-token'

# 3. Initialize secrets in Vault
node scripts/init-vault.js

# 4. Enable Vault in .env
VAULT_ENABLED=true
VAULT_ADDR=http://127.0.0.1:8200
VAULT_TOKEN=your-token
```

### Rotate Secrets

```bash
# Rotate all secrets
node scripts/rotate-secrets.js --all

# Rotate specific secrets
node scripts/rotate-secrets.js --jwt
node scripts/rotate-secrets.js --encryption
node scripts/rotate-secrets.js --database

# Re-encrypt data after key rotation
node scripts/re-encrypt-data.js
```

### Features

- ✅ Automatic secret caching (5-minute timeout)
- ✅ Grace period support for old secrets
- ✅ Automatic cleanup of expired secrets
- ✅ Fallback to environment variables
- ✅ Encrypted storage for sensitive data

---

## 🚦 Rate Limiting & DDoS Protection

### Enhanced Rate Limiting

**File:** [middleware/rateLimitEnhanced.js](middleware/rateLimitEnhanced.js)

### Rate Limiters Available

| Limiter | Window | Max Requests | Use Case |
|---------|--------|--------------|----------|
| `globalRateLimiter` | 15 min | 1000 | All endpoints |
| `strictRateLimiter` | 15 min | 5 | Sensitive operations |
| `authRateLimiter` | 15 min | 5 | Login/Register |
| `passwordResetRateLimiter` | 1 hour | 3 | Password reset |
| `apiRateLimiter` | 15 min | 100 | General API |
| `uploadRateLimiter` | 1 hour | 10 | File uploads |
| `searchRateLimiter` | 1 min | 30 | Search queries |
| `paymentRateLimiter` | 1 hour | 3 | Payments |
| `adaptiveRateLimiter` | Dynamic | Dynamic | Role-based |

### Usage

```javascript
const {
  authRateLimiter,
  apiRateLimiter,
  ddosProtection
} = require('./middleware/rateLimitEnhanced');

// Apply to routes
router.post('/login', authRateLimiter, loginController);
router.get('/api/*', apiRateLimiter, apiController);

// Enable DDoS protection
app.use(ddosProtection);
```

### DDoS Protection Features

- ✅ IP-based request tracking
- ✅ Automatic blacklisting (1-hour duration)
- ✅ Threshold: 100 requests/minute
- ✅ Real-time threat detection
- ✅ Automatic alert generation

### Redis Support

Rate limiting automatically uses Redis if available for distributed rate limiting across multiple servers.

```env
REDIS_URL=redis://localhost:6379
```

---

## ✅ Input Validation

### Validation Schemas

**Files:**
- [validators/authValidator.js](validators/authValidator.js) - Authentication
- [validators/dutyValidator.js](validators/dutyValidator.js) - Duties/Shifts
- [validators/userValidator.js](validators/userValidator.js) - User profiles

### Features

- ✅ Comprehensive validation rules
- ✅ Sanitization and normalization
- ✅ Custom validators
- ✅ Error message formatting
- ✅ Security checks (SQL injection, XSS, etc.)

### Usage

```javascript
const { validateRegister } = require('./validators/authValidator');

router.post('/register', validateRegister, registerController);
```

### Validation Rules

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Not a common password

**Email Requirements:**
- Valid email format
- No disposable email domains
- Normalized format

**Input Sanitization:**
- HTML escape
- SQL injection prevention
- XSS prevention
- Path traversal prevention

---

## 🛡️ Security Headers

### Comprehensive Headers

**File:** [middleware/security.js](middleware/security.js)

### Implemented Headers

1. **Content Security Policy (CSP)**
   - Restricts resource loading
   - Prevents XSS attacks
   - Configurable per environment

2. **Strict Transport Security (HSTS)**
   - Forces HTTPS
   - 1-year max-age
   - Includes subdomains
   - Preload ready

3. **X-Frame-Options: DENY**
   - Prevents clickjacking
   - Blocks iframe embedding

4. **X-Content-Type-Options: nosniff**
   - Prevents MIME sniffing

5. **X-XSS-Protection**
   - Enables browser XSS filter

6. **Referrer-Policy**
   - Controls referrer information

7. **Permissions-Policy**
   - Controls browser features
   - Restricts geolocation, camera, microphone, etc.

8. **Cross-Origin Policies**
   - CORP, COEP, COOP configured

### Usage

```javascript
const {
  securityHeaders,
  corsConfig,
  detectSuspiciousRequests
} = require('./middleware/security');

const cors = require('cors');

app.use(securityHeaders());
app.use(cors(corsConfig()));
app.use(detectSuspiciousRequests);
```

---

## ⚔️ Attack Prevention

### Protections Implemented

**1. SQL Injection**
- Input validation
- Parameterized queries (Mongoose)
- Pattern detection and blocking

**2. XSS (Cross-Site Scripting)**
- Input sanitization
- Output encoding
- CSP headers
- Pattern detection

**3. CSRF (Cross-Site Request Forgery)**
- CORS configuration
- Token-based authentication
- SameSite cookies

**4. Path Traversal**
- Input validation
- Pattern detection
- Blocked directory access

**5. Command Injection**
- Input validation
- Shell character blocking
- Pattern detection

**6. Brute Force**
- Rate limiting
- Account lockout
- Failed login tracking

**7. Parameter Pollution**
- Array length limits
- Duplicate parameter detection

---

## 📊 Security Monitoring

### Real-Time Dashboard

**Files:**
- [routes/security.js](routes/security.js) - Dashboard API
- [utils/securityMonitor.js](utils/securityMonitor.js) - Monitoring utility

### Dashboard Features

Access at: `GET /api/security/dashboard` (Admin only)

**Metrics:**
- Total events (last 24 hours)
- Open incidents
- Blocked IPs
- Severity breakdown
- Top threat types
- Top attacking IPs
- Recent incidents

### API Endpoints

```
GET  /api/security/dashboard        - Dashboard overview
GET  /api/security/metrics          - Security metrics
GET  /api/security/incidents        - Incidents log
GET  /api/security/incidents/:id    - Incident details
POST /api/security/incidents/:id/resolve - Resolve incident
GET  /api/security/blocked-ips      - Blocked IPs list
POST /api/security/blocked-ips      - Block IP
DELETE /api/security/blocked-ips/:ip - Unblock IP
GET  /api/security/threats          - Threat summary
GET  /api/security/audit-log        - Audit log
GET  /api/security/rate-limits      - Rate limit stats
POST /api/security/rate-limits/reset - Reset rate limit
GET  /api/security/health           - Security health
```

### Incident Management

**Incident Severity Levels:**
- Critical
- High
- Medium
- Low

**Incident Statuses:**
- Open
- Investigating
- Resolved
- Closed

### Security Events Tracked

- Authentication attempts
- Failed logins
- Rate limit violations
- Suspicious requests
- IP blocks
- Access denials
- Configuration changes
- Administrative actions

---

## 🔍 Automated Security Testing

### OWASP ZAP Integration

**File:** [scripts/security-scan.js](scripts/security-scan.js)

### Prerequisites

```bash
# 1. Install OWASP ZAP
# Download from https://www.zaproxy.org/download/

# 2. Install zaproxy package
npm install zaproxy

# 3. Start ZAP in daemon mode
zap.sh -daemon -port 8080 -config api.disablekey=true
```

### Run Security Scans

```bash
# Quick scan (spider only)
node scripts/security-scan.js --target http://localhost:5000

# Full scan (spider + active scan)
node scripts/security-scan.js --target http://localhost:5000 --mode full

# With API key
node scripts/security-scan.js --target http://localhost:5000 --apiKey your-key
```

### Scan Features

- ✅ Automated spidering
- ✅ Active vulnerability scanning
- ✅ Passive vulnerability detection
- ✅ OWASP Top 10 coverage
- ✅ JSON and HTML reports
- ✅ CI/CD integration ready
- ✅ Exit codes for automation

### CI/CD Integration

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on: [push, pull_request]

jobs:
  zap-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Start ZAP
        run: docker run -d -p 8080:8080 owasp/zap2docker-stable zap.sh -daemon -port 8080 -config api.disablekey=true
      - name: Run Security Scan
        run: node scripts/security-scan.js --target ${{ env.TARGET_URL }}
```

---

## 🔒 Security Best Practices

### For Developers

1. **Never commit secrets**
   - Use .env files (gitignored)
   - Use Vault for production
   - Rotate secrets regularly

2. **Validate all input**
   - Use validation schemas
   - Sanitize user input
   - Validate on backend

3. **Use prepared statements**
   - Always use Mongoose queries
   - Never concatenate user input
   - Use parameterized queries

4. **Implement rate limiting**
   - Apply appropriate rate limiters
   - Monitor violations
   - Block malicious IPs

5. **Log security events**
   - Log authentication attempts
   - Log access denials
   - Log configuration changes

### For Administrators

1. **Monitor the security dashboard**
   - Check daily
   - Review incidents
   - Investigate anomalies

2. **Review audit logs regularly**
   - Look for suspicious patterns
   - Track administrative actions
   - Verify access attempts

3. **Keep secrets rotated**
   - Rotate every 90 days
   - Document rotations
   - Test after rotation

4. **Run security scans**
   - Weekly automated scans
   - Monthly manual reviews
   - Fix issues promptly

5. **Update dependencies**
   - Check for vulnerabilities
   - Apply security patches
   - Review changelogs

### For DevOps

1. **Use HTTPS everywhere**
   - Force HTTPS in production
   - Use valid certificates
   - Enable HSTS

2. **Configure firewalls**
   - Whitelist necessary ports
   - Block unnecessary services
   - Use security groups

3. **Enable monitoring**
   - Set up alerts
   - Monitor logs
   - Track metrics

4. **Backup regularly**
   - Automated backups
   - Test restores
   - Secure backup storage

5. **Implement zero-trust**
   - Verify all requests
   - Least privilege principle
   - Network segmentation

---

## 🚨 Incident Response

### When a Security Incident Occurs

1. **Immediate Actions**
   - Block attacking IP
   - Isolate affected systems
   - Preserve evidence
   - Notify team

2. **Investigation**
   - Review logs
   - Identify attack vector
   - Assess damage
   - Document findings

3. **Remediation**
   - Fix vulnerability
   - Patch systems
   - Rotate secrets if compromised
   - Update security measures

4. **Post-Incident**
   - Update documentation
   - Improve monitoring
   - Train team
   - Review and improve

### Emergency Contacts

- Security Team: security@nocturnal.com
- On-Call Engineer: (configured in monitoring)
- Incident Response: incidents@nocturnal.com

---

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP ZAP](https://www.zaproxy.org/)
- [HashiCorp Vault](https://www.vaultproject.io/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)

---

## ✅ Security Checklist

- [x] Secrets management with Vault
- [x] Secret rotation scripts
- [x] Encrypted sensitive data
- [x] Rate limiting (global + endpoint-specific)
- [x] DDoS protection
- [x] Input validation (all endpoints)
- [x] Output sanitization
- [x] Security headers (15+ headers)
- [x] CORS hardening
- [x] SQL injection prevention
- [x] XSS prevention
- [x] CSRF protection
- [x] Path traversal prevention
- [x] Command injection prevention
- [x] Brute force protection
- [x] Session management
- [x] Security monitoring dashboard
- [x] Real-time threat detection
- [x] Incident tracking
- [x] IP blocking/whitelisting
- [x] Audit logging
- [x] OWASP ZAP integration
- [x] Automated security scanning
- [x] CI/CD security integration
- [x] Security documentation
- [x] MongoDB authentication
- [x] Database user permissions (minimal privilege)
- [x] Automated user setup scripts
- [x] Replica set support
- [x] Connection encryption support
- [x] Database security documentation

---

**Security Level:** 🟢 Enterprise-Grade
**Last Security Audit:** November 2024
**Next Audit Due:** February 2025

---

## 🗄️ Database Security

**Status:** ✅ Implementation Complete

### MongoDB Authentication

**Files:**
- [scripts/setup-mongodb-security.js](scripts/setup-mongodb-security.js) - User creation
- [scripts/enable-mongodb-auth.bat](scripts/enable-mongodb-auth.bat) - Authentication enabler
- [scripts/setup-replica-set.js](scripts/setup-replica-set.js) - Replica set configuration
- [DATABASE_SECURITY.md](DATABASE_SECURITY.md) - Complete documentation

### Quick Setup

```bash
# Step 1: Create users with strong passwords
npm run db:setup-security

# Step 2: Enable MongoDB authentication
npm run db:enable-auth

# Step 3: Update .env with credentials
# (Copy from mongodb-credentials.json)

# Step 4: Test connection
npm start
```

### Security Features

- ✅ **Admin User:** Full database administration privileges
- ✅ **Application Users:** Minimal read/write permissions per environment
- ✅ **Strong Passwords:** Auto-generated 32-character passwords
- ✅ **Environment Separation:** Separate users for dev/test/production
- ✅ **Replica Set Support:** High availability configuration
- ✅ **Connection Pooling:** Optimized connection management
- ✅ **Health Monitoring:** Automatic connection health checks
- ✅ **TLS/SSL Ready:** Encrypted transport support

### Connection Strings

**Development:**
```
mongodb://noctural_app_dev:PASSWORD@localhost:27017/noctural_dev?authSource=noctural_dev
```

**Production (Replica Set):**
```
mongodb://noctural_app_prod:PASSWORD@host1,host2,host3/noctural_prod?replicaSet=noctural-rs0&authSource=noctural_prod&retryWrites=true&w=majority
```

**See [DATABASE_SECURITY.md](DATABASE_SECURITY.md) for complete documentation.**

---

**Remember:** Security is an ongoing process. Regularly review and update security measures.
