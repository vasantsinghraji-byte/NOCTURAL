# PM2 Process Management Guide

Complete guide for running Nocturnal with PM2 for production-grade process management.

## Table of Contents
1. [Features](#features)
2. [Quick Start](#quick-start)
3. [NPM Scripts](#npm-scripts)
4. [PM2 Commands](#pm2-commands)
5. [Production Deployment](#production-deployment)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)

---

## Features

PM2 provides production-ready features:

✅ **Auto-restart on crash** - Automatically restarts if the app crashes
✅ **Cluster mode** - Runs multiple instances for load balancing
✅ **Zero-downtime reloads** - Update app without interrupting service
✅ **Memory monitoring** - Auto-restart if memory exceeds limit (500MB)
✅ **Graceful shutdown** - Clean exit with database/connection cleanup
✅ **Log management** - Centralized logging with rotation
✅ **Process monitoring** - CPU, memory, and uptime metrics
✅ **Auto-startup** - Restart processes after system reboot

---

## Quick Start

### 1. Development Mode (Single Instance)

```bash
# Start with PM2
npm run pm2:start

# View logs
npm run pm2:logs

# Monitor processes
npm run pm2:monit

# Stop
npm run pm2:stop
```

### 2. Production Mode (Cluster Mode)

```bash
# Start in production mode (uses all CPU cores)
npm run pm2:start:prod

# Check status
npm run pm2:status

# View logs
npm run pm2:logs

# Monitor
npm run pm2:monit
```

---

## NPM Scripts

### Starting & Stopping

```bash
npm run pm2:start          # Start in development mode (1 instance)
npm run pm2:start:prod     # Start in production mode (cluster, all CPUs)
npm run pm2:stop           # Stop all instances
npm run pm2:restart        # Hard restart (brief downtime)
npm run pm2:reload         # Zero-downtime reload (production)
npm run pm2:delete         # Delete from PM2 process list
```

### Monitoring & Logs

```bash
npm run pm2:logs           # View real-time logs
npm run pm2:monit          # Interactive monitoring dashboard
npm run pm2:status         # Show process status
npm run pm2:flush          # Clear all log files
npm run pm2:reset          # Reset restart count
```

### System Integration

```bash
npm run pm2:save           # Save current process list
npm run pm2:startup        # Configure auto-startup on system boot
```

---

## PM2 Commands

### Advanced Usage

#### View Specific Process Info
```bash
pm2 info nocturnal-api
pm2 describe nocturnal-api
```

#### Scale Instances
```bash
pm2 scale nocturnal-api 4      # Run exactly 4 instances
pm2 scale nocturnal-api +2     # Add 2 more instances
pm2 scale nocturnal-api -1     # Remove 1 instance
```

#### Log Management
```bash
pm2 logs nocturnal-api --lines 100     # Last 100 lines
pm2 logs nocturnal-api --err           # Only errors
pm2 logs nocturnal-api --out           # Only stdout
pm2 logs nocturnal-api --raw           # Raw logs (no formatting)
```

#### Process Management
```bash
pm2 restart nocturnal-api --update-env    # Restart with updated .env
pm2 reload nocturnal-api --update-env     # Reload with updated .env
pm2 stop nocturnal-api                    # Stop
pm2 start nocturnal-api                   # Start
pm2 delete nocturnal-api                  # Remove from PM2
```

#### Monitoring
```bash
pm2 monit                              # Interactive monitoring
pm2 list                               # List all processes
pm2 status                             # Process status table
pm2 web                                # Web dashboard (port 9615)
```

---

## Production Deployment

### Step 1: Initial Setup on Server

```bash
# Clone repository
git clone <repo-url>
cd nocturnal

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env  # Edit with production values
```

### Step 2: Configure Auto-Startup

```bash
# Generate startup script for your OS
npm run pm2:startup

# Follow the instructions output by PM2
# Usually something like:
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u <your-user> --hp /home/<your-user>

# Start the application
npm run pm2:start:prod

# Save the process list (so it restarts after reboot)
npm run pm2:save
```

### Step 3: Verify Deployment

```bash
# Check status
npm run pm2:status

# Should show something like:
# ┌─────┬──────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
# │ id  │ name         │ mode     │ ↺    │ status    │ cpu      │ memory   │
# ├─────┼──────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
# │ 0   │ nocturnal-api │ cluster  │ 0    │ online    │ 0%       │ 45.2mb   │
# │ 1   │ nocturnal-api │ cluster  │ 0    │ online    │ 0%       │ 43.8mb   │
# │ 2   │ nocturnal-api │ cluster  │ 0    │ online    │ 0%       │ 44.1mb   │
# │ 3   │ nocturnal-api │ cluster  │ 0    │ online    │ 0%       │ 42.9mb   │
# └─────┴──────────────┴──────────┴──────┴───────────┴──────────┴──────────┘

# View logs
npm run pm2:logs

# Monitor
npm run pm2:monit
```

### Step 4: Configure Nginx (Reverse Proxy)

```nginx
# /etc/nginx/sites-available/nocturnal

upstream nocturnal_backend {
    # PM2 will handle load balancing across instances
    server 127.0.0.1:5000;
    keepalive 64;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://nocturnal_backend;
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
}
```

### Step 5: Zero-Downtime Deployments

```bash
# SSH into server
ssh user@your-server.com

# Navigate to app directory
cd /var/www/nocturnal

# Pull latest code
git pull origin main

# Install dependencies (if package.json changed)
npm install --production

# Reload app with zero downtime
npm run pm2:reload

# Verify
npm run pm2:status
npm run pm2:logs
```

---

## Monitoring

### Real-Time Monitoring

```bash
# Interactive dashboard
npm run pm2:monit

# Shows:
# - CPU usage per process
# - Memory usage per process
# - Process uptime
# - Restart count
# - Real-time logs
```

### Web Dashboard

```bash
# Start web dashboard
pm2 web

# Access at: http://localhost:9615
# Or expose via Nginx for remote access
```

### Logs

```bash
# All logs
npm run pm2:logs

# Last 100 lines
pm2 logs nocturnal-api --lines 100

# Error logs only
pm2 logs nocturnal-api --err

# Output logs only
pm2 logs nocturnal-api --out

# JSON format
pm2 logs nocturnal-api --json

# Clear logs
npm run pm2:flush
```

### Metrics

```bash
# Process info
pm2 info nocturnal-api

# Shows:
# - Process ID
# - Uptime
# - Restart count
# - Memory usage
# - CPU usage
# - Environment variables
# - Log file locations
```

---

## Troubleshooting

### Issue: App Keeps Restarting

```bash
# Check error logs
pm2 logs nocturnal-api --err --lines 50

# Check process info
pm2 info nocturnal-api

# Common causes:
# 1. Port already in use
# 2. Database connection failed
# 3. Missing environment variables
# 4. Memory limit exceeded
```

### Issue: Cannot Connect to Database

```bash
# Check MongoDB connection
mongosh --host localhost --port 27017

# Verify .env file
cat .env | grep MONGO

# Check logs
pm2 logs nocturnal-api --lines 50
```

### Issue: High Memory Usage

```bash
# Check current memory
pm2 list

# View memory over time
pm2 monit

# If memory leak suspected:
# 1. Update max_memory_restart in ecosystem.config.js
# 2. Investigate with Node.js profiler
# 3. Check for unclosed connections
```

### Issue: Port Already in Use

```bash
# Find process using port 5000
# Windows:
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/Mac:
lsof -i :5000
kill -9 <PID>

# Then restart
npm run pm2:restart
```

### Issue: PM2 Not Starting on Reboot

```bash
# Reconfigure startup
npm run pm2:startup

# Follow the instructions (run the sudo command)

# Save current process list
npm run pm2:save

# Test by rebooting
sudo reboot

# After reboot, check:
npm run pm2:status
```

### Issue: Zero-Downtime Reload Not Working

```bash
# Ensure wait_ready is enabled in ecosystem.config.js
# Verify server.js sends 'ready' signal:
if (process.send) {
  process.send('ready');
}

# Use reload instead of restart
npm run pm2:reload

# If still not working, check:
pm2 logs nocturnal-api --lines 100
```

---

## Configuration Reference

### ecosystem.config.js

Key configuration options:

```javascript
{
  name: 'nocturnal-api',              // App name in PM2
  script: './server.js',              // Entry point
  instances: 'max',                   // Number of instances (max = all CPUs)
  exec_mode: 'cluster',               // cluster or fork
  autorestart: true,                  // Auto-restart on crash
  watch: false,                       // Watch file changes (dev only)
  max_restarts: 10,                   // Max restarts in 1 minute
  min_uptime: '10s',                  // Min uptime before stable
  max_memory_restart: '500M',         // Restart if exceeds 500MB
  kill_timeout: 5000,                 // Graceful shutdown timeout
  wait_ready: true,                   // Wait for ready signal
  listen_timeout: 10000,              // Startup timeout
}
```

---

## Best Practices

### 1. Development vs Production

**Development:**
```bash
# Single instance, easier debugging
npm run pm2:start
```

**Production:**
```bash
# Cluster mode, maximum performance
npm run pm2:start:prod
```

### 2. Deployment Workflow

```bash
# 1. Test locally
npm run dev

# 2. Start with PM2
npm run pm2:start

# 3. Run tests
npm test

# 4. Deploy to production
git push origin main

# 5. SSH into server and reload
ssh server
cd /var/www/nocturnal
git pull
npm run pm2:reload
```

### 3. Log Management

```bash
# View logs regularly
npm run pm2:logs

# Clear old logs weekly
npm run pm2:flush

# Use log rotation (configure in ecosystem.config.js)
```

### 4. Monitoring

```bash
# Check status daily
npm run pm2:status

# Monitor performance
npm run pm2:monit

# Set up alerts (PM2 Plus - optional paid service)
```

### 5. Graceful Shutdown

Always use `pm2 reload` instead of `pm2 restart` in production:
```bash
# Bad (brief downtime)
npm run pm2:restart

# Good (zero downtime)
npm run pm2:reload
```

---

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [PM2 Cluster Mode](https://pm2.keymetrics.io/docs/usage/cluster-mode/)
- [PM2 Process Management](https://pm2.keymetrics.io/docs/usage/process-management/)
- [PM2 Log Management](https://pm2.keymetrics.io/docs/usage/log-management/)

---

## Support

For issues or questions:
1. Check logs: `npm run pm2:logs`
2. Check status: `npm run pm2:status`
3. Review this guide
4. Check PM2 documentation

---

**Last Updated:** 2025
**Nocturnal Platform** - Healthcare Night Duty Management
