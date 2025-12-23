# Temporary Changes Requiring Cleanup

## Overview
This document tracks temporary changes made during Phase 0 deployment that need to be reverted or properly configured before production launch.

## 1. Localhost CORS Bypass in Production

**File**: `middleware/security.js` (lines 137-139)

**Current Code**:
```javascript
// TEMPORARY: Allow localhost/127.0.0.1 even in production for testing
// TODO: Remove this after setting ALLOWED_ORIGINS properly
const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');

if (allowedOrigins.indexOf(origin) !== -1 || isLocalhost) {
  callback(null, true);
} else {
  logger.warn('CORS blocked request from unauthorized origin', { origin });
  callback(new Error('Not allowed by CORS'));
}
```

**Why Temporary**:
- Allows localhost origins even in production mode
- This was added to fix CORS errors during initial deployment testing
- **Security Risk**: Any localhost application can access the production API

**Proper Fix**:
1. Deploy your frontend to Render (or other hosting)
2. Get the frontend URL (e.g., `https://nocturnal-frontend.onrender.com`)
3. Add environment variable in Render dashboard:
   - Variable: `ALLOWED_ORIGINS`
   - Value: `https://nocturnal-frontend.onrender.com,http://localhost:5500` (for local dev)
4. Remove the `isLocalhost` bypass from `middleware/security.js`:

```javascript
// CORRECT VERSION (remove localhost bypass):
if (allowedOrigins.indexOf(origin) !== -1) {
  callback(null, true);
} else {
  logger.warn('CORS blocked request from unauthorized origin', { origin });
  callback(new Error('Not allowed by CORS'));
}
```

5. Commit and push the change

**Timeline**: Complete before public launch

---

## 2. Express 5 Peer Dependency Resolution

**File**: `packages/shared/package.json`

**Current Configuration**:
```json
{
  "peerDependencies": {
    "express": "^4.18.0 || ^5.0.0"
  },
  "peerDependenciesMeta": {
    "express": {
      "optional": false
    }
  }
}
```

**Status**: ✅ This is the correct long-term solution (not temporary)

**Note**: The `|| ^5.0.0` addition ensures compatibility with both Express 4.x and 5.x, which is needed since we're using Express 5.1.0 in the main application.

---

## 3. Dockerfile --legacy-peer-deps Flag

**File**: `Dockerfile` (line 19)

**Current Code**:
```dockerfile
RUN npm ci --legacy-peer-deps
```

**Status**: ⚠️ May be removable in future

**Why Used**:
- Required to resolve Express 5 peer dependency conflicts during npm install
- With the updated `packages/shared/package.json`, this flag may no longer be necessary

**Review Timeline**:
- After Phase 1 deployment, test if build succeeds without `--legacy-peer-deps`
- If successful, remove the flag for cleaner dependency resolution

---

## 4. Render Build Command

**File**: `render.yaml` (line 6)

**Current Code**:
```yaml
buildCommand: npm install --legacy-peer-deps
```

**Status**: ⚠️ May be removable in future

**Same as Dockerfile**: Once peer dependencies are fully resolved, test removing this flag.

---

## Cleanup Checklist

Before Production Launch:
- [ ] Deploy frontend to production hosting
- [ ] Configure `ALLOWED_ORIGINS` environment variable in Render
- [ ] Remove localhost CORS bypass from `middleware/security.js`
- [ ] Test CORS with production frontend URL
- [ ] Commit and deploy the cleaned-up code

Future Optimization:
- [ ] Test if `--legacy-peer-deps` can be removed from Dockerfile
- [ ] Test if `--legacy-peer-deps` can be removed from render.yaml
- [ ] Update documentation if flags are successfully removed

---

## Git Commits with Temporary Changes

1. **e9d1d56** - "Hotfix: Allow localhost origins in production for CORS testing"
   - Added localhost bypass (needs revert)

2. **877342b** - "Fix: Update shared package to support Express 5.x"
   - Updated peer dependencies (permanent fix)

---

## Monitoring After Cleanup

After removing temporary changes, verify:
1. Frontend can successfully make API requests
2. CORS errors don't appear in browser console
3. No 500 errors from CORS middleware
4. Render deployment succeeds without --legacy-peer-deps
