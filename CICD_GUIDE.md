# CI/CD Pipeline Guide - Nocturnal Healthcare Platform

## Overview

This document describes the Continuous Integration and Continuous Deployment (CI/CD) pipeline for the Nocturnal healthcare platform.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Repository                        │
│  (Push/PR to main, develop, or tags)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐         ┌───────────────┐
│   CI Pipeline │         │ Docker Build  │
│   (Testing)   │         │  & Push       │
└───────┬───────┘         └───────┬───────┘
        │                         │
        ▼                         ▼
┌───────────────┐         ┌───────────────┐
│ Code Quality  │         │  Container    │
│ & Security    │         │  Registry     │
└───────┬───────┘         └───────┬───────┘
        │                         │
        └────────────┬────────────┘
                     │
                     ▼
             ┌───────────────┐
             │ CD Pipeline   │
             │ (Deployment)  │
             └───────┬───────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐         ┌───────────────┐
│   Staging     │         │  Production   │
│  Environment  │         │  Environment  │
└───────────────┘         └───────────────┘
```

## Workflows

### 1. CI Pipeline (`.github/workflows/ci.yml`)

Triggers on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

**Jobs:**
- **Lint**: Code quality checks with ESLint
- **Test**: Unit and integration tests with MongoDB service
- **Security**: npm audit for vulnerabilities
- **Build**: Application build validation
- **Docs**: API documentation generation (main branch only)

**Requirements:**
- Node.js 18.x
- MongoDB 6.0 (service container)

### 2. CD Pipeline (`.github/workflows/cd.yml`)

Triggers on:
- Push to `main` branch
- Version tags (`v*`)
- Manual workflow dispatch

**Environments:**
- **Staging**: Deployed on every push to main
- **Production**: Deployed on version tags or manual trigger

**Jobs:**
- **deploy-staging**: Deploy to staging environment
- **deploy-production**: Deploy to production environment
- **rollback**: Rollback to previous version (manual)
- **artifacts**: Create release packages

### 3. Docker Build & Push (`.github/workflows/docker.yml`)

Triggers on:
- Push to `main` or `develop`
- Pull requests
- Version tags

**Features:**
- Multi-platform builds (amd64, arm64)
- Image caching for faster builds
- Vulnerability scanning with Trivy
- Push to GitHub Container Registry

### 4. AWS Deployment (`.github/workflows/deploy-aws.yml`)

Manual workflow for deploying to AWS ECS.

**Features:**
- Environment selection (development/staging/production)
- Version/tag specification
- ECS task definition updates
- Database migrations
- Health checks

## Environments

### Development
- Branch: `develop`
- Auto-deploy: No
- URL: `http://localhost:5000`
- Database: Local MongoDB

### Staging
- Branch: `main`
- Auto-deploy: Yes (on push to main)
- URL: `https://staging.nocturnal.com`
- Database: Staging MongoDB cluster

### Production
- Branch: `main` (tags)
- Auto-deploy: Yes (on version tags)
- URL: `https://nocturnal.com`
- Database: Production MongoDB cluster (replica set)

## Docker Setup

### Building Locally

```bash
# Build image
docker build -t nocturnal-api .

# Run container
docker run -p 5000:5000 --env-file .env nocturnal-api
```

### Using Docker Compose

```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Deployment Process

### Staging Deployment

1. **Automatic**: Push to `main` branch
   ```bash
   git checkout main
   git merge develop
   git push origin main
   ```

2. **Manual**: Use GitHub Actions UI
   - Go to Actions → CD - Continuous Deployment
   - Click "Run workflow"
   - Select "staging" environment

### Production Deployment

1. **Tag-based** (Recommended):
   ```bash
   git checkout main
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin v1.0.0
   ```

2. **Manual**:
   - Go to Actions → CD - Continuous Deployment
   - Click "Run workflow"
   - Select "production" environment

### Rollback

If deployment fails or issues arise:

```bash
# Via GitHub Actions
1. Go to Actions → CD - Continuous Deployment
2. Click "Run workflow"
3. Select rollback job
4. Choose environment

# Via Docker
docker-compose pull  # Get previous version
docker-compose up -d
```

## Environment Variables

### Required Secrets (GitHub Repository Settings)

```bash
# AWS Deployment
AWS_ACCESS_KEY_ID=<your-aws-access-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>

# Database
MONGODB_URI=<production-mongodb-uri>

# Security
JWT_SECRET=<production-jwt-secret>
ENCRYPTION_KEY=<production-encryption-key>

# Payment
RAZORPAY_KEY_ID=<production-razorpay-key>
RAZORPAY_KEY_SECRET=<production-razorpay-secret>
```

### Setting Secrets

```bash
# Via GitHub CLI
gh secret set AWS_ACCESS_KEY_ID -b"your-value"

# Via GitHub UI
Settings → Secrets and variables → Actions → New repository secret
```

## Monitoring & Health Checks

### Health Check Endpoints

```bash
# API Health
GET /api/v1/health

# Response
{
  "status": "ok",
  "version": "v1",
  "timestamp": "2025-11-01T10:00:00.000Z"
}
```

### Container Health

```bash
# Check container health
docker ps

# View health check logs
docker inspect --format='{{.State.Health.Status}}' nocturnal-api
```

## Database Migrations

### Running Migrations

```bash
# Development
npm run db:migrate

# Production (via deployment pipeline)
# Migrations run automatically during deployment
```

### Creating Migrations

```bash
# Create new migration
npm run db:migrate:create -- add_new_field_to_patients

# Edit: migrations/<timestamp>_add_new_field_to_patients.js
```

## Troubleshooting

### Build Failures

1. **Check logs**:
   - Go to Actions tab → Failed workflow → View logs

2. **Common issues**:
   - Missing environment variables
   - Dependency installation failures
   - Test failures

3. **Solutions**:
   ```bash
   # Locally test build
   npm ci
   npm test
   npm run build
   ```

### Deployment Failures

1. **Check deployment logs**
2. **Verify environment secrets**
3. **Check database connectivity**
4. **Review application logs**

### Docker Issues

```bash
# View container logs
docker logs nocturnal-api

# Enter container
docker exec -it nocturnal-api sh

# Check MongoDB connection
docker exec -it nocturnal-mongodb mongosh
```

## Best Practices

### Branching Strategy

```
main (production)
  ├── develop (staging)
      ├── feature/patient-portal
      ├── feature/payment-integration
      └── bugfix/auth-issue
```

### Commit Messages

```bash
# Format
<type>(<scope>): <subject>

# Examples
feat(auth): add patient login endpoint
fix(booking): resolve payment verification bug
docs(ci): update deployment guide
chore(deps): upgrade express to 5.1.0
```

### Version Tagging

```bash
# Semantic Versioning
v<major>.<minor>.<patch>

# Examples
v1.0.0  # Major release
v1.1.0  # New features
v1.1.1  # Bug fixes
```

## Security

### Container Security

- Use non-root user
- Scan images for vulnerabilities
- Keep base images updated
- Use multi-stage builds

### Secrets Management

- Never commit secrets to repository
- Use GitHub Secrets for CI/CD
- Rotate secrets regularly
- Use AWS Secrets Manager for production

### Network Security

- Enable HTTPS only
- Use security headers
- Implement rate limiting
- Configure CORS properly

## Performance Optimization

### Build Optimization

- Use Docker layer caching
- Minimize image size
- Enable parallel builds
- Use .dockerignore

### Deployment Optimization

- Use health checks
- Implement rolling updates
- Configure auto-scaling
- Monitor resource usage

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/nocturnal/issues
- Documentation: https://docs.nocturnal.com
- Team Contact: devops@nocturnal.com

## Changelog

### v1.0.0 (2025-11-01)
- Initial CI/CD pipeline setup
- Docker containerization
- GitHub Actions workflows
- AWS ECS deployment
- Nginx reverse proxy configuration
