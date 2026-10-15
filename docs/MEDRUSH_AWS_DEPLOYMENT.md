# MedRush on AWS — Deployment Runbook

Region: **ap-south-1 (Mumbai)**, so health data (prescriptions) stays in India.
Infrastructure is code in [`terraform/`](../terraform). CI/CD is in
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

---

## 1. Architecture

```
                         Route53 (medrush.in)
             ┌──────────────────┴───────────────────┐
   medrush.in / www                          api.medrush.in
   Amplify Hosting (Next.js SSR)       WAF → ALB (public subnets, TLS 1.2+)
                                                  │
                                    ECS Fargate API tasks (private subnets, 2–6, autoscaled)
                                      │          │            │              │
                              MongoDB Atlas   S3 uploads   ElastiCache    Secrets Manager
                              (AWS Mumbai)    (private,    Redis (TLS,    (env vars at
                               via NAT        SSE, VPC     AUTH)          task start)
                                              endpoint)
```

Web (`medrush.in`) and API (`api.medrush.in`) share one registrable domain, so the
API's `SameSite=strict` httpOnly auth cookies work from the web app with no CORS
cookie workarounds. `ALLOWED_ORIGINS` is set by Terraform.

## 2. Where is the data stored?

**Containers keep no data.** An API task can be killed, replaced or scaled at any
moment. Anything written to its disk is lost and invisible to the other tasks.
So every piece of state lives in a managed service:

| Data | Where (AWS) | Where (local Docker) | Durability |
|---|---|---|---|
| Documents: users, patients, vendors, catalog, inventory, orders | **MongoDB Atlas** cluster in AWS `ap-south-1` | `mongo:7` container, named volume `mongodb_data` | Atlas replica set + continuous backups |
| Files: prescriptions, reports, photos | **S3** `medrush-<env>-uploads-<acct>` (private, encrypted, versioned, TLS-only) | **MinIO** (S3-compatible) container, named volume `minio_data` | 11 nines; old versions kept 90 days |
| Cache, rate-limit counters | **ElastiCache Redis** (TLS + AUTH) | `redis:7` container, named volume `redis_data` | Rebuildable. The app runs without it |
| Secrets (DB URI, JWT, keys) | **Secrets Manager** `medrush/<env>/app` | `.env` file (git-ignored) | Versioned, KMS-encrypted |
| Logs | **CloudWatch Logs** `/ecs/medrush-<env>/api` | `docker logs` / `./logs` | 30-day retention |

**Cross-platform local dev:** Docker Compose uses **named volumes**, which Docker
manages inside its own VM/storage on Windows, macOS and Linux alike. There are no
host paths, drive letters or file-permission differences. Data survives
`docker compose down` and is removed only by `docker compose down -v`.

```bash
docker compose up -d mongodb redis minio minio-init
# then in .env: STORAGE_PROVIDER=s3, S3_UPLOADS_BUCKET=medrush-local-uploads,
#               S3_ENDPOINT=http://localhost:9000, AWS_ACCESS_KEY_ID/SECRET=minioadmin
npm run dev
```
MinIO console: http://localhost:9001. With `STORAGE_PROVIDER` empty the API falls
back to `./uploads` on disk. That's fine for quick hacking, but it isn't the AWS code path.

## 3. First-time setup (once per AWS account)

Prereqs: AWS account + admin CLI profile, Terraform ≥ 1.5, a domain, a GitHub repo,
a MongoDB Atlas account.

### 3.1 Terraform state
```bash
cd terraform/bootstrap
terraform init && terraform apply        # S3 state bucket + DynamoDB lock in ap-south-1
```

### 3.2 MongoDB Atlas
1. Create a project → cluster on **AWS / Mumbai (ap-south-1)**. Use M10+ for
   production (dedicated, backups, VPC peering/PrivateLink available); M0/M2 is fine for staging.
2. Database user `medrush-app` with `readWrite` on the `medrush` database only.
3. Enable **Continuous Cloud Backup** (production).
4. Network access: add the NAT IPs from `terraform output nat_public_ips` after step 3.3.
   Upgrade path: Atlas **PrivateLink** to keep DB traffic off the internet entirely.

Why Atlas, not DocumentDB: the app uses `$near` + `2dsphere` (nearby pharmacies),
`$text` search and MongoDB 7 semantics. Atlas runs real MongoDB inside AWS, so
nothing needs rewriting.

### 3.3 Infrastructure
```bash
cd terraform
cp environments/production.tfvars.example environments/production.tfvars   # edit domain, repo, email
export TF_VAR_github_access_token=<GitHub token for Amplify>  # only needed on first apply

terraform init -backend-config=backend/production.hcl
# ECR first, so the service has an image to pull:
terraform apply -var-file=environments/production.tfvars -target=aws_ecr_repository.api
#   → push an image tagged `bootstrap`, or just run the deploy workflow once after the full apply
terraform apply -var-file=environments/production.tfvars
```
If `create_hosted_zone = true`, delegate the printed `hosted_zone_name_servers` at
your registrar (ACM validation waits for DNS).

### 3.4 Secrets
Terraform seeds `medrush/<env>/app` with generated `JWT_SECRET`, `ENCRYPTION_KEY`
and the Redis credentials, plus a **placeholder** `MONGODB_URI`. Tasks refuse to
start until you replace it:
```bash
aws secretsmanager get-secret-value --secret-id medrush/production/app --query SecretString --output text > s.json
# edit s.json: set MONGODB_URI (Atlas SRV string); add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET when ready
aws secretsmanager put-secret-value --secret-id medrush/production/app --secret-string file://s.json && rm s.json
```
Adding a new key (e.g. Razorpay)? Also add it to `extra_app_secret_keys` in the
tfvars and `terraform apply`. ECS won't start a task that references a missing key.

### 3.5 GitHub
Create GitHub **environments** `staging` / `production` and add the variables from
`terraform output github_environment_variables` (`AWS_DEPLOY_ROLE_ARN`,
`ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, `ECS_CONTAINER_NAME`, `ECS_SUBNETS`,
`ECS_SECURITY_GROUP`, `DEPLOY_HEALTH_URL`, `AWS_REGION`). No AWS keys are stored
in GitHub: the workflow assumes the role via OIDC.

## 4. Deploying

**API:** Actions → *Deploy* → environment + `deploy`. The workflow:
1. builds the image, scans it with Trivy (fails on HIGH/CRITICAL), and signs it with cosign
2. mirrors it to ECR by digest
3. registers a new task definition
4. runs `node scripts/add-indexes.js` as a one-off task, which creates the legacy
   indexes and the MedRush model indexes; the deploy stops if this fails
5. updates the service as a rolling deploy with a circuit breaker that auto-rolls back
6. smoke-tests `/api/v1/health`

**Rollback:** run the workflow with `action=rollback` and a previous `image_tag` (`sha-…`).

**Web:** Amplify builds automatically on every push to `web_branch`.

## 5. Operating

| Task | How |
|---|---|
| Logs | CloudWatch → `/ecs/medrush-<env>/api` (JSON lines) |
| Shell into a task | `aws ecs execute-command --cluster medrush-production --task <id> --container medrush-api --interactive --command sh` |
| Seed / one-off script | `aws ecs run-task` with a command override, e.g. `["node","scripts/seedAdmin.js"]` (same image, secrets and network) |
| Alarms | 5xx rate, unhealthy targets, CPU → SNS → `alarm_email` |
| Scale | autoscaling 60% CPU / 75% memory between `min_capacity` and `max_capacity` |
| Backups | Atlas continuous backups; S3 versioning (90 days of prior versions) |

Background workers (refund outbox, unpaid-order sweeper) run inside every API task.
They're safe to run concurrently because every state change is a compare-and-set update.

## 6. Security baseline (on by default)

- Private subnets for tasks and Redis; only the ALB is public; WAF with AWS managed rules + per-IP rate limit.
- TLS 1.2+ at the ALB; Redis in-transit TLS + AUTH; S3 denies non-TLS; Atlas enforces TLS.
- No static AWS keys anywhere: ECS task role (S3), execution role (secrets, ECR), GitHub OIDC role (deploy).
- Least privilege: the task role can only touch its own uploads bucket.
- Prescriptions are private objects under `prescriptions/<patientId>/`, readable only
  through `GET …/orders/:id/prescription`, which checks access and then issues a
  5-minute presigned URL.

## 7. Rough monthly cost (production, low traffic)

| Item | ≈ USD/month |
|---|---|
| Fargate 2 × (0.5 vCPU, 1 GB) | 30 |
| ALB | 20 |
| NAT gateways × 3 (per-AZ HA) | 100 + data |
| ElastiCache t4g.micro × 2 | 25 |
| WAF | 10 |
| Atlas M10 | 60 |
| Amplify, S3, CloudWatch, Secrets | 10–20 |

NAT gateways are the biggest line item. Staging uses one. Adding Atlas PrivateLink
plus VPC endpoints for ECR, Secrets Manager and Logs can cut NAT data costs later.
