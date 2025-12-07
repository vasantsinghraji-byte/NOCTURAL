# CI/CD Pipeline - Quick Start Guide

## 🚀 What's Been Set Up

Your Nocturnal Healthcare Platform now has a complete CI/CD pipeline with:

✅ **Automated Testing** - Tests run on every push/PR
✅ **Code Quality Checks** - Linting and security audits
✅ **Docker Containerization** - Multi-stage optimized builds
✅ **Environment Deployments** - Staging & Production workflows
✅ **AWS Integration** - Ready for ECS deployment
✅ **Nginx Reverse Proxy** - Production-ready configuration

## 📁 Files Created

```
.github/workflows/
├── ci.yml           # Continuous Integration (tests, lint, security)
├── cd.yml           # Continuous Deployment (staging/production)
├── docker.yml       # Docker build and push
└── deploy-aws.yml   # AWS ECS deployment

nginx/
└── nginx.conf       # Reverse proxy configuration

scripts/
└── deploy.sh        # Deployment automation script

CICD_GUIDE.md        # Comprehensive documentation
CICD_README.md       # This file
```

## 🎯 Quick Commands

### Local Development

```bash
# Start all services (API + MongoDB + Redis)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

### Manual Deployment

```bash
# Make script executable (Linux/Mac)
chmod +x scripts/deploy.sh

# Deploy to staging
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production v1.0.0

# Check status
./scripts/deploy.sh staging latest status

# Rollback
./scripts/deploy.sh production latest rollback
```

### GitHub Actions (Automatic)

**Trigger CI Pipeline:**
```bash
git add .
git commit -m "feat: add new feature"
git push origin develop  # Triggers CI tests
```

**Deploy to Staging:**
```bash
git checkout main
git merge develop
git push origin main  # Auto-deploys to staging
```

**Deploy to Production:**
```bash
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0  # Auto-deploys to production
```

## 🔧 Configuration Required

### 1. GitHub Secrets

Add these secrets in your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

```bash
# Required for all deployments
MONGODB_URI=<your-production-mongodb-uri>
JWT_SECRET=<your-jwt-secret>
ENCRYPTION_KEY=<your-encryption-key>
RAZORPAY_KEY_ID=<your-razorpay-key>
RAZORPAY_KEY_SECRET=<your-razorpay-secret>

# Required for AWS deployment
AWS_ACCESS_KEY_ID=<your-aws-access-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>
```

### 2. Environment Files

Create environment-specific `.env` files:

```bash
# .env.development
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/nocturnal_dev
# ... other vars

# .env.staging
NODE_ENV=staging
PORT=5000
MONGODB_URI=<staging-mongodb-uri>
# ... other vars

# .env.production
NODE_ENV=production
PORT=5000
MONGODB_URI=<production-mongodb-uri>
# ... other vars
```

### 3. SSL Certificates (Production)

Place SSL certificates in `nginx/ssl/`:
```
nginx/ssl/
├── fullchain.pem
└── privkey.pem
```

## 📊 Pipeline Workflows

### CI Pipeline (Automatic)

**Triggers:** Push/PR to `main` or `develop`

```
Code Push → Lint → Tests → Security Audit → Build → ✅ Pass/❌ Fail
```

**What it does:**
- ✓ Runs ESLint
- ✓ Executes all tests with MongoDB
- ✓ Checks for npm vulnerabilities
- ✓ Validates build process
- ✓ Generates test coverage

### CD Pipeline (Automatic/Manual)

**Staging Deploy:**
```
Push to main → Build → Deploy to Staging → Health Check → ✅ Success
```

**Production Deploy:**
```
Tag v* → Build → Deploy to Production → Migrations → Health Check → ✅ Success
```

### Docker Pipeline

**Triggers:** Push to `main`/`develop` or tags

```
Code → Build Multi-arch → Scan for Vulnerabilities → Push to Registry
```

**Platforms:** `linux/amd64`, `linux/arm64`

## 🏗️ Architecture

### Development
```
Developer → GitHub → CI Tests → Docker Build → Local Testing
```

### Staging
```
main branch → CI → Docker → Deploy Staging → Health Check
```

### Production
```
Version Tag → CI → Docker → Deploy Production → Migrations → Verify
```

## 🔍 Monitoring

### Health Check Endpoints

```bash
# API Health
curl http://localhost:5000/api/v1/health

# Nginx Health
curl http://localhost/health
```

### Container Status

```bash
# View running containers
docker ps

# Check health status
docker inspect --format='{{.State.Health.Status}}' nocturnal-api

# View logs
docker logs nocturnal-api -f
```

### GitHub Actions Status

Check workflow runs: **Repository → Actions tab**

## 🐛 Troubleshooting

### Build Fails

```bash
# Test locally
npm ci
npm run lint
npm test
npm run build
```

### Container Won't Start

```bash
# Check logs
docker logs nocturnal-api

# Enter container
docker exec -it nocturnal-api sh

# Check environment
docker exec nocturnal-api env
```

### Deployment Fails

1. Check GitHub Actions logs
2. Verify all secrets are set
3. Check database connectivity
4. Verify SSL certificates (production)

### Database Connection Issues

```bash
# Test MongoDB connection
docker exec -it nocturnal-mongodb mongosh

# Check network
docker network inspect nocturnal-network
```

## 📈 Scaling

### Horizontal Scaling

```yaml
# docker-compose.prod.yml
services:
  api:
    deploy:
      replicas: 3  # Run 3 instances
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

### Load Balancing

Nginx is configured for load balancing:
```nginx
upstream api_backend {
    least_conn;
    server api-1:5000;
    server api-2:5000;
    server api-3:5000;
}
```

## 🔒 Security Checklist

- [ ] All secrets stored in GitHub Secrets (not in code)
- [ ] SSL certificates configured for HTTPS
- [ ] Rate limiting enabled in Nginx
- [ ] Database authentication configured
- [ ] Non-root user in Docker containers
- [ ] Security headers enabled
- [ ] Vulnerability scanning active
- [ ] Regular dependency updates

## 📚 Additional Resources

- **Full Documentation**: [CICD_GUIDE.md](./CICD_GUIDE.md)
- **Docker Docs**: https://docs.docker.com/
- **GitHub Actions**: https://docs.github.com/actions
- **Nginx Docs**: https://nginx.org/en/docs/

## 🎓 Best Practices

1. **Never commit secrets** - Use environment variables
2. **Test before merging** - PR checks must pass
3. **Use semantic versioning** - v1.0.0, v1.1.0, etc.
4. **Tag production releases** - For rollback capability
5. **Monitor deployments** - Check health after deploy
6. **Keep images small** - Use multi-stage builds
7. **Regular backups** - Automated before deployments

## 📞 Support

For issues or questions:
- Open a GitHub Issue
- Check [CICD_GUIDE.md](./CICD_GUIDE.md) for details
- Review workflow logs in Actions tab

---

**Ready to deploy?** Start with:
```bash
docker-compose up -d
```

Then visit: http://localhost:5000/api/v1/health ✅
