# Nocturnal Documentation

Welcome to the Nocturnal Healthcare Staffing Platform documentation.

---

## 📚 Documentation Structure

This documentation has been reorganized from **60+ scattered files** into a clean, maintainable structure.

---

## 🚀 Getting Started

**New to Nocturnal?** Start here:

### [→ Getting Started Guide](GETTING_STARTED.md)
Complete installation, configuration, and first-run instructions.

**Time to complete**: 15-25 minutes

**Covers**:
- Installation
- Environment configuration
- Database setup
- Running the application
- Troubleshooting

---

## 📖 Core Documentation

### Guides

| Guide | Description | Key Topics |
|-------|-------------|------------|
| **[Security Guide](guides/security.md)** | Enterprise-grade security | Rate limiting, DDoS protection, secrets management, attack prevention |
| **[Database Security](guides/database-security.md)** | MongoDB security setup | Authentication, encryption, backup, monitoring |
| **[Performance Optimization](guides/performance-optimization.md)** | Speed & efficiency | Indexing, caching, frontend optimization, monitoring |
| **[Testing Guide](guides/testing.md)** | Test coverage & strategy | Jest, coverage goals, MongoDB auth fix, CI/CD integration |
| **[Monitoring Guide](guides/monitoring.md)** | Observability setup | Prometheus, Grafana, Loki, alerts |

### API Documentation

| Documentation | Description |
|---------------|-------------|
| **[API Endpoints](api/endpoints.md)** | Complete API reference |
| **[Authentication](api/authentication.md)** | Auth flows & examples |
| **[Swagger UI](http://localhost:5000/api-docs)** | Interactive API docs |

### Deployment

| Guide | Best For | Complexity |
|-------|----------|------------|
| **[Deployment Overview](deployment/README.md)** | All deployment options | - |
| **[PM2 Deployment](deployment/README.md#option-1-pm2-deployment)** | VPS, dedicated servers | ⭐ Low |
| **[Docker Deployment](deployment/README.md#option-2-docker-compose-deployment)** | Development, small prod | ⭐⭐ Low-Medium |
| **[Kubernetes](deployment/README.md#option-3-kubernetes-deployment)** | Enterprise production | ⭐⭐⭐⭐ High |
| **[AWS/Terraform](deployment/README.md#option-4-aws-deployment-with-terraform)** | Cloud-native | ⭐⭐⭐ Medium-High |

### Architecture

| Document | Description |
|----------|-------------|
| **[Architecture Overview](architecture/overview.md)** | System design, patterns |
| **[Database Schema](architecture/database.md)** | Models, relationships |
| **[API Versioning](architecture/api-versioning.md)** | Version strategy |

---

## 📋 Quick Reference

### Common Tasks

| Task | Command | Reference |
|------|---------|-----------|
| Start development server | `npm run dev` | [Getting Started](GETTING_STARTED.md#running-the-application) |
| Start production server | `npm start` | [Deployment](deployment/README.md) |
| Run tests | `npm test` | - |
| Build frontend | `cd client && npm run build` | [Getting Started](GETTING_STARTED.md#building-for-production) |
| Create database indexes | `npm run db:indexes` | [Performance](guides/performance-optimization.md#strategic-indexing) |
| Security scan | `npm run security:scan` | [Security](guides/security.md#automated-security-testing) |
| Deploy with PM2 | `npm run pm2:start:prod` | [PM2 Deployment](deployment/README.md#option-1-pm2-deployment) |

### Configuration Files

| File | Purpose | Reference |
|------|---------|-----------|
| `.env` | Environment variables | [Getting Started](GETTING_STARTED.md#configuration) |
| `server.js` | Application entry point | - |
| `ecosystem.config.js` | PM2 configuration | [PM2 Guide](deployment/README.md#step-3-configure-pm2) |
| `docker-compose.yml` | Docker orchestration | [Docker Guide](deployment/README.md#option-2-docker-compose-deployment) |
| `k8s/` | Kubernetes manifests | [K8s Guide](deployment/README.md#option-3-kubernetes-deployment) |

---

## 🔍 Documentation by Role

### For Developers

1. [Getting Started](GETTING_STARTED.md) - Setup development environment
2. [Architecture Overview](architecture/overview.md) - Understand system design
3. [API Documentation](api/endpoints.md) - API reference
4. [Performance Guide](guides/performance-optimization.md) - Optimization techniques

### For DevOps Engineers

1. [Deployment Guide](deployment/README.md) - All deployment options
2. [Security Guide](guides/security.md) - Security configuration
3. [Monitoring Guide](guides/monitoring.md) - Observability setup
4. [Database Security](guides/database-security.md) - Database hardening

### For System Administrators

1. [Getting Started](GETTING_STARTED.md#troubleshooting) - Installation & troubleshooting
2. [PM2 Deployment](deployment/README.md#option-1-pm2-deployment) - Traditional deployment
3. [Monitoring Guide](guides/monitoring.md) - Health monitoring
4. [Database Guide](guides/database-security.md) - Database management

---

## 📦 Technology Stack

### Backend
- **Runtime**: Node.js 22.x
- **Framework**: Express 5.x
- **Database**: MongoDB 8.x with Mongoose
- **Cache**: Redis 7.x (optional)
- **Authentication**: JWT + Firebase

### Frontend
- **Core**: Vanilla JavaScript (ES6+)
- **Build**: Webpack 5
- **PWA**: Service Workers

### Infrastructure
- **Container**: Docker
- **Orchestration**: Kubernetes, Docker Compose
- **Process Manager**: PM2
- **IaC**: Terraform
- **Reverse Proxy**: Nginx

### Monitoring
- **Metrics**: Prometheus
- **Visualization**: Grafana
- **Logs**: Winston, Loki, Logstash
- **APM**: Custom metrics

---

## 🗂️ Historical Documentation (Archived)

Implementation logs and completed work items have been moved to:

**[→ changelog/](changelog/)**

This includes:
- Feature implementation summaries (*_COMPLETE.md)
- Bug fix logs (*_FIXED.md)
- Architecture change records
- Historical setup guides

**Note**: These files are archived for reference only. Current guides supersede all historical documentation.

---

## 📚 Additional Resources

### Official Documentation
- [Node.js](https://nodejs.org/docs/)
- [Express.js](https://expressjs.com/)
- [MongoDB](https://www.mongodb.com/docs/)
- [Mongoose](https://mongoosejs.com/docs/)
- [Redis](https://redis.io/documentation)

### Tools & Libraries
- [PM2](https://pm2.keymetrics.io/docs/)
- [Docker](https://docs.docker.com/)
- [Kubernetes](https://kubernetes.io/docs/)
- [Nginx](https://nginx.org/en/docs/)
- [Terraform](https://www.terraform.io/docs/)

### Community
- **GitHub**: [Issues](https://github.com/yourusername/nocturnal/issues)
- **Documentation Issues**: Report inaccuracies or request improvements

---

## 📝 Documentation Maintenance

### Contributing to Documentation

Found an error or want to improve docs?

1. **For minor fixes**: Submit a PR directly
2. **For major changes**: Open an issue first to discuss
3. **Follow structure**: Keep existing organization
4. **Keep it current**: Update docs with code changes

### Documentation Standards

- **Clear headings**: Use descriptive titles
- **Code examples**: Include working examples
- **Cross-references**: Link to related docs
- **Update dates**: Note when significantly changed
- **Simplicity**: Write for beginners, add advanced notes

---

## 🔄 What Changed from Old Structure?

### Before (60+ files in root)
```
/
├── QUICK_START.md
├── QUICK_START_AFTER_RENAME.md
├── QUICK_START_BUILD.md
├── SECURITY.md
├── SECURITY_FIXES_APPLIED.md
├── SECURITY_INTEGRATION_COMPLETE.md
├── ... (57 more files)
```

### After (15 organized files in docs/)
```
docs/
├── README.md                    # This file
├── GETTING_STARTED.md          # Consolidated quick start
├── guides/
│   ├── security.md             # All security docs
│   ├── database-security.md    # Database-specific security
│   ├── performance-optimization.md  # All performance docs
│   └── monitoring.md           # Monitoring setup
├── api/
│   ├── endpoints.md            # API reference
│   └── authentication.md       # Auth flows
├── deployment/
│   └── README.md               # All deployment options
├── architecture/
│   ├── overview.md             # System architecture
│   └── database.md             # Database schema
└── changelog/                  # Historical logs (50+ files)
```

### Benefits
- ✅ **90% fewer files** to search through
- ✅ **Clear categorization** by purpose
- ✅ **No duplication** - single source of truth
- ✅ **Easier maintenance** - update one file, not three
- ✅ **Better navigation** - logical hierarchy
- ✅ **Historical context** preserved in changelog

---

## 📞 Support

Need help?

1. **Check documentation first** - Most questions are answered here
2. **Search existing issues** - Your question may be answered
3. **Open new issue** - Provide context and error messages
4. **Security issues** - Email security@yourcompany.com (do not open public issue)

---

**Last Updated**: November 2024
**Documentation Version**: 2.0
**Platform Version**: 1.0.0
