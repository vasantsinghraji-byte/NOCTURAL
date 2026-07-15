/**
 * Phase 5-A patient-health split validation (docs/PHASE1_SPLIT_RECONCILED.md,
 * docs/PHASE5_DECISION_BRIEF.md).
 *
 * Repeatable, read-only checks that the patient-health app copy stays
 * import-clean while all duty-shift routes remain live in the monolith:
 *
 *   1. Every relative require() inside apps/patient-health resolves —
 *      no missing modules in the copied app.
 *   2. Requires that escape the app directory are allowed only from the
 *      approved app-local wiring files (app.js, server.js) and only to the
 *      approved root modules (the monolith security/config stack that is
 *      not yet exported from @nocturnal/shared).
 *   3. No patient-health file imports a duty-shift-owned module.
 *   4. Every export referenced on @nocturnal/shared — whether accessed as a
 *      property (require('@nocturnal/shared').auth) or destructured directly —
 *      actually exists in packages/shared (checked via Object.keys, which
 *      does not trigger the lazy getters).
 *   5. The monolith v1 router still mounts every preserved duty-shift route,
 *      both payment mounts, and every patient-health route; the patient-health
 *      app router still mounts its patient-health subset.
 *
 * Exit code 0 = all checks pass; 1 = violations found (listed on stderr).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'apps', 'patient-health');

// Approved app-local wiring (Phase 3 decision): these files may require root
// modules directly because the modules are not (yet) exported from
// @nocturnal/shared. Keep in sync with the header comment in
// apps/patient-health/app.js. Do not extend without a Decision Log entry.
const APPROVED_ROOT_REACHING_FILES = new Set(['app.js', 'server.js']);
const APPROVED_ROOT_MODULES = new Set([
  'middleware/rateLimitEnhanced',
  'middleware/security',
  'middleware/apiVersion',
  'middleware/errorHandler',
  'middleware/requestId',
  'config/requestLimits',
  'config/database',
  'utils/sanitization'
]);

// Duty-shift-owned modules (blueprint Phase 4 inventory). Patient-health code
// must never import these, app-locally or from the root.
const DUTY_SHIFT_OWNED = new Set([
  'duty',
  'application',
  'shiftSeries',
  'availability',
  'certification',
  'achievement',
  'earning',
  'hospital',
  'hospitalSettings',
  'hospitalWaitlist',
  'review',
  'dutyService',
  'applicationService',
  'analyticsService'
]);

// Preserved duty-shift mounts (docs/PHASE5_DECISION_BRIEF.md) — must stay in
// the monolith v1 router.
const PRESERVED_DUTY_SHIFT_MOUNTS = [
  '/duties',
  '/applications',
  '/calendar',
  '/earnings',
  '/certifications',
  '/reviews',
  '/achievements',
  '/shift-series',
  '/hospital-settings',
  '/hospital-waitlist'
];

// Payment mounts whose distinction must be preserved.
const PAYMENT_MOUNTS = ['/payments', '/payments-b2c'];

// Patient-health mounts expected in BOTH the monolith v1 router and the
// patient-health app router.
const PATIENT_HEALTH_MOUNTS = [
  '/patients',
  '/bookings',
  '/patient-dashboard',
  '/health-records',
  '/health-analytics',
  '/health-intake',
  '/doctor-access',
  '/patient-analytics'
];

const violations = [];

function violation(message) {
  violations.push(message);
}

function walkJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkJsFiles(full));
    } else if (full.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveRelativeRequire(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.js`, path.join(base, 'index.js'), `${base}.json`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function moduleBaseName(spec) {
  return path.basename(spec).replace(/\.(js|json)$/, '');
}

function checkAppImports() {
  const requireRe = /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  // Property access: require('@nocturnal/shared').auth — validate the property.
  const sharedPropertyRe = /require\(\s*['"`]@nocturnal\/shared['"`]\s*\)\.([A-Za-z_$][\w$]*)/g;
  // Direct destructure with no property access: const { logger } = require('@nocturnal/shared');
  const sharedDestructureRe = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(\s*['"`]@nocturnal\/shared['"`]\s*\)\s*[;,\n]/g;
  const sharedReferences = [];

  for (const file of walkJsFiles(APP_DIR)) {
    const relFile = toPosix(path.relative(APP_DIR, file));
    const source = fs.readFileSync(file, 'utf8');

    let match;
    requireRe.lastIndex = 0;
    while ((match = requireRe.exec(source)) !== null) {
      const spec = match[1];

      if (!spec.startsWith('.')) {
        continue; // package requires (express, @nocturnal/shared, ...) resolve via node_modules
      }

      if (DUTY_SHIFT_OWNED.has(moduleBaseName(spec))) {
        violation(`${relFile}: imports duty-shift-owned module '${spec}'`);
      }

      const resolved = resolveRelativeRequire(file, spec);
      if (!resolved) {
        violation(`${relFile}: require('${spec}') does not resolve — missing module in the app copy`);
        continue;
      }

      const relToApp = path.relative(APP_DIR, resolved);
      if (relToApp.startsWith('..')) {
        const rootModule = toPosix(path.relative(ROOT, resolved)).replace(/\.js$/, '');
        if (!APPROVED_ROOT_REACHING_FILES.has(relFile)) {
          violation(`${relFile}: reaches outside the app to '${spec}' — only approved wiring files may do this`);
        } else if (!APPROVED_ROOT_MODULES.has(rootModule)) {
          violation(`${relFile}: reaches root module '${rootModule}' which is not on the approved wiring allowlist`);
        }
      }
    }

    sharedPropertyRe.lastIndex = 0;
    while ((match = sharedPropertyRe.exec(source)) !== null) {
      sharedReferences.push({ file: relFile, name: match[1] });
    }

    sharedDestructureRe.lastIndex = 0;
    while ((match = sharedDestructureRe.exec(source)) !== null) {
      for (const rawName of match[1].split(',')) {
        const name = rawName.split(':')[0].trim();
        if (name) {
          sharedReferences.push({ file: relFile, name });
        }
      }
    }
  }

  // Enumerable lazy getters are visible to Object.keys without being invoked,
  // so this loads no shared modules.
  const sharedExports = new Set(Object.keys(require('@nocturnal/shared')));
  for (const { file, name } of sharedReferences) {
    if (!sharedExports.has(name)) {
      violation(`${file}: references '${name}' which @nocturnal/shared does not export`);
    }
  }
}

function checkMounts(routerFile, mounts, label) {
  const source = fs.readFileSync(routerFile, 'utf8');
  for (const mount of mounts) {
    const mountRe = new RegExp(`router\\.use\\(\\s*['"\`]${escapeRegExp(mount)}['"\`]`);
    if (!mountRe.test(source)) {
      violation(`${toPosix(path.relative(ROOT, routerFile))}: expected ${label} mount '${mount}' not found`);
    }
  }
}

function checkRouteAvailability() {
  const monolithRouter = path.join(ROOT, 'routes', 'v1', 'index.js');
  checkMounts(monolithRouter, PRESERVED_DUTY_SHIFT_MOUNTS, 'duty-shift');
  checkMounts(monolithRouter, PAYMENT_MOUNTS, 'payment');
  checkMounts(monolithRouter, PATIENT_HEALTH_MOUNTS, 'patient-health');

  const appRouter = path.join(APP_DIR, 'routes', 'index.js');
  checkMounts(appRouter, PATIENT_HEALTH_MOUNTS, 'patient-health');
  checkMounts(appRouter, ['/payments-b2c'], 'payment');
}

function main() {
  checkAppImports();
  checkRouteAvailability();

  if (violations.length > 0) {
    console.error(`patient-health split validation FAILED (${violations.length} violation(s)):`);
    for (const message of violations) {
      console.error(`  - ${message}`);
    }
    process.exit(1);
  }

  console.log('patient-health split validation passed: imports resolve, ownership is clean, all preserved mounts present.');
}

main();
