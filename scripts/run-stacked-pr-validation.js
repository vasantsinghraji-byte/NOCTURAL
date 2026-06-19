const { spawnSync } = require('child_process');

const STACK_BRANCHES = new Set([
  'chore/repo-governance-lint-ci',
  'chore/frontend-static-build',
  'refactor/core-safe-query-utils',
  'feature/security-audit-notification-core',
  'fix/auth-session-revocation',
  'feature/auth-webauthn-recovery',
  'feature/admin-security-audit-export',
  'fix/uploads-stored-file-authorization',
  'fix/bookings-idempotent-payments',
  'fix/patient-data-hardening',
  'fix/provider-ops-hardening',
  'fix/frontend-security-dashboards',
  'docs/archive-microservice-notes'
]);

const DEPENDENCY_AUDIT_BRANCH = 'fix/dependency-audit-highs';
const STACK_CI_GOVERNANCE_BRANCH = 'chore/stack-ready-ci-gates';

const command = (run, env = {}) => ({ run, env });

const TESTS = {
  'chore/repo-governance-lint-ci': [
    command('npm run governance:check'),
    command('npm run validate:codeowners-security'),
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/codeowners-security-coverage.test.js tests/unit/security/pr-stack-scope.test.js tests/unit/security/stack-ready-ci-gates.test.js tests/unit/eslint-rules/no-raw-html-sinks.test.js')
  ],
  'chore/frontend-static-build': [
    command('npm --prefix client ci --ignore-scripts'),
    command('npm --prefix client run build'),
    command('node -e "const fs=require(\'fs\'); const html=\'client/dist/index.html\'; if (!fs.existsSync(html)) throw new Error(`${html} missing`);"')
  ],
  'refactor/core-safe-query-utils': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/utils/tenant-scope.test.js')
  ],
  'feature/security-audit-notification-core': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/mobile-device-ownership.test.js tests/unit/security/notification-route-authorization.test.js tests/unit/security/notification-service-sanitization.test.js tests/unit/security/security-notification-outbox.test.js')
  ],
  'fix/auth-session-revocation': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/authorization/session-auth.test.js tests/unit/security/auth-middleware.test.js tests/unit/security/compromised-password.test.js tests/unit/security/password-mfa-outbox-hardening.test.js tests/unit/security/refresh-session-password-invalidation.test.js tests/unit/security/token-identity-contract.test.js tests/integration/auth-change-password.test.js tests/integration/security/auth-flow.test.js')
  ],
  'feature/auth-webauthn-recovery': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/web-authn-credential-recovery.test.js tests/unit/security/web-authn-outbox-alert-contract.test.js tests/integration/security/staging-webauthn-smoke-api.test.js')
  ],
  'feature/admin-security-audit-export': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/audit-export-operator-notification.test.js tests/unit/security/audit-export-retry-policy.test.js tests/unit/security/audit-export-storage-cloud.test.js tests/unit/security/codeql-alert-export.test.js tests/unit/monitoring/alertmanager-template-rendering.test.js tests/integration/security/audit-export-quarantine-flow.test.js tests/integration/security/audit-export-quota.test.js', {
      RUN_AUDIT_EXPORT_QUOTA_REAL_DB: 'true',
      RUN_AUDIT_EXPORT_QUARANTINE_FLOW_REAL_DB: 'true'
    })
  ],
  'fix/uploads-stored-file-authorization': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/upload-gcs-magic-byte.test.js tests/unit/security/upload-route-public-errors.test.js tests/unit/security/upload-storage-contract.test.js')
  ],
  'fix/bookings-idempotent-payments': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/data-integrity/booking-integrity.test.js tests/unit/infrastructure/idempotency-index-contract.test.js tests/unit/middleware/idempotency.test.js tests/unit/security/payment-security.test.js')
  ],
  'fix/patient-data-hardening': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/data-integrity/health-record-metrics.test.js tests/unit/security/upload-gcs-magic-byte.test.js')
  ],
  'fix/provider-ops-hardening': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/certification-route-authorization.test.js tests/unit/authorization/cross-hospital-auth.test.js tests/integration/security/doctor-access-post-routes.test.js')
  ],
  'fix/frontend-security-dashboards': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/notification-center-xss.test.js tests/unit/validation/frontend-dom-smoke.test.js tests/unit/validation/frontend-page-api-dependency-map.test.js tests/unit/security/web-authn-outbox-alert-contract.test.js'),
    command('npm --prefix client ci --ignore-scripts'),
    command('npm --prefix client run build')
  ],
  'docs/archive-microservice-notes': [
    command('npm run governance:check')
  ],
  [DEPENDENCY_AUDIT_BRANCH]: [
    command('npm audit --audit-level=high'),
    command('npm --prefix client audit --audit-level=high')
  ]
};

const LINTS = {
  'chore/repo-governance-lint-ci': [
    command('npm run governance:check'),
    command('npm run validate:codeowners-security'),
    command('node --check scripts/check-lint-warning-baseline.js'),
    command('node --check scripts/check-pr-stack-scope.js'),
    command('node --check scripts/run-stacked-pr-validation.js')
  ],
  'chore/frontend-static-build': [
    command('node --check client/scripts/serve-static.js'),
    command('node --check client/build.config.js')
  ],
  'refactor/core-safe-query-utils': [
    command('node --check utils/tenantScope.js'),
    command('node --check utils/safeMongo.js'),
    command('node --check utils/pickAllowedFields.js'),
    command('node --check utils/requestSecurityMetadata.js')
  ],
  'feature/security-audit-notification-core': [
    command('node --check services/mobileDeviceService.js'),
    command('node --check services/securityAuditService.js'),
    command('node --check services/securityNotificationService.js')
  ],
  'fix/auth-session-revocation': [
    command('node --check controllers/authController.js'),
    command('node --check middleware/auth.js'),
    command('node --check middleware/patientAuth.js'),
    command('node --check routes/analytics.js'),
    command('node --check services/authService.js'),
    command('node --check services/patientService.js'),
    command('node --check services/passwordSecurityService.js'),
    command('node --check services/compromisedPasswordService.js'),
    command('node --check utils/authTokens.js')
  ],
  'feature/auth-webauthn-recovery': [
    command('node --check services/webAuthnService.js'),
    command('node --check routes/webAuthn.js')
  ],
  'feature/admin-security-audit-export': [
    command('node --check services/securityAuditService.js'),
    command('node --check routes/admin/securityAudit.js'),
    command('node --check config/rateLimit.js'),
    command('node --check constants/enums.js')
  ],
  'fix/uploads-stored-file-authorization': [
    command('node --check controllers/patientAnalyticsController.js'),
    command('node --check routes/patientAnalytics.js')
  ],
  'fix/bookings-idempotent-payments': [
    command('node --check services/bookingService.js'),
    command('node --check middleware/idempotency.js')
  ],
  'fix/patient-data-hardening': [
    command('node --check services/healthMetricService.js'),
    command('node --check services/healthRecordService.js')
  ],
  'fix/provider-ops-hardening': [
    command('node --check routes/certifications.js'),
    command('node --check constants/roles.js')
  ],
  'fix/frontend-security-dashboards': [
    command('node --check client/public/js/pagination.js'),
    command('node --check client/public/js/sw-register.js'),
    command('node --check client/public/js/notification-center.js')
  ],
  'docs/archive-microservice-notes': [
    command('npm run governance:check')
  ],
  [DEPENDENCY_AUDIT_BRANCH]: [
    command('npm run governance:check')
  ]
};

const SECURITY = {
  'chore/repo-governance-lint-ci': [
    command('npm run validate:codeowners-security')
  ],
  'chore/frontend-static-build': [
    command('node --check client/scripts/serve-static.js')
  ],
  'refactor/core-safe-query-utils': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/utils/tenant-scope.test.js')
  ],
  'feature/security-audit-notification-core': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/mobile-device-ownership.test.js tests/unit/security/notification-route-authorization.test.js tests/unit/security/notification-service-sanitization.test.js')
  ],
  'fix/auth-session-revocation': [
    command('npm run test:security-gate')
  ],
  'feature/auth-webauthn-recovery': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/web-authn-credential-recovery.test.js tests/unit/security/web-authn-outbox-alert-contract.test.js')
  ],
  'feature/admin-security-audit-export': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/audit-export-operator-notification.test.js tests/unit/security/audit-export-retry-policy.test.js tests/unit/security/audit-export-storage-cloud.test.js tests/unit/security/codeql-alert-export.test.js')
  ],
  'fix/uploads-stored-file-authorization': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/upload-gcs-magic-byte.test.js tests/unit/security/upload-route-public-errors.test.js tests/unit/security/upload-storage-contract.test.js')
  ],
  'fix/bookings-idempotent-payments': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/infrastructure/idempotency-index-contract.test.js tests/unit/middleware/idempotency.test.js tests/unit/security/payment-security.test.js')
  ],
  'fix/patient-data-hardening': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/data-integrity/health-record-metrics.test.js')
  ],
  'fix/provider-ops-hardening': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/certification-route-authorization.test.js tests/unit/authorization/cross-hospital-auth.test.js')
  ],
  'fix/frontend-security-dashboards': [
    command('npm test -- --runInBand --runTestsByPath tests/unit/security/notification-center-xss.test.js tests/unit/security/web-authn-outbox-alert-contract.test.js')
  ],
  'docs/archive-microservice-notes': [
    command('npm run governance:check')
  ],
  [DEPENDENCY_AUDIT_BRANCH]: [
    command('npm audit --audit-level=high'),
    command('npm --prefix client audit --audit-level=high')
  ]
};

const FULL = {
  lint: [
    command('npm run governance:check'),
    command('npm run lint:baseline'),
    command('npm run scan:csp-html'),
    command('npm run scan:inline-styles:strict')
  ],
  test: [
    command('npm run test:ci')
  ],
  security: [
    command('npm audit --audit-level=high'),
    command('npm --prefix client audit --audit-level=high'),
    command('npm run test:security-gate')
  ],
  deploy: [
    command('npm run test:deploy-gate')
  ],
  publicFunnel: [
    command('npm run test:e2e:public-funnel'),
    command('npm run test:e2e:csp')
  ]
};

const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '';
const mode = process.argv[2];

const tables = { lint: LINTS, test: TESTS, security: SECURITY };

const validationBranch = branch === STACK_CI_GOVERNANCE_BRANCH
  ? 'chore/repo-governance-lint-ci'
  : branch;
const isStackBranch = STACK_BRANCHES.has(branch) ||
  branch === DEPENDENCY_AUDIT_BRANCH ||
  branch === STACK_CI_GOVERNANCE_BRANCH;
const selected = isStackBranch && tables[mode] && tables[mode][validationBranch]
  ? tables[mode][validationBranch]
  : FULL[mode];

if (!mode || !selected) {
  console.error(`Unknown validation mode: ${mode || '(missing)'}`);
  process.exit(2);
}

if (isStackBranch) {
  console.log(`Running targeted ${mode} validation for stacked branch ${branch}`);
} else {
  console.log(`Running full ${mode} validation for branch ${branch || '(local)'}`);
}

for (const step of selected) {
  console.log(`\n> ${step.run}`);
  const result = spawnSync(step.run, {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...step.env }
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status) {
    process.exit(result.status);
  }
}
