# Disaster Recovery Plan - Nocturnal Platform

## Table of Contents

- [Overview](#overview)
- [Recovery Objectives](#recovery-objectives)
- [Backup Strategy](#backup-strategy)
- [Recovery Procedures](#recovery-procedures)
- [Incident Response](#incident-response)
- [Communication Plan](#communication-plan)
- [Testing Schedule](#testing-schedule)

## Overview

This document outlines the disaster recovery procedures for the Nocturnal platform to ensure business continuity in the event of system failures, data loss, or other catastrophic events.

### Disaster Scenarios Covered

1. **Database Failure**: Complete loss of MongoDB data
2. **Application Server Failure**: Loss of all application servers
3. **Data Center Outage**: Complete regional AWS outage
4. **Security Breach**: Compromised systems or data
5. **Data Corruption**: Accidental or malicious data modification
6. **Network Failure**: Loss of connectivity
7. **Human Error**: Accidental deletion or misconfiguration

## Recovery Objectives

### RTO (Recovery Time Objective)

| Service | RTO Target | Priority |
|---------|-----------|----------|
| API Services | 15 minutes | Critical |
| Database | 30 minutes | Critical |
| File Storage | 1 hour | High |
| Analytics | 4 hours | Medium |
| Monitoring | 2 hours | High |

### RPO (Recovery Point Objective)

| Data Type | RPO Target | Backup Frequency |
|-----------|-----------|------------------|
| Database | 1 hour | Continuous replication + hourly snapshots |
| User Uploads | 1 hour | Real-time sync to S3 |
| Application Logs | 15 minutes | Streaming to CloudWatch |
| Configuration | 0 (version controlled) | Git commits |

## Backup Strategy

### Automated Backups

#### 1. Database Backups

**MongoDB Replica Set**:
- **Primary**: Continuous replication to 2 replicas
- **Snapshots**: Automated hourly snapshots
- **Retention**: 30 days
- **Storage**: AWS S3 with versioning enabled

```bash
# Automated via cron (every hour)
0 * * * * /app/scripts/backup.sh production
```

**Backup Verification**:
- Daily automated restore tests
- Checksum verification
- Size consistency checks

#### 2. File Storage Backups

**S3 Bucket Configuration**:
- Versioning: Enabled
- Cross-Region Replication: us-east-1 → us-west-2
- Lifecycle Policy: Transition to Glacier after 30 days

#### 3. Configuration Backups

- **Git**: All configuration in version control
- **Terraform State**: Stored in S3 with state locking
- **Secrets**: AWS Secrets Manager with automatic rotation

### Backup Monitoring

- Daily backup success/failure notifications
- Weekly backup integrity tests
- Monthly full disaster recovery drills

## Recovery Procedures

### Scenario 1: Database Failure

**Detection**:
- Health check failures
- Connection timeouts
- Replica set alerts

**Recovery Steps**:

1. **Assess Damage** (5 min):
   ```bash
   # Check MongoDB status
   mongosh --eval "rs.status()"

   # Check replica health
   kubectl get pods -n nocturnal | grep mongodb
   ```

2. **Promote Replica** (5 min):
   ```bash
   # If primary is down, promote secondary
   mongosh --eval "rs.stepDown()"
   ```

3. **Restore from Backup** (if all replicas fail) (20 min):
   ```bash
   # Get latest backup
   aws s3 ls s3://nocturnal-backups-production/backups/ | sort | tail -1

   # Download backup
   aws s3 cp s3://nocturnal-backups-production/backups/mongo_YYYYMMDD_HHMMSS.tar.gz .

   # Restore
   ./scripts/restore.sh YYYYMMDD_HHMMSS production
   ```

4. **Verify Recovery** (5 min):
   ```bash
   # Test database connectivity
   curl https://nocturnal.com/api/health

   # Verify data integrity
   mongosh --eval "
     db.users.countDocuments();
     db.duties.countDocuments();
     db.applications.countDocuments();
   "
   ```

**Total Recovery Time**: ~30 minutes

### Scenario 2: Application Server Failure

**Detection**:
- Load balancer health checks fail
- 503 errors
- No response from API

**Recovery Steps**:

1. **Scale Up Replacement Instances** (2 min):
   ```bash
   # Kubernetes
   kubectl scale deployment nocturnal-app --replicas=6 -n nocturnal

   # Or AWS ECS
   aws ecs update-service \
     --cluster nocturnal-production \
     --service nocturnal-api \
     --desired-count 6
   ```

2. **Deploy Latest Version** (10 min):
   ```bash
   # Trigger deployment
   kubectl rollout restart deployment/nocturnal-app -n nocturnal

   # Or CI/CD pipeline
   gh workflow run ci-cd.yml --ref main
   ```

3. **Verify Health** (3 min):
   ```bash
   # Check pod status
   kubectl get pods -n nocturnal

   # Run health checks
   ./scripts/health-check.sh production
   ```

**Total Recovery Time**: ~15 minutes

### Scenario 3: Complete Data Center Outage

**Detection**:
- All services unreachable
- AWS status page shows regional outage
- Multi-service alerts

**Recovery Steps**:

1. **Activate DR Region** (5 min):
   ```bash
   # Update Route53 to failover region
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z1234567890ABC \
     --change-batch file://failover-to-west.json
   ```

2. **Scale Up DR Resources** (10 min):
   ```bash
   # Apply Terraform for DR region
   cd terraform/us-west-2
   terraform apply -auto-approve

   # Scale Kubernetes in DR region
   kubectl config use-context us-west-2
   kubectl scale deployment nocturnal-app --replicas=3 -n nocturnal
   ```

3. **Restore Latest Data** (15 min):
   ```bash
   # Restore MongoDB from cross-region replica
   # Data should already be replicated

   # Sync S3 uploads
   aws s3 sync \
     s3://nocturnal-uploads-us-east-1 \
     s3://nocturnal-uploads-us-west-2
   ```

4. **Verify All Services** (10 min):
   ```bash
   ./scripts/health-check.sh production
   ```

**Total Recovery Time**: ~40 minutes

### Scenario 4: Security Breach

**Detection**:
- Unusual API activity
- Failed authentication attempts
- Security alerts from AWS GuardDuty

**Recovery Steps**:

1. **Isolate Affected Systems** (Immediate):
   ```bash
   # Disable all access keys
   aws iam update-access-key \
     --access-key-id AKIAIOSFODNN7EXAMPLE \
     --status Inactive

   # Rotate all secrets
   aws secretsmanager rotate-secret \
     --secret-id nocturnal/production/jwt-secret

   # Block suspicious IPs
   aws ec2 modify-security-group-rules \
     --group-id sg-123456 \
     --ingress DENY from suspicious-ip
   ```

2. **Assess Damage** (30 min):
   ```bash
   # Check audit logs
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteBucket

   # Check database for unauthorized changes
   mongosh --eval "db.users.find({updatedAt: {$gt: ISODate('2025-01-15')}})"
   ```

3. **Restore Clean State** (1-2 hours):
   ```bash
   # Restore database from last known good backup
   ./scripts/restore.sh YYYYMMDD_HHMMSS production

   # Redeploy application from known good commit
   git checkout <last-good-commit>
   kubectl rollout restart deployment/nocturnal-app -n nocturnal
   ```

4. **Update Security** (2 hours):
   - Rotate all passwords and secrets
   - Update firewall rules
   - Apply security patches
   - Review and update IAM policies

**Total Recovery Time**: 3-4 hours

### Scenario 5: Data Corruption

**Detection**:
- User reports of missing/incorrect data
- Integrity check failures
- Unexpected data values

**Recovery Steps**:

1. **Identify Corruption Scope** (15 min):
   ```bash
   # Find affected records
   mongosh --eval "
     db.users.find({email: {$exists: false}}).count();
     db.duties.find({date: {$lt: ISODate('1970-01-01')}}).count();
   "
   ```

2. **Restore Specific Collections** (30 min):
   ```bash
   # Restore only affected collections
   mongorestore \
     --uri="mongodb://production:27017/nocturnal" \
     --nsInclude="nocturnal.users" \
     --dir=./backup/mongo_YYYYMMDD_HHMMSS \
     --drop
   ```

3. **Verify Data Integrity** (15 min):
   ```bash
   # Run data validation scripts
   node scripts/validate-data.js

   # Spot check critical records
   mongosh --eval "db.users.findOne({email: 'test@test.com'})"
   ```

**Total Recovery Time**: ~1 hour

## Incident Response

### Incident Severity Levels

| Level | Description | Response Time | Team Size |
|-------|-------------|--------------|-----------|
| P0 - Critical | Complete service outage | Immediate | Full team |
| P1 - High | Significant degradation | 15 minutes | On-call + lead |
| P2 - Medium | Partial degradation | 1 hour | On-call engineer |
| P3 - Low | Minor issues | Next business day | Regular priority |

### Incident Response Team

**Roles**:
- **Incident Commander**: Coordinates response, makes decisions
- **Technical Lead**: Executes recovery procedures
- **Communications Lead**: Updates stakeholders
- **Scribe**: Documents timeline and actions

**Contact Information**:
```
On-Call Rotation: PagerDuty escalation policy
Engineering Lead: +1-XXX-XXX-XXXX
CTO: +1-XXX-XXX-XXXX
Slack Channel: #incident-response
```

### Response Workflow

1. **Detection & Alert** (0-5 min)
   - Automated monitoring triggers alert
   - On-call engineer paged

2. **Assessment** (5-15 min)
   - Confirm incident severity
   - Assemble response team
   - Create incident channel

3. **Containment** (15-30 min)
   - Stop data loss
   - Isolate affected systems
   - Implement workarounds

4. **Recovery** (varies by scenario)
   - Execute recovery procedures
   - Verify functionality
   - Monitor for issues

5. **Post-Incident** (within 48 hours)
   - Write post-mortem
   - Identify root cause
   - Implement preventive measures

## Communication Plan

### Internal Communication

**During Incident**:
- Slack: #incident-response channel
- Status updates every 15 minutes
- All hands meetings as needed

### External Communication

**Status Page**: status.nocturnal.com

**Communication Templates**:

**Initial Notification**:
```
We are currently experiencing issues with [service]. Our team is investigating and working on a resolution. We will provide updates every 30 minutes.
```

**Progress Update**:
```
Update: We have identified the issue as [description]. Expected resolution time: [ETA]. Current status: [details].
```

**Resolution**:
```
Resolved: Services have been fully restored. Root cause: [brief description]. We apologize for the inconvenience.
```

### Stakeholder Matrix

| Stakeholder | P0 | P1 | P2 | P3 |
|-------------|----|----|----|----|
| Users | Immediate | 30 min | 2 hours | Not notified |
| CEO/CTO | Immediate | Immediate | 1 hour | Daily summary |
| Customer Support | Immediate | 15 min | 1 hour | Daily summary |
| Partners | Immediate | 1 hour | Not notified | Not notified |

## Testing Schedule

### Regular Drills

**Monthly** (2nd Tuesday):
- Database failover test
- Application deployment rollback
- Basic health check procedures

**Quarterly**:
- Full disaster recovery drill
- Cross-region failover
- Complete restore from backup
- Team rotation exercises

**Annually**:
- Complete data center failover
- Extended outage simulation
- Third-party DR audit

### Test Documentation

After each drill:
1. Document actual vs. expected RTO/RPO
2. Identify gaps in procedures
3. Update runbooks
4. Train team on improvements

## Continuous Improvement

### Metrics to Track

- **MTTR** (Mean Time To Recovery): Target < 30 min
- **MTBF** (Mean Time Between Failures): Target > 720 hours (30 days)
- **Backup Success Rate**: Target 100%
- **DR Drill Success Rate**: Target 100%

### Review Cycle

- **Weekly**: Review backup success/failures
- **Monthly**: Review incident metrics
- **Quarterly**: Update DR procedures
- **Annually**: Complete DR plan review

## Appendix

### Quick Reference Commands

```bash
# Check system health
./scripts/health-check.sh production

# Create backup
./scripts/backup.sh production

# Restore from backup
./scripts/restore.sh YYYYMMDD_HHMMSS production

# Scale application
kubectl scale deployment nocturnal-app --replicas=10 -n nocturnal

# Check pod status
kubectl get pods -n nocturnal -o wide

# View recent logs
kubectl logs -f deployment/nocturnal-app -n nocturnal --tail=100

# Database health
mongosh --eval "rs.status()"

# Redis health
redis-cli ping
```

### Useful Links

- AWS Console: https://console.aws.amazon.com
- Kubernetes Dashboard: https://k8s.nocturnal.com
- Monitoring: https://grafana.nocturnal.com
- Logs: https://logs.nocturnal.com
- Status Page: https://status.nocturnal.com
- Runbooks: https://github.com/nocturnal/runbooks

---

**Last Updated**: 2025-01-15
**Next Review**: 2025-04-15
**Document Owner**: DevOps Team
