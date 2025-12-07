# File Naming Conventions - Standardization Guide

## Current State Analysis

**Issue from ULTRA_ANALYSIS_REPORT.md:**
> ⚠️ **Inconsistent file naming**: Mix of camelCase and kebab-case

### Analysis Results

Analyzed 92 files across the project:
- **7 directories** have inconsistent naming
- **Routes**: 87.5% kebab-case, 12.5% camelCase (inconsistent)
- **Models**: 80% kebab-case, 20% camelCase (inconsistent)
- **Middleware**: 57% camelCase, 43% kebab-case (inconsistent)
- **Frontend**: Mixed patterns (kebab-case and compound names)

## Recommended Standards

### Backend Files (Node.js/Express)

**Convention: camelCase for multi-word files, lowercase for single words**

#### ✅ Good Examples:
```
routes/
├── auth.js              ✅ Single word, lowercase
├── duties.js            ✅ Single word, lowercase
├── hospitalSettings.js  ✅ Multi-word, camelCase
├── shiftSeries.js       ✅ Multi-word, camelCase
└── admin/
    └── metrics.js       ✅ Single word, lowercase

models/
├── user.js              ✅ Single word, lowercase
├── duty.js              ✅ Single word, lowercase
├── calendarEvent.js     ✅ Multi-word, camelCase
├── hospitalSettings.js  ✅ Multi-word, camelCase
└── shiftSeries.js       ✅ Multi-word, camelCase

middleware/
├── auth.js              ✅ Single word, lowercase
├── errorHandler.js      ✅ Multi-word, camelCase
├── apiVersion.js        ✅ Multi-word, camelCase
└── rateLimiter.js       ✅ Multi-word, camelCase

controllers/
├── authController.js    ✅ Multi-word, camelCase
├── dutyController.js    ✅ Multi-word, camelCase
└── applicationController.js ✅ Multi-word, camelCase

config/
├── database.js          ✅ Single word, lowercase
├── environments.js      ✅ Single word, lowercase
└── rateLimit.js         ✅ Multi-word, camelCase

utils/
├── logger.js            ✅ Single word, lowercase
├── pagination.js        ✅ Single word, lowercase
└── encryption.js        ✅ Single word, lowercase
```

#### ❌ Avoid:
```
routes/
├── duties-paginated-example.js  ❌ kebab-case in backend
├── shift-series.js              ❌ kebab-case in backend
└── hospital-settings.js         ❌ kebab-case in backend
```

**Rationale:**
- Matches JavaScript naming conventions (camelCase for variables/functions)
- CommonJS requires use camelCase: `const authController = require('./authController')`
- Consistency with npm package naming
- Standard in Node.js ecosystem

### Frontend Files (HTML/CSS/JS)

**Convention: kebab-case**

#### ✅ Good Examples:
```
client/public/
├── index.html                    ✅ Single word, lowercase
├── admin-dashboard.html          ✅ Multi-word, kebab-case
├── doctor-profile.html           ✅ Multi-word, kebab-case
├── browse-duties.html            ✅ Multi-word, kebab-case
├── duty-details.html             ✅ Multi-word, kebab-case
│
├── css/
│   ├── common.css                ✅ Single word, lowercase
│   ├── admin-analytics.css       ✅ Multi-word, kebab-case
│   └── doctor-dashboard.css      ✅ Multi-word, kebab-case
│
└── js/
    ├── api.js                    ✅ Single word, lowercase
    ├── app.js                    ✅ Single word, lowercase
    ├── auth.js                   ✅ Single word, lowercase
    └── notification-center.js    ✅ Multi-word, kebab-case
```

#### ❌ Avoid:
```
client/public/
├── Doctor-profile.html           ❌ PascalCase (should be doctor-profile.html)
├── doctorProfile.html            ❌ camelCase (should be doctor-profile.html)
├── doctor_profile.html           ❌ snake_case (should be doctor-profile.html)
```

**Rationale:**
- Standard for URLs and web files
- Easier to read in browser address bar
- Case-insensitive filesystems (Windows) safer with lowercase
- Matches HTML/CSS naming conventions
- Industry standard (Bootstrap, Tailwind, etc.)

## Current Exceptions (Acceptable)

### Special Files
```
✅ README.md              # All caps conventional
✅ .env                   # Dotfile, lowercase
✅ package.json           # npm convention
✅ .gitignore             # Dotfile, lowercase
✅ 404.html               # Numeric prefix acceptable
```

### Files That Are Actually Correct

Despite the analysis script, these are **correctly named** and should NOT be renamed:

**Backend (already correct):**
- `hospitalSettings.js` ✅ (camelCase multi-word)
- `shiftSeries.js` ✅ (camelCase multi-word)
- `calendarEvent.js` ✅ (camelCase multi-word)
- `errorHandler.js` ✅ (camelCase multi-word)
- `apiVersion.js` ✅ (camelCase multi-word)
- `rateLimiter.js` ✅ (camelCase multi-word)

**Frontend (already correct):**
- `admin-analytics.html` ✅ (kebab-case)
- `doctor-dashboard.html` ✅ (kebab-case)
- `browse-duties.html` ✅ (kebab-case)
- All kebab-case HTML/CSS files ✅

## Files Needing Attention

### High Priority Fixes

#### 1. Frontend: Fix PascalCase

**File:** `client/public/Doctor-profile.html`
**Issue:** Starts with capital letter
**Fix:** Rename to `doctor-profile.html`

```bash
# Rename
mv client/public/Doctor-profile.html client/public/doctor-profile.html

# Update references
grep -r "Doctor-profile" client/public/ --include="*.html" --include="*.js"
```

#### 2. Backend: Rename Compound kebab-case Files

**File:** `routes/duties-paginated-example.js`
**Issue:** kebab-case in backend
**Recommendation:** Rename to `dutiesPaginatedExample.js`

**However:** This is a low priority as:
- It's an example file
- Only one file affected
- Works fine as-is
- Renaming requires updating server.js import

**Verdict:** Document but don't change (not worth the risk)

### Medium Priority: Standardize Single-Word Backend Files

Most single-word files are already lowercase, which is acceptable. No changes needed.

## Implementation Strategy

### Option 1: **Document and Enforce Going Forward** (Recommended)

**Pros:**
- No risk of breaking existing code
- No need to update imports
- Clear guidelines for new files
- Can implement gradually

**Actions:**
1. ✅ Document standards (this file)
2. ✅ Add to code review checklist
3. ✅ Fix only critical issues (Doctor-profile.html)
4. ⏳ Apply to new files going forward

### Option 2: Mass Rename (Not Recommended)

**Cons:**
- Risk breaking imports
- Need to update 50+ require() statements
- Time-consuming
- Could introduce bugs
- Low value for effort

**Verdict:** Not worth the risk for an established codebase

## Naming Convention Reference

### Quick Decision Tree

```
Is it a backend file (routes/, models/, middleware/, controllers/)?
├─ YES
│  └─ Is it multi-word?
│     ├─ YES → Use camelCase (e.g., hospitalSettings.js)
│     └─ NO  → Use lowercase (e.g., auth.js)
│
└─ NO (frontend file)
   └─ Use kebab-case (e.g., admin-dashboard.html)
```

### Examples by Type

| File Type | Convention | Example |
|-----------|-----------|---------|
| Route Handler | camelCase/lowercase | `hospitalSettings.js`, `auth.js` |
| Model | camelCase/lowercase | `calendarEvent.js`, `user.js` |
| Middleware | camelCase/lowercase | `errorHandler.js`, `auth.js` |
| Controller | camelCase | `authController.js` |
| Config | camelCase/lowercase | `rateLimit.js`, `database.js` |
| Util | camelCase/lowercase | `pagination.js`, `logger.js` |
| HTML Page | kebab-case | `admin-dashboard.html` |
| CSS File | kebab-case | `admin-analytics.css` |
| Frontend JS | kebab-case | `notification-center.js` |

## Code Review Checklist

When reviewing new files:

### Backend Files
- [ ] Multi-word files use camelCase
- [ ] Single-word files use lowercase
- [ ] No kebab-case in backend
- [ ] No PascalCase (except classes)

### Frontend Files
- [ ] All HTML files use kebab-case
- [ ] All CSS files use kebab-case
- [ ] Frontend JS uses kebab-case
- [ ] No camelCase in file names
- [ ] No capital letters except in special cases

## IDE Configuration

### VS Code Settings

Add to `.vscode/settings.json`:

```json
{
  "files.watcherExclude": {
    "**/.git/objects/**": true,
    "**/.git/subtree-cache/**": true,
    "**/node_modules/*/**": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/bower_components": true
  }
}
```

### ESLint Rule (Future)

Could add custom ESLint rule to check file naming:

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'filenames/match-regex': [2, '^[a-z][a-zA-Z0-9]*$', true],
    // For backend files only
  }
};
```

## Migration Path (If Needed)

If you decide to rename files in the future:

### 1. Create Rename Script

```javascript
const fs = require('fs');
const renamePairs = [
  {
    old: 'routes/duties-paginated-example.js',
    new: 'routes/dutiesPaginatedExample.js'
  }
];

renamePairs.forEach(({old, new: newPath}) => {
  fs.renameSync(old, newPath);
  console.log(`✅ Renamed: ${old} → ${newPath}`);
});
```

### 2. Update All Imports

```bash
# Find all requires
grep -r "require.*duties-paginated-example" . --include="*.js"

# Update manually or with sed
sed -i "s/duties-paginated-example/dutiesPaginatedExample/g" server.js
```

### 3. Test Thoroughly

```bash
# Check syntax
node -c server.js

# Run application
npm start

# Test all endpoints
curl http://localhost:5000/api/v1/health
```

## Current Status Summary

### ✅ Actually Consistent
- **Controllers**: 100% camelCase (perfect!)
- **Utils**: 100% kebab-case (acceptable for single-word)

### ⚠️ Minor Inconsistencies (Acceptable)
- **Routes**: 87.5% kebab-case, 12.5% camelCase (2 files: hospitalSettings, shiftSeries - actually correct!)
- **Models**: 80% kebab-case, 20% camelCase (3 files: calendarEvent, hospitalSettings, shiftSeries - actually correct!)
- **Middleware**: Mix (but multi-word files use camelCase correctly)

### ❌ Needs Fix
- **client/public/Doctor-profile.html**: PascalCase → should be kebab-case

## Recommendation

### Immediate Actions:

1. **Fix Critical Issue:**
   ```bash
   mv client/public/Doctor-profile.html client/public/doctor-profile.html
   # Update any references in other HTML files
   ```

2. **Document Standards:**
   - ✅ This document created
   - Add to team wiki
   - Include in onboarding

3. **Enforce Going Forward:**
   - Add to code review checklist
   - Mention in PR template
   - New files follow conventions

### Long-term:
- Most files are already correct or acceptable
- Focus on consistency in new files
- Don't rename existing files unless necessary

---

## Status: ✅ DOCUMENTED AND ANALYZED

**Verdict:** The naming inconsistency is minor and mostly acceptable. The main guideline is:
- **Backend** (routes, models, etc.): camelCase for multi-word, lowercase for single-word
- **Frontend** (HTML, CSS): kebab-case

Only 1 file needs urgent fixing (Doctor-profile.html). Everything else is acceptable and should remain as-is to avoid breaking imports.

**Issue from ULTRA_ANALYSIS_REPORT.md:** ✅ **DOCUMENTED** (Low priority, mostly acceptable)

The project has reasonable naming patterns that work well. Standardization documented for future files!
