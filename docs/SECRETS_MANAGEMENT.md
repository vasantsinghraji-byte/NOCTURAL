# Secrets Management Guide - Nocturnal Platform

## Overview

This document outlines the secrets management strategy for the Nocturnal platform, ensuring secure storage, rotation, and access control for sensitive credentials.

## Secrets Architecture

### Secret Types

1. **Application Secrets**
   - JWT signing keys
   - API keys (third-party services)
   - Encryption keys

2. **Database Credentials**
   - MongoDB connection strings
   - Database passwords
   - Replica set keys

3. **Infrastructure Secrets**
   - AWS access keys
   - Docker registry credentials
   - SSH keys

4. **Third-Party Integrations**
   - Email service credentials (SMTP)
   - Firebase service account
   - Payment gateway keys

## Storage Solutions

### Development Environment

**Local `.env` file** (NOT committed to git):
```env
JWT_SECRET=dev-secret-change-in-production
MONGODB_URI=mongodb://localhost:27017/nocturnal_dev
REDIS_PASSWORD=dev-password
```

**Security Requirements**:
- Add `.env` to `.gitignore`
- Use `.env.example` as template (without actual secrets)
- Rotate development secrets regularly

### Staging/Production Environments

#### AWS Secrets Manager (Recommended)

**Structure**:
```
nocturnal/production/
├── jwt-secret
├── mongodb-uri
├── redis-password
├── smtp-credentials
└── firebase-service-account
```

**Access Pattern**:
```javascript
// config/secrets.js
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager({ region: 'us-east-1' });

async function getSecret(secretName) {
  try {
    const data = await secretsManager.getSecretValue({
      SecretId: `nocturnal/${process.env.NODE_ENV}/${secretName}`
    }).promise();

    return JSON.parse(data.SecretString);
  } catch (error) {
    console.error('Error retrieving secret:', error);
    throw error;
  }
}

module.exports = { getSecret };
```

**Benefits**:
- Automatic encryption at rest
- Fine-grained IAM access control
- Audit logging via CloudTrail
- Automatic rotation support
- Versioning and rollback

#### HashiCorp Vault (Alternative)

**Configuration**:
```hcl
# vault/config.hcl
storage "consul" {
  address = "127.0.0.1:8500"
  path    = "vault/"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 0
  tls_cert_file = "/etc/vault/tls/cert.pem"
  tls_key_file  = "/etc/vault/tls/key.pem"
}

seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "alias/vault-kms-unseal"
}
```

**Access Pattern**:
```javascript
const vault = require('node-vault')({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN
});

async function getSecret(path) {
  const result = await vault.read(`secret/data/nocturnal/${path}`);
  return result.data.data;
}
```

#### Kubernetes Secrets

**For K8s deployments**:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: nocturnal-secrets
  namespace: nocturnal
type: Opaque
data:
  jwt-secret: <base64-encoded>
  mongodb-uri: <base64-encoded>
  redis-password: <base64-encoded>
```

**Using External Secrets Operator** (integrates with AWS Secrets Manager/Vault):
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: nocturnal-external-secrets
  namespace: nocturnal
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: nocturnal-secrets
  data:
  - secretKey: jwt-secret
    remoteRef:
      key: nocturnal/production/jwt-secret
  - secretKey: mongodb-uri
    remoteRef:
      key: nocturnal/production/mongodb-uri
```

## Secret Rotation

### Automated Rotation

**AWS Secrets Manager Rotation Lambda**:
```python
# lambda/rotate-jwt-secret.py
import boto3
import os
import secrets

def lambda_handler(event, context):
    secret_id = event['SecretId']
    token = event['ClientRequestToken']
    step = event['Step']

    secrets_client = boto3.client('secretsmanager')

    if step == "createSecret":
        # Generate new JWT secret
        new_secret = secrets.token_hex(64)
        secrets_client.put_secret_value(
            SecretId=secret_id,
            ClientRequestToken=token,
            SecretString=new_secret,
            VersionStages=['AWSPENDING']
        )

    elif step == "setSecret":
        # Test new secret (optional)
        pass

    elif step == "testSecret":
        # Verify application works with new secret
        pass

    elif step == "finishSecret":
        # Finalize rotation
        secrets_client.update_secret_version_stage(
            SecretId=secret_id,
            VersionStage='AWSCURRENT',
            MoveToVersionId=token,
            RemoveFromVersionId='AWSPREVIOUS'
        )
```

**Rotation Schedule**:
```bash
# Configure automatic rotation every 90 days
aws secretsmanager rotate-secret \
  --secret-id nocturnal/production/jwt-secret \
  --rotation-lambda-arn arn:aws:lambda:us-east-1:123456789:function:rotate-jwt \
  --rotation-rules AutomaticallyAfterDays=90
```

### Manual Rotation Procedure

**JWT Secret Rotation**:
```bash
# 1. Generate new secret
NEW_SECRET=$(openssl rand -hex 64)

# 2. Update AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id nocturnal/production/jwt-secret \
  --secret-string "$NEW_SECRET"

# 3. Restart application pods (gradual rollout)
kubectl rollout restart deployment/nocturnal-app -n nocturnal

# 4. Verify health
kubectl get pods -n nocturnal
./scripts/health-check.sh production

# 5. Old tokens remain valid until expiry (JWT_EXPIRE=7d)
```

**Database Password Rotation**:
```bash
# 1. Create new database user with new password
mongosh --eval "
  db.createUser({
    user: 'nocturnalapp_v2',
    pwd: '<new-password>',
    roles: [{role: 'readWrite', db: 'nocturnal'}]
  })
"

# 2. Update connection string in Secrets Manager
aws secretsmanager update-secret \
  --secret-id nocturnal/production/mongodb-uri \
  --secret-string "mongodb://nocturnalapp_v2:<new-password>@..."

# 3. Restart application (zero-downtime)
kubectl set image deployment/nocturnal-app \
  app=nocturnal-app:latest -n nocturnal

# 4. Wait for new pods to be healthy

# 5. Remove old user
mongosh --eval "db.dropUser('nocturnalapp')"
```

## Access Control

### IAM Policies (AWS)

**Least Privilege Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:nocturnal/production/*"
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:us-east-1:*:key/*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "secretsmanager.us-east-1.amazonaws.com"
        }
      }
    }
  ]
}
```

**Role-Based Access**:
- **Application**: Read-only access to production secrets
- **CI/CD Pipeline**: Read access + update for deployment
- **Developers**: Read access to dev/staging only
- **Operations**: Full access with MFA requirement

### Kubernetes RBAC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nocturnal-sa
  namespace: nocturnal
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: secret-reader
  namespace: nocturnal
rules:
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["nocturnal-secrets"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: nocturnal-secret-reader
  namespace: nocturnal
subjects:
- kind: ServiceAccount
  name: nocturnal-sa
roleRef:
  kind: Role
  name: secret-reader
  apiGroup: rbac.authorization.k8s.io
```

## Auditing & Monitoring

### CloudTrail Logging

**Monitor secret access**:
```bash
# Find who accessed secrets
aws cloudtrail lookup-events \
  --lookup-attributes \
    AttributeKey=ResourceName,AttributeValue=nocturnal/production/jwt-secret \
  --start-time "2025-01-01T00:00:00Z"
```

### Alerts

**CloudWatch Alarm for unauthorized access**:
```yaml
Resources:
  SecretAccessAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: UnauthorizedSecretAccess
      MetricName: AccessDenied
      Namespace: AWS/SecretsManager
      Statistic: Sum
      Period: 300
      EvaluationPeriods: 1
      Threshold: 1
      ComparisonOperator: GreaterThanThreshold
      AlarmActions:
        - !Ref SecurityTeamSNSTopic
```

## Best Practices

### 1. Never Commit Secrets

**.gitignore**:
```
.env
.env.*
!.env.example
*.pem
*.key
*.p12
firebase-service-account.json
secrets/
credentials/
```

**Pre-commit Hook**:
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for potential secrets
if git diff --cached --name-only | xargs grep -E 'password|secret|key|token' > /dev/null; then
    echo "ERROR: Potential secret detected in commit"
    echo "Please review files and use environment variables"
    exit 1
fi
```

### 2. Use Environment Variables

**Good**:
```javascript
const jwtSecret = process.env.JWT_SECRET;
const mongoUri = process.env.MONGODB_URI;
```

**Bad**:
```javascript
const jwtSecret = 'hardcoded-secret-123'; // NEVER DO THIS
const mongoUri = 'mongodb://user:pass@host/db'; // NEVER DO THIS
```

### 3. Limit Secret Scope

- Use separate secrets for dev/staging/production
- One secret per service (don't reuse)
- Short-lived tokens where possible

### 4. Encrypt Secrets at Rest

- AWS Secrets Manager: KMS encryption
- Kubernetes Secrets: Enable encryption at rest
- Vault: Transit secrets engine

### 5. Regular Rotation

**Rotation Schedule**:
| Secret Type | Rotation Frequency |
|-------------|-------------------|
| JWT Secrets | 90 days |
| Database Passwords | 90 days |
| API Keys | On security event |
| SSH Keys | 180 days |
| TLS Certificates | Auto-renewed 30 days before expiry |

## Emergency Procedures

### Secret Compromise Response

**Immediate Actions**:
1. **Revoke compromised secret** (within minutes)
   ```bash
   aws secretsmanager update-secret \
     --secret-id nocturnal/production/compromised-secret \
     --secret-string "REVOKED-$(date +%s)"
   ```

2. **Generate new secret**
   ```bash
   NEW_SECRET=$(openssl rand -hex 64)
   aws secretsmanager put-secret-value \
     --secret-id nocturnal/production/new-secret \
     --secret-string "$NEW_SECRET"
   ```

3. **Update application**
   ```bash
   kubectl set env deployment/nocturnal-app \
     SECRET_VERSION=new -n nocturnal
   kubectl rollout status deployment/nocturnal-app -n nocturnal
   ```

4. **Audit access logs**
   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=ResourceName,AttributeValue=compromised-secret \
     --start-time "$(date -d '24 hours ago' --iso-8601)"
   ```

5. **Notify team and stakeholders**

### Lost Access Recovery

**If secrets are inaccessible**:
1. Use backup IAM credentials (break-glass account)
2. Access AWS Console with MFA
3. Create temporary secrets
4. Restore from last known good state
5. Re-rotate all secrets as precaution

## Tools & Utilities

### Secret Scanning

**TruffleHog** (scan git history):
```bash
docker run -it -v "$PWD:/pwd" trufflesecurity/trufflehog:latest \
  github --repo https://github.com/nocturnal/nocturnal
```

**git-secrets** (prevent commits):
```bash
git secrets --install
git secrets --register-aws
```

### Secret Generation

```bash
# Strong password (32 chars)
openssl rand -base64 32

# JWT secret (64 bytes hex)
openssl rand -hex 64

# UUID
uuidgen

# Secure random string
head -c 32 /dev/urandom | base64
```

## References

- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Kubernetes Secrets Good Practices](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)

---

**Last Updated**: 2025-01-15
**Next Review**: 2025-04-15
**Document Owner**: Security Team
