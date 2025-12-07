# Deployment Guide - Nocturnal Platform

Complete deployment guide for production environments including Docker, traditional servers, and cloud platforms.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Docker Deployment](#docker-deployment)
- [Traditional Server Deployment](#traditional-server-deployment)
- [Cloud Platform Deployment](#cloud-platform-deployment)
- [Database Setup](#database-setup)
- [SSL/TLS Configuration](#ssltls-configuration)
- [Monitoring Setup](#monitoring-setup)
- [Backup Strategy](#backup-strategy)
- [Rollback Procedures](#rollback-procedures)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software
- Node.js 18.x or higher (22.x recommended)
- MongoDB 6.x or higher (8.x recommended)
- Redis 6.x or higher (optional but recommended)
- PM2 (for process management)
- Nginx (for reverse proxy)

### System Requirements
- **Minimum**: 2 CPU cores, 4GB RAM, 20GB storage
- **Recommended**: 4+ CPU cores, 8GB+ RAM, 50GB+ storage
- **Operating System**: Ubuntu 22.04 LTS or similar

### Network Requirements
- Open ports: 80 (HTTP), 443 (HTTPS), 5000 (application - internal)
- Firewall configured for inbound/outbound traffic
- Domain name with DNS configured

## Environment Configuration

### Production Environment Variables

Create a `.env` file with production values:

```env
# Server Configuration
NODE_ENV=production
PORT=5000
JWT_SECRET=<generate-strong-random-secret-64-chars>
JWT_EXPIRE=7d

# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/nocturnal?retryWrites=true&w=majority
MONGODB_READ_PREFERENCE=primaryPreferred
MONGODB_WRITE_CONCERN_W=majority
MONGODB_WRITE_CONCERN_TIMEOUT=5000
MONGODB_READ_CONCERN=majority

# Redis Configuration
REDIS_ENABLED=true
REDIS_HOST=redis.yourdomain.com
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>
REDIS_DB=0

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
WHITELISTED_IPS=your.server.ip.address

# File Upload
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=<app-specific-password>
FROM_EMAIL=noreply@nocturnal.com
FROM_NAME=Nocturnal Platform

# Client URL
CLIENT_URL=https://yourdomain.com

# Monitoring
LOG_LEVEL=info
ENABLE_MONITORING=true
```

### Security Best Practices

1. **Generate Strong Secrets**:
```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate API keys
openssl rand -hex 32
```

2. **Restrict File Permissions**:
```bash
chmod 600 .env
chown app-user:app-user .env
```

3. **Use Environment-Specific Configs**:
- Development: `.env.development`
- Staging: `.env.staging`
- Production: `.env.production`

## Docker Deployment

### 1. Create Dockerfile

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Build frontend
RUN cd client && npm ci && npm run build:optimize && cd ..

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["npm", "start"]
```

### 2. Create docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: nocturnal-app:latest
    container_name: nocturnal-app
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/nocturnal
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    env_file:
      - .env
    depends_on:
      mongo:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  mongo:
    image: mongo:8
    container_name: nocturnal-mongo
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
      MONGO_INITDB_DATABASE: nocturnal
    volumes:
      - mongo-data:/data/db
      - mongo-config:/data/configdb
      - ./docker/mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
    networks:
      - app-network
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/nocturnal --quiet
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 40s

  redis:
    image: redis:7-alpine
    container_name: nocturnal-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  nginx:
    image: nginx:alpine
    container_name: nocturnal-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/ssl:/etc/nginx/ssl:ro
      - ./client/public:/usr/share/nginx/html:ro
    depends_on:
      - app
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  mongo-data:
    driver: local
  mongo-config:
    driver: local
  redis-data:
    driver: local
```

### 3. Deploy with Docker

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# Stop and remove volumes (CAREFUL - deletes data)
docker-compose down -v
```

### 4. Docker Production Best Practices

```bash
# Use Docker secrets
echo "your-db-password" | docker secret create db_password -

# Limit resources
docker-compose up -d --scale app=3 --memory="2g" --cpus="2"

# Enable auto-restart
docker update --restart=unless-stopped nocturnal-app

# Prune unused resources
docker system prune -a --volumes
```

## Traditional Server Deployment

### 1. Server Setup (Ubuntu 22.04)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v22.x.x
npm --version

# Install build essentials
sudo apt-get install -y build-essential
```

### 2. Install MongoDB

```bash
# Import MongoDB GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-8.0.asc | sudo apt-key add -

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list

# Install MongoDB
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Verify MongoDB is running
sudo systemctl status mongod

# Secure MongoDB
mongosh <<EOF
use admin
db.createUser({
  user: "admin",
  pwd: "secure-password-here",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})
EOF

# Enable authentication
sudo nano /etc/mongod.conf
# Add:
# security:
#   authorization: enabled

sudo systemctl restart mongod
```

### 3. Install Redis

```bash
# Install Redis
sudo apt install -y redis-server

# Configure Redis
sudo nano /etc/redis/redis.conf
# Set: requirepass your-redis-password
# Set: maxmemory 256mb
# Set: maxmemory-policy allkeys-lru

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify Redis
redis-cli ping  # Should return PONG
```

### 4. Install PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Configure PM2 to start on boot
pm2 startup systemd
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
```

### 5. Deploy Application

```bash
# Create application directory
sudo mkdir -p /var/www/nocturnal
sudo chown $USER:$USER /var/www/nocturnal

# Clone repository
cd /var/www
git clone https://github.com/yourusername/nocturnal.git
cd nocturnal

# Install dependencies
npm install

# Build frontend
cd client
npm install
npm run build:optimize
cd ..

# Configure environment
cp .env.example .env
nano .env  # Edit with production values

# Create PM2 ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'nocturnal',
    script: './server.js',
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    time: true
  }]
};
EOF

# Start application with PM2
pm2 start ecosystem.config.js
pm2 save

# Monitor application
pm2 monit
```

### 6. Install and Configure Nginx

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/nocturnal

# Add configuration:
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration (will be added by Certbot)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Logs
    access_log /var/log/nginx/nocturnal-access.log;
    error_log /var/log/nginx/nocturnal-error.log;

    # Proxy settings
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files
    location /static {
        alias /var/www/nocturnal/client/dist;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API docs
    location /api-docs {
        proxy_pass http://localhost:5000/api-docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # File upload limit
    client_max_body_size 10M;
}

# Enable site
sudo ln -s /etc/nginx/sites-available/nocturnal /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

## SSL/TLS Configuration

### Using Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal test
sudo certbot renew --dry-run

# Certbot auto-renews via cron
sudo systemctl status certbot.timer
```

### Manual SSL Certificate

```bash
# Copy certificate files
sudo mkdir -p /etc/nginx/ssl
sudo cp your-cert.crt /etc/nginx/ssl/
sudo cp your-key.key /etc/nginx/ssl/

# Set permissions
sudo chmod 600 /etc/nginx/ssl/*

# Update Nginx config with certificate paths
```

## Monitoring Setup

### PM2 Monitoring

```bash
# PM2 monitoring
pm2 monitor

# PM2 logs
pm2 logs --lines 100

# PM2 metrics
pm2 describe nocturnal

# PM2 web dashboard
pm2 web
```

### Log Rotation

```bash
# Install logrotate
sudo apt install logrotate

# Create logrotate config
sudo nano /etc/logrotate.d/nocturnal

/var/www/nocturnal/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 nodejs nodejs
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

## Backup Strategy

### Database Backups

```bash
# Create backup script
cat > /usr/local/bin/backup-nocturnal.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/backups/nocturnal
DATE=$(date +%Y%m%d_%H%M%S)
MONGODB_URI="mongodb://username:password@localhost:27017/nocturnal"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup MongoDB
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/mongo_$DATE"

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/nocturnal/uploads

# Delete backups older than 7 days
find $BACKUP_DIR -mtime +7 -delete

# Upload to S3 (optional)
# aws s3 sync $BACKUP_DIR s3://your-bucket/backups/
EOF

# Make executable
chmod +x /usr/local/bin/backup-nocturnal.sh

# Add to crontab (daily at 2 AM)
(crontab -l ; echo "0 2 * * * /usr/local/bin/backup-nocturnal.sh") | crontab -
```

### Restore from Backup

```bash
# Restore MongoDB
mongorestore --uri="mongodb://username:password@localhost:27017/nocturnal" /backups/nocturnal/mongo_20250101_020000/nocturnal

# Restore uploads
tar -xzf /backups/nocturnal/uploads_20250101_020000.tar.gz -C /
```

## Rollback Procedures

### Using Git

```bash
# View deployment history
cd /var/www/nocturnal
git log --oneline -10

# Rollback to previous version
git checkout <commit-hash>

# Reinstall dependencies
npm install

# Restart application
pm2 restart nocturnal
```

### Using PM2

```bash
# Save current version
pm2 save --force

# Deploy new version
pm2 deploy production

# Rollback if needed
pm2 deploy production revert 1
```

## Troubleshooting

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs nocturnal --err --lines 100

# Check system logs
journalctl -u mongod -n 50
journalctl -u redis-server -n 50

# Check ports
sudo netstat -tlnp | grep 5000
sudo netstat -tlnp | grep 27017

# Check disk space
df -h

# Check memory
free -h
```

### Database Connection Issues

```bash
# Test MongoDB connection
mongosh --host localhost --port 27017 -u admin -p

# Check MongoDB status
sudo systemctl status mongod

# View MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Restart MongoDB
sudo systemctl restart mongod
```

### Performance Issues

```bash
# Check server load
top
htop

# Check PM2 metrics
pm2 monit

# Check MongoDB performance
mongosh --eval "db.serverStatus()"

# Check Redis memory
redis-cli INFO memory

# Check Nginx access
sudo tail -f /var/log/nginx/nocturnal-access.log
```

### Security Issues

```bash
# Check failed login attempts
grep "Failed login" /var/www/nocturnal/logs/security.log

# Check firewall status
sudo ufw status

# Update dependencies
npm audit
npm audit fix

# Check SSL certificate expiry
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

## Health Checks

### API Health Check

```bash
curl https://yourdomain.com/api/health

# Expected response:
# {"status":"ok","message":"Server is running"}
```

### Database Health Check

```bash
curl https://yourdomain.com/api/admin/health

# Requires authentication
```

### Automated Monitoring

```bash
# Create health check script
cat > /usr/local/bin/health-check.sh << 'EOF'
#!/bin/bash
HEALTH_URL="https://yourdomain.com/api/health"
SLACK_WEBHOOK="your-slack-webhook-url"

if ! curl -sf $HEALTH_URL > /dev/null; then
    curl -X POST $SLACK_WEBHOOK -H 'Content-Type: application/json' \
        -d '{"text":"🚨 Nocturnal API is DOWN!"}'
fi
EOF

chmod +x /usr/local/bin/health-check.sh

# Run every 5 minutes
(crontab -l ; echo "*/5 * * * * /usr/local/bin/health-check.sh") | crontab -
```

## Support

For deployment support:
- Email: devops@nocturnal.com
- Documentation: https://docs.nocturnal.com
- GitHub Issues: https://github.com/yourusername/nocturnal/issues
