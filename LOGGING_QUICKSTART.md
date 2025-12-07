# Centralized Logging - Quick Start

## 🚀 Get Started in 5 Minutes

### Step 1: Choose Your Stack

**ELK Stack** (Full-featured, production-ready):
- Elasticsearch (storage)
- Logstash (processing)
- Kibana (visualization)
- Filebeat (shipping)

**Loki Stack** (Lightweight, fast):
- Loki (storage)
- Promtail (shipping)
- Grafana (visualization)

### Step 2: Start Services

**For ELK Stack:**
```bash
docker-compose -f docker-compose.logging.yml up -d elasticsearch logstash kibana filebeat
```

**For Loki Stack:**
```bash
docker-compose -f docker-compose.logging.yml up -d loki promtail grafana
```

**For Both:**
```bash
docker-compose -f docker-compose.logging.yml up -d
```

### Step 3: Enable in Application

Add to `.env`:
```bash
# For ELK
ENABLE_LOGSTASH=true
LOGSTASH_HOST=localhost
LOGSTASH_PORT=5000

# OR for Loki
ENABLE_LOKI=true
LOKI_HOST=http://localhost:3100
```

### Step 4: Access Dashboards

**Kibana (ELK):**
- URL: http://localhost:5601
- No login required (development)

**Grafana (Loki):**
- URL: http://localhost:3000
- Login: admin/admin

### Step 5: View Logs

**In Kibana:**
1. Go to **Discover**
2. Create index pattern: `nocturnal-logs-*`
3. View logs in real-time

**In Grafana:**
1. Go to **Explore**
2. Select **Loki** datasource
3. Query: `{application="nocturnal-api"}`

## 📊 Pre-built Dashboards

### ELK Dashboard Queries

```
# All errors
level: ERROR

# Failed logins
action: login AND success: false

# Slow requests
responseTime: >=1000

# Payment events
service: payment
```

### Loki Dashboard Queries

```logql
# All logs
{application="nocturnal-api"}

# Errors only
{application="nocturnal-api"} |= "ERROR"

# Rate of requests
rate({application="nocturnal-api"}[5m])

# Top endpoints
topk(10, sum by (url) (rate({application="nocturnal-api"}[5m])))
```

## 🔥 Common Use Cases

### Find Errors

**ELK:**
```
level: ERROR AND @timestamp:[now-1h TO now]
```

**Loki:**
```logql
{application="nocturnal-api"} |= "ERROR" | line_format "{{.message}}"
```

### Track User Activity

**ELK:**
```
userId: "your-user-id"
```

**Loki:**
```logql
{application="nocturnal-api"} | json | userId="your-user-id"
```

### Monitor Performance

**ELK:**
```
responseTime: >=500
```

**Loki:**
```logql
{application="nocturnal-api"} | json | responseTime > 500
```

## ⚡ Quick Commands

```bash
# Check service health
docker-compose -f docker-compose.logging.yml ps

# View logs
docker-compose -f docker-compose.logging.yml logs -f logstash

# Restart services
docker-compose -f docker-compose.logging.yml restart

# Stop services
docker-compose -f docker-compose.logging.yml down

# Clean up (remove volumes)
docker-compose -f docker-compose.logging.yml down -v
```

## 🎯 Next Steps

1. Read [LOGGING_GUIDE.md](./LOGGING_GUIDE.md) for detailed documentation
2. Set up alerts for critical errors
3. Create custom dashboards
4. Configure log retention policies
5. Enable authentication for production

## 🆘 Troubleshooting

**Services won't start:**
```bash
docker-compose -f docker-compose.logging.yml logs
```

**Logs not appearing:**
- Check application is writing to `/logs` directory
- Verify Filebeat/Promtail has access to log files
- Check service connectivity

**Elasticsearch won't start:**
```bash
# Increase vm.max_map_count (Linux)
sudo sysctl -w vm.max_map_count=262144
```

## 📚 Resources

- Full guide: [LOGGING_GUIDE.md](./LOGGING_GUIDE.md)
- Kibana docs: https://www.elastic.co/guide/en/kibana/current/index.html
- Grafana docs: https://grafana.com/docs/grafana/latest/
- Loki docs: https://grafana.com/docs/loki/latest/

---

**🎉 You're all set! Your centralized logging is ready.**
