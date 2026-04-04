# Environment Loading Audit

This note summarizes how the project's non-JavaScript entrypoints and startup wrappers obtain configuration.

## Scope

This audit covers:

- Windows batch entrypoints
- PowerShell operational scripts
- shell-based deployment and ops scripts
- container startup wrappers such as `Dockerfile` and init scripts

It does not re-list the JavaScript entrypoints that now load `.env` early inside the Node process. Those were fixed separately in the app and script entrypoints.

## Classification

### 1. Wrapper delegates to a Node entrypoint that self-loads `.env`

These wrappers do not parse `.env` themselves. Instead, they launch a Node process that now loads `.env` early enough inside the JavaScript runtime.

| Path | Behavior | Environment source |
| --- | --- | --- |
| `start-dev.bat` | Clears `MONGODB_URI` and runs `npm run dev` | Delegates to backend Node startup; backend `.env` loading happens in app/server code |
| `migrate-to-nocturnal.bat` | Runs `node scripts/rename-database.js` and `node server.js` | Delegates to JavaScript scripts that load `.env` during Node startup |
| `Dockerfile` | Production container runs `node server.js` | Delegates to backend Node startup; container env can override `.env` as usual |
| `services/patient-booking-service/Dockerfile` | Service container runs `node src/server.js` | Delegates to service config, which calls `require('dotenv').config()` |

### 2. Wrapper relies on shell-provided or container-provided environment

These scripts use environment variables supplied by the shell, CI/CD, Docker, Compose, cron, or the host service manager. They do not load `.env` on their own.

| Path | Behavior | Environment source |
| --- | --- | --- |
| `scripts/deploy.sh` | Validates `.env.<environment>` exists, then uses Docker and Compose commands | Shell/container deployment environment; the script checks for env files but does not source them itself |
| `scripts/health-check.sh` | Reads `API_URL`, `SLACK_WEBHOOK`, `PAGERDUTY_KEY`, `MONGODB_URI`, `REDIS_HOST`, `REDIS_PORT` with shell defaults | Shell-provided env with inline fallback defaults |
| `scripts/backup.sh` | Reads `MONGODB_URI` and environment-specific S3 naming | Shell-provided env with inline fallback defaults |
| `scripts/restore.sh` | Reads `MONGODB_URI` and environment-specific S3 naming | Shell-provided env with inline fallback defaults |
| `docker/mongo-replica-init.sh` | Reads `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `MONGO_APP_USER`, `MONGO_APP_PASSWORD` | Container-provided env during Docker startup |

### 3. Wrapper is operational only and does not participate in `.env` loading

These files mainly perform service management, local MongoDB setup, or static command orchestration. They do not read `.env`, and they are not expected to.

| Path | Behavior | Environment source |
| --- | --- | --- |
| `client/start-frontend.bat` | Runs `npx http-server -p 8080` | No env loading in wrapper |
| `check-mongodb-service.ps1` | Inspects Windows MongoDB service config | No env loading |
| `enable-mongodb-auth.ps1` | Edits `mongod.cfg` and restarts MongoDB | No env loading |
| `enable-mongodb-auth-fixed.ps1` | Edits `mongod.cfg` and restarts MongoDB | No env loading |
| `restart-mongodb.ps1` | Restarts Windows MongoDB service | No env loading |
| `fix-mongodb-auth.bat` | Rewrites `mongod.cfg` with auth disabled | No env loading |
| `reset-mongodb-noauth.bat` | Removes auth-related local MongoDB state and restarts service | No env loading |
| `restart-mongodb.bat` | Restarts Windows MongoDB service | No env loading |
| `setup-mongodb-auth.bat` | Invokes `mongo` or `mongosh` against `setup-mongodb-auth.js` | No env loading in wrapper |
| `scripts/enable-mongodb-auth.bat` | Helps edit `mongod.cfg` and restart MongoDB | No env loading |
| `scripts/clean-git-secrets.sh` | Rewrites Git history to purge secret files | No runtime env loading requirement |

## Operational Guidance

### Use shell or container environment for:

- `scripts/deploy.sh`
- `scripts/health-check.sh`
- `scripts/backup.sh`
- `scripts/restore.sh`
- `docker/mongo-replica-init.sh`

These should be treated as infrastructure or operations scripts. If they need secrets, pass them through the shell, Docker, Compose, CI/CD, or the service manager.

### Use application `.env` loading for:

- `start-dev.bat`
- `migrate-to-nocturnal.bat`
- `Dockerfile`
- `services/patient-booking-service/Dockerfile`

These wrappers ultimately rely on the Node entrypoint's own initialization path. The app now loads `.env` early enough during startup, so the wrapper does not need to source the file itself.

## Recommended Rule of Thumb

- If a wrapper starts a Node process, prefer keeping `.env` loading inside the JavaScript entrypoint.
- If a wrapper is a shell, PowerShell, or Docker init script that directly consumes environment variables, provide those values from the caller or runtime platform.
- Do not mix the two models inside the same wrapper unless there is a clear operational need.
