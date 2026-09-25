# Deployment

Nabz runs on **AWS** (region `ap-south-1`, Mumbai). Render is no longer used; its
blueprint (`render.yaml`) and the Render smoke workflow were removed.

| Environment | How | Runbook |
|---|---|---|
| Staging (no domain) | App Runner: API + website, images built by CodeBuild, MongoDB Atlas | [`terraform/apprunner-staging/README.md`](terraform/apprunner-staging/README.md) |
| Production (with a domain) | ECS Fargate + ALB + WAF, Amplify for the website, Atlas, ElastiCache | [`docs/MEDRUSH_AWS_DEPLOYMENT.md`](docs/MEDRUSH_AWS_DEPLOYMENT.md) |

## Before every deploy

```bash
npm run verify:local        # lint + fast tests
npm run test:deploy-gate    # frontend/backend contract + smoke tests
```

## After a deploy

```bash
curl -i https://<api host>/api/v1/health            # expect 200, "status":"healthy"
DEPLOYED_BASE_URL=https://<api host> npm run smoke:deployed-health-commit
DEPLOYED_BASE_URL=https://<api host> SMOKE_ORIGINS=https://<website host> npm run smoke:deployed-auth-cors
```

`/api/v1/health` reports `deploymentCommit` from the `DEPLOYMENT_COMMIT` environment variable
(set it to the git SHA when building the image).

## Local

```bash
npm run dev            # API on :5000
npm run dev:all        # API + legacy client
cd frontends/web && npm run dev   # Nabz website on :3000
```

Secrets never go in git: local values live in `.env` (git-ignored); deployed values live in
AWS Secrets Manager (see the runbooks above).
