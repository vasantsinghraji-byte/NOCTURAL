# Architecture Separation Plan

## Current Architecture Issues

The project currently has a **monolithic monorepo** structure where:
- Frontend (React client) and backend (Express API) are in the same repository
- Both share the same root `package.json` and `node_modules`
- Tight coupling between frontend and backend deployment
- Mixed dependencies in a single package.json
- No clear separation of concerns

## Recommended Architecture Options

### Option 1: Monorepo with Workspaces (Recommended for Small-Medium Teams)

**Structure:**
```
nocturnal/
├── packages/
│   ├── frontend/          # React client
│   │   ├── package.json
│   │   ├── src/
│   │   └── public/
│   ├── backend/           # Express API
│   │   ├── package.json
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   └── server.js
│   └── shared/            # Shared types/utilities
│       ├── package.json
│       └── src/
├── package.json           # Root workspace config
└── .gitignore
```

**Benefits:**
- Single repository for easier coordination
- Shared tooling and CI/CD
- Cross-package imports for shared code
- Independent versioning per package
- Can use npm/yarn/pnpm workspaces

**Implementation Steps:**
1. Create `packages/` directory structure
2. Move `client/` to `packages/frontend/`
3. Move backend files to `packages/backend/`
4. Extract shared code to `packages/shared/`
5. Update root `package.json` with workspace configuration
6. Update import paths and build scripts

### Option 2: Separate Repositories (Recommended for Large Teams/Microservices)

**Structure:**
```
nocturnal-frontend/         # Separate repo
├── package.json
├── src/
└── public/

nocturnal-backend/          # Separate repo
├── package.json
├── controllers/
├── models/
└── server.js

nocturnal-shared/           # Separate repo (npm package)
└── src/
```

**Benefits:**
- Complete independence
- Different deployment cycles
- Separate access controls
- Easier to scale teams
- Clear API contracts

**Implementation Steps:**
1. Create new repositories
2. Move frontend to `nocturnal-frontend`
3. Move backend to `nocturnal-backend`
4. Publish shared code as npm package
5. Set up independent CI/CD pipelines

### Option 3: Current Structure with Better Organization (Quick Fix)

**Structure:**
```
nocturnal/
├── client/                # Frontend (as-is)
│   ├── package.json
│   └── src/
├── server/                # Renamed from root
│   ├── package.json
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   └── server.js
├── shared/                # Shared utilities
└── .gitignore
```

**Benefits:**
- Minimal disruption
- Clear separation without major refactoring
- Independent package.json files
- Easier to migrate to Option 1 or 2 later

## Recommended Approach: Option 1 (Monorepo with Workspaces)

### Phase 1: Preparation (Week 1)
1. Document current dependencies and imports
2. Identify shared code between frontend and backend
3. Create migration plan with rollback strategy
4. Set up feature branch for migration

### Phase 2: Directory Restructuring (Week 1-2)
1. Create `packages/` directory structure
2. Move frontend code to `packages/frontend/`
3. Move backend code to `packages/backend/`
4. Create `packages/shared/` for common code

### Phase 3: Package Configuration (Week 2)
1. Configure root workspace in `package.json`:
```json
{
  "name": "nocturnal-monorepo",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev:frontend": "npm run dev --workspace=frontend",
    "dev:backend": "npm run dev --workspace=backend",
    "dev": "concurrently \"npm run dev:frontend\" \"npm run dev:backend\"",
    "build:frontend": "npm run build --workspace=frontend",
    "build:backend": "npm run build --workspace=backend",
    "test": "npm run test --workspaces"
  }
}
```

2. Update `packages/frontend/package.json`
3. Update `packages/backend/package.json`
4. Create `packages/shared/package.json`

### Phase 4: Dependency Management (Week 2-3)
1. Separate frontend and backend dependencies
2. Move shared dependencies to root if applicable
3. Run `npm install` to set up workspace links
4. Verify all dependencies resolve correctly

### Phase 5: Code Updates (Week 3)
1. Update import paths in frontend
2. Update import paths in backend
3. Update build scripts and configurations
4. Update environment variable loading

### Phase 6: Testing & Validation (Week 3-4)
1. Run all tests (frontend and backend)
2. Test development workflow
3. Test production builds
4. Verify deployment process
5. Update documentation

### Phase 7: CI/CD Updates (Week 4)
1. Update build pipelines
2. Configure workspace-aware testing
3. Set up independent deployments
4. Update deployment scripts

## Immediate Quick Wins (Do Now)

Even before full separation, implement these:

### 1. Separate Package Dependencies
Create separate `package.json` files for clear dependency boundaries:
- Keep `client/package.json` for frontend
- Create `backend/package.json` for backend only
- Root `package.json` for workspace management

### 2. Separate Environment Configs
- ✅ Already done: `.env.development`, `.env.production`, `.env.test`
- Frontend: Create `client/.env` for React env vars
- Backend: Use root `.env` files

### 3. API Contract Documentation
- Document all API endpoints
- Use OpenAPI/Swagger specification
- Version your API (e.g., `/api/v1/`)

### 4. Separate Build Processes
```json
{
  "scripts": {
    "build:frontend": "cd client && npm run build",
    "build:backend": "echo 'Backend build if needed'",
    "build": "npm run build:frontend && npm run build:backend"
  }
}
```

### 5. Docker Containerization
Create separate containers:
```yaml
# docker-compose.yml
version: '3.8'
services:
  frontend:
    build: ./client
    ports:
      - "3000:3000"

  backend:
    build: ./
    ports:
      - "5000:5000"
    depends_on:
      - mongodb

  mongodb:
    image: mongo:latest
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
```

## Migration Checklist

- [ ] Choose architecture option (Recommended: Option 1)
- [ ] Document current structure and dependencies
- [ ] Create migration branch
- [ ] Set up new directory structure
- [ ] Move frontend code
- [ ] Move backend code
- [ ] Extract shared code
- [ ] Update package.json files
- [ ] Update import paths
- [ ] Update build scripts
- [ ] Update environment configurations
- [ ] Test development workflow
- [ ] Test production builds
- [ ] Update CI/CD pipelines
- [ ] Update documentation
- [ ] Train team on new structure
- [ ] Merge to main branch

## Rollback Plan

If migration fails:
1. Keep original code in `backup/` directory
2. Document any database migrations performed
3. Have rollback scripts ready
4. Test rollback procedure before migration
5. Schedule migration during low-traffic period

## Conclusion

**Immediate Action**: Implement Quick Wins (1-2 days)
**Short-term Goal**: Complete Option 1 migration (3-4 weeks)
**Long-term Goal**: Consider Option 2 when scaling requires it

The monorepo workspace approach provides the best balance of:
- Code organization
- Development efficiency
- Deployment flexibility
- Team collaboration
