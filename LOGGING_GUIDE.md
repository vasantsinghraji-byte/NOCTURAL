# Centralized Logging Guide - Nocturnal Healthcare Platform

## Overview

This document describes the centralized logging infrastructure for the Nocturnal healthcare platform using **ELK Stack** (Elasticsearch, Logstash, Kibana) and **Loki Stack** (Loki, Promtail, Grafana).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Application Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Nocturnal API │  │   MongoDB    │  │    Nginx     │     │
│  │  (Winston)   │  │              │  │              │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          └──────────┬───────┴──────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────────┐    ┌───────────────────┐
│   ELK STACK       │    │   LOKI STACK      │
│                   │    │                   │
│  ┌─────────────┐  │    │  ┌─────────────┐  │
│  │  Filebeat   │──┼────┼──│  Promtail   │  │
│  └─────┬───────┘  │    │  └─────┬───────┘  │
│        │          │    │        │          │
│        ▼          │    │        ▼          │
│  ┌─────────────┐  │    │  ┌─────────────┐  │
│  │  Logstash   │  │    │  │    Loki     │  │
│  └─────┬───────┘  │    │  └─────┬───────┘  │
│        │          │    │        │          │
│        ▼          │    │        ▼          │
│  ┌─────────────┐  │    │  ┌─────────────┐  │
│  │Elasticsearch│  │    │  │   Grafana   │  │
│  └─────┬───────┘  │    │  └─────────────┘  │
│        │          │    │                   │
│        ▼          │    └───────────────────┘
│  ┌─────────────┐  │
│  │   Kibana    │  │
│  └─────────────┘  │
│                   │
└───────────────────┘
```

## Quick Start

### Option 1: ELK Stack (Recommended for Production)

```bash
# Start ELK stack
docker-compose -f docker-compose.logging.yml up -d elasticsearch logstash kibana filebeat

# Wait for services to be healthy (2-3 minutes)
docker-compose -f docker-compose.logging.yml ps

# Access Kibana
open http://localhost:5601
```

### Option 2: Loki Stack (Lightweight Alternative)

```bash
# Start Loki stack
docker-compose -f docker-compose.logging.yml up -d loki promtail grafana

# Access Grafana
open http://localhost:3000
# Login: admin/admin
```

### Both Stacks

```bash
# Start all logging services
docker-compose -f docker-compose.logging.yml up -d

# View logs
docker-compose -f docker-compose.logging.yml logs -f
```

## Configuration

### Application Configuration

Add to `.env` file:

```bash
# Logging Configuration
LOG_LEVEL=info
ENABLE_LOGSTASH=true
LOGSTASH_HOST=localhost
LOGSTASH_PORT=5000

# Or use Loki
ENABLE_LOKI=true
LOKI_HOST=http://localhost:3100
```

### Log Levels

- `error` - Error events
- `warn` - Warning events
- `info` - Informational messages (default)
- `http` - HTTP requests
- `verbose` - Detailed information
- `debug` - Debug information
- `silly` - Everything

## Log Types

### 1. HTTP Request Logs

**Format:**
```json
{
  "timestamp": "2025-11-01T10:30:00.000Z",
  "level": "info",
  "message": "HTTP Request",
  "method": "POST",
  "url": "/api/v1/patients/register",
  "status": 201,
  "responseTime": "45ms",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "userId": "6904ebb6361524b67eec1e3e"
}
```

**Usage:**
```javascript
const logger = require('./utils/logger');

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.logRequest(req, res, duration);
  });
  next();
});
```

### 2. Authentication Logs

**Format:**
```json
{
  "timestamp": "2025-11-01T10:30:00.000Z",
  "level": "info",
  "message": "Authentication Event",
  "action": "login",
  "email": "patient@example.com",
  "success": true,
  "reason": null
}
```

**Usage:**
```javascript
logger.logAuth('login', email, true);
logger.logAuth('login', email, false, 'Invalid password');
```

### 3. Payment Logs

**Format:**
```json
{
  "timestamp": "2025-11-01T10:30:00.000Z",
  "level": "info",
  "message": "Payment Event",
  "action": "completed",
  "paymentId": "pay_xxxxxxxxxxxxx",
  "amount": 1499.00,
  "status": "success"
}
```

**Usage:**
```javascript
logger.logPayment('completed', paymentId, amount, 'success');
```

### 4. Security Logs

**Format:**
```json
{
  "timestamp": "2025-11-01T10:30:00.000Z",
  "level": "warn",
  "message": "Security Event",
  "event": "rate_limit_exceeded",
  "ip": "192.168.1.1",
  "endpoint": "/api/v1/auth/login"
}
```

**Usage:**
```javascript
logger.logSecurity('rate_limit_exceeded', {
  ip: req.ip,
  endpoint: req.path
});
```

### 5. Database Logs

**Format:**
```json
{
  "timestamp": "2025-11-01T10:30:00.000Z",
  "level": "info",
  "message": "Database Operation",
  "operation": "create",
  "collection": "patients",
  "success": true,
  "error": null
}
```

**Usage:**
```javascript
logger.logDatabase('create', 'patients', true);
logger.logDatabase('update', 'bookings', false, error);
```

## Kibana Setup

### 1. Create Index Pattern

1. Open Kibana: http://localhost:5601
2. Go to **Management → Stack Management → Index Patterns**
3. Click **Create index pattern**
4. Enter pattern: `nocturnal-logs-*`
5. Select `@timestamp` as time field
6. Click **Create**

### 2. Create Visualizations

**Example: Error Rate Over Time**
1. Go to **Visualize → Create visualization**
2. Select **Line** chart
3. Data source: `nocturnal-logs-*`
4. Metrics: Count
5. Buckets: Date Histogram on `@timestamp`
6. Filters: `level: ERROR`
7. Save visualization

**Example: Top API Endpoints**
1. Select **Pie** chart
2. Metrics: Count
3. Buckets: Terms aggregation on `http_url.keyword`
4. Save visualization

### 3. Create Dashboard

1. Go to **Dashboard → Create dashboard**
2. Add visualizations:
   - Error rate over time
   - Top API endpoints
   - Request response times
   - Authentication success rate
   - Payment transactions
3. Save dashboard: "Nocturnal Operations Dashboard"

### 4. Set Up Alerts

1. Go to **Stack Management → Rules and Connectors**
2. Create rule:
   - **Name**: High Error Rate
   - **Type**: Elasticsearch query
   - **Index**: nocturnal-errors-*
   - **Query**: `level: ERROR`
   - **Threshold**: Count > 10 in 5 minutes
   - **Action**: Send email/Slack notification

## Grafana Setup (Loki)

### 1. Access Grafana

- URL: http://localhost:3000
- Default credentials: admin/admin

### 2. Configure Loki Datasource

Datasource is auto-provisioned from `grafana/provisioning/datasources/loki.yml`

### 3. Explore Logs

1. Go to **Explore**
2. Select **Loki** datasource
3. Try queries:

```logql
# All logs
{application="nocturnal-api"}

# Error logs only
{application="nocturnal-api"} |= "ERROR"

# Authentication logs
{application="nocturnal-api", event_type="authentication"}

# Payment logs
{application="nocturnal-api", event_type="payment"}

# Count errors per minute
sum(count_over_time({application="nocturnal-api"} |= "ERROR" [1m]))

# Response time percentiles
quantile_over_time(0.99,{application="nocturnal-api"} | json | unwrap responseTime [5m])
```

### 4. Create Dashboard

1. Go to **Dashboards → New → New Dashboard**
2. Add panels:
   - **Log volume**: `rate({application="nocturnal-api"}[5m])`
   - **Error rate**: `sum by (level) (rate({application="nocturnal-api"}[5m]))`
   - **Top endpoints**: `topk(10, sum by (url) (rate({application="nocturnal-api"}[5m])))`
3. Save dashboard

## Log Queries

### Kibana (Elasticsearch)

```
# Find errors in last hour
level: ERROR AND @timestamp:[now-1h TO now]

# Find failed logins
action: login AND success: false

# Find slow requests (>1000ms)
responseTime: >=1000

# Find payment failures
service: payment AND status: failed

# Find by user
userId: "6904ebb6361524b67eec1e3e"

# Find by IP
ip: "192.168.1.1"

# Find 500 errors
status: 500 OR status: 503
```

### Grafana (Loki - LogQL)

```logql
# Errors from last hour
{application="nocturnal-api"} |= "ERROR" | json | __timestamp__ > ago(1h)

# Failed logins
{application="nocturnal-api"} | json | action="login" | success="false"

# Slow requests
{application="nocturnal-api"} | json | responseTime > 1000

# Payment failures
{application="nocturnal-api", event_type="payment"} | json | status="failed"

# Logs by user
{application="nocturnal-api"} | json | userId="6904ebb6361524b67eec1e3e"

# Rate of errors per minute
rate({application="nocturnal-api"} |= "ERROR" [1m])

# Percentage of errors
sum(rate({application="nocturnal-api"} |= "ERROR" [5m]))
/
sum(rate({application="nocturnal-api"} [5m])) * 100
```

## Alerting

### Kibana Alerts

**High Error Rate Alert:**
```json
{
  "name": "High Error Rate",
  "schedule": {
    "interval": "5m"
  },
  "conditions": {
    "when": {
      "count": {
        "query": "level:ERROR",
        "index": "nocturnal-logs-*",
        "threshold": 10
      }
    }
  },
  "actions": [
    {
      "email": {
        "to": ["devops@nocturnal.com"],
        "subject": "High Error Rate Detected",
        "body": "{{context.message}}"
      }
    }
  ]
}
```

### Grafana Alerts (Loki)

1. Go to **Alerting → Alert rules**
2. Create rule:
   - **Query**: `sum(rate({application="nocturnal-api"} |= "ERROR" [5m])) > 0.1`
   - **Condition**: `WHEN last() OF query(A) IS ABOVE 0.1`
   - **Evaluation**: Every 1m for 5m
   - **Notification**: Email/Slack

## Log Rotation

### Application Logs

Logs are automatically rotated by Winston:
- Max file size: 5MB
- Max files: 5 (errors) / 10 (security)
- Old logs compressed

### Elasticsearch Indices

Configure ILM (Index Lifecycle Management):

```bash
# Create ILM policy
curl -X PUT "localhost:9200/_ilm/policy/nocturnal-logs-policy" -H 'Content-Type: application/json' -d'
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_size": "50GB",
            "max_age": "7d"
          }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
'
```

### Loki Retention

Configured in `loki/loki-config.yml`:
```yaml
limits_config:
  retention_period: 720h  # 30 days
```

## Monitoring

### Health Checks

```bash
# Elasticsearch
curl http://localhost:9200/_cluster/health

# Logstash
curl http://localhost:9600

# Kibana
curl http://localhost:5601/api/status

# Loki
curl http://localhost:3100/ready

# Grafana
curl http://localhost:3000/api/health
```

### Resource Usage

```bash
# View container stats
docker stats nocturnal-elasticsearch nocturnal-logstash nocturnal-kibana

# View disk usage
docker-compose -f docker-compose.logging.yml exec elasticsearch df -h
```

## Troubleshooting

### Elasticsearch Issues

**Problem**: Elasticsearch won't start
**Solution**:
```bash
# Increase vm.max_map_count (Linux)
sudo sysctl -w vm.max_map_count=262144

# Check logs
docker logs nocturnal-elasticsearch
```

**Problem**: Cluster health RED
**Solution**:
```bash
# Check index health
curl localhost:9200/_cat/indices?v

# Delete corrupted index
curl -X DELETE localhost:9200/corrupted-index-name
```

### Logstash Issues

**Problem**: Logs not appearing in Elasticsearch
**Solution**:
```bash
# Check Logstash logs
docker logs nocturnal-logstash

# Test pipeline
docker-compose -f docker-compose.logging.yml exec logstash logstash -f /usr/share/logstash/pipeline/logstash.conf --config.test_and_exit
```

### Loki Issues

**Problem**: Promtail not shipping logs
**Solution**:
```bash
# Check Promtail logs
docker logs nocturnal-promtail

# Verify positions file
docker exec nocturnal-promtail cat /tmp/positions.yaml
```

## Best Practices

### 1. Structured Logging

Always use structured logging:
```javascript
// Good
logger.info('User registered', { userId, email, source: 'web' });

// Bad
logger.info(`User ${email} registered from web`);
```

### 2. Log Levels

Use appropriate log levels:
- `error` - System failures, exceptions
- `warn` - Unexpected behavior, potential issues
- `info` - Important business events
- `debug` - Detailed debugging information

### 3. Sensitive Data

Never log sensitive information:
```javascript
// Bad
logger.info('Password:', password);
logger.info('Credit card:', cardNumber);

// Good
logger.info('Authentication attempt', { email, success: true });
logger.info('Payment processed', { orderId, amount });
```

### 4. Performance

- Use async logging
- Set appropriate log levels in production
- Rotate logs regularly
- Monitor disk usage

### 5. Correlation IDs

Add request IDs for tracking:
```javascript
app.use((req, res, next) => {
  req.id = uuidv4();
  logger.defaultMeta = { requestId: req.id };
  next();
});
```

## Security

### 1. Access Control

- Enable Elasticsearch security (X-Pack)
- Use Kibana spaces for multi-tenancy
- Implement RBAC in Grafana

### 2. Data Encryption

- Enable SSL/TLS for Elasticsearch
- Encrypt logs at rest
- Use secure communication between services

### 3. Audit Logging

Enable audit logs for:
- Kibana user actions
- Grafana user actions
- Index creation/deletion
- Policy changes

## Performance Optimization

### 1. Elasticsearch

```yaml
# elasticsearch.yml
indices.memory.index_buffer_size: 20%
thread_pool.write.queue_size: 1000
```

### 2. Logstash

```yaml
# logstash.yml
pipeline.workers: 4
pipeline.batch.size: 250
```

### 3. Filebeat

```yaml
# filebeat.yml
filebeat.spool_size: 4096
filebeat.idle_timeout: 5s
```

## Backup & Recovery

### Elasticsearch Snapshots

```bash
# Configure snapshot repository
curl -X PUT "localhost:9200/_snapshot/my_backup" -H 'Content-Type: application/json' -d'
{
  "type": "fs",
  "settings": {
    "location": "/backups"
  }
}
'

# Create snapshot
curl -X PUT "localhost:9200/_snapshot/my_backup/snapshot_1?wait_for_completion=true"

# Restore snapshot
curl -X POST "localhost:9200/_snapshot/my_backup/snapshot_1/_restore"
```

## Support

- **ELK Documentation**: https://www.elastic.co/guide/
- **Loki Documentation**: https://grafana.com/docs/loki/
- **GitHub Issues**: https://github.com/your-org/nocturnal/issues
- **Team Contact**: devops@nocturnal.com

## Changelog

### v1.0.0 (2025-11-01)
- Initial centralized logging setup
- ELK Stack configuration
- Loki Stack as lightweight alternative
- Custom log formats for healthcare platform
- Dashboard templates
- Alerting rules
