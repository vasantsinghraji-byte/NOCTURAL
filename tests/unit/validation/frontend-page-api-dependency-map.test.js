const vm = require('vm');

const {
  frontendJsFilePaths,
  toProjectRelativePath
} = require('./frontend-validation-utils');
const { readProjectFile } = require('./projectFileReader');

const ROUTE_PARAM_FIXTURES = {
  'duties.detail': { dutyId: 'fixture-duty-id' },
  'applications.updateStatus': { applicationId: 'fixture-application-id' },
  'calendar.availabilityDetail': { availabilityId: 'fixture-availability-id' },
  'earnings.dispute': { earningId: 'fixture-earning-id' },
  'achievements.claim': { achievementId: 'fixture-achievement-id' },
  'achievements.share': { achievementId: 'fixture-achievement-id' },
  'uploads.document': { documentType: 'mciCertificate' },
  'bookings.detail': { bookingId: 'fixture-booking-id' },
  'bookings.assign': { bookingId: 'fixture-booking-id' },
  'bookings.review': { bookingId: 'fixture-booking-id' },
  'bookings.cancel': { bookingId: 'fixture-booking-id' },
  'bookings.confirm': { bookingId: 'fixture-booking-id' },
  'bookings.enRoute': { bookingId: 'fixture-booking-id' },
  'bookings.start': { bookingId: 'fixture-booking-id' },
  'bookings.complete': { bookingId: 'fixture-booking-id' },
  'doctorAccess.revoke': { tokenId: 'fixture-token-id' },
  'webauthn.credential': { credentialId: 'fixture-credential-id' },
  'adminSecurityAudit.webauthnExportJob': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportAuditEvents': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportAuditEventsCsv': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportAuditReport': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportAuditReportJob': { jobId: 'fixture-job-id', reportJobId: 'fixture-report-job-id' },
  'adminSecurityAudit.webauthnExportAuditReportDownload': { jobId: 'fixture-job-id', reportJobId: 'fixture-report-job-id' },
  'adminSecurityAudit.webauthnExportCancel': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportDownload': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportQuarantineApprovalHistoryCsv': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportQuarantineApprovalHistoryReport': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportQuarantineApprovalHistoryReportJob': { jobId: 'fixture-job-id', reportJobId: 'fixture-report-job-id' },
  'adminSecurityAudit.webauthnExportQuarantineApprovalHistoryReportDownload': { jobId: 'fixture-job-id', reportJobId: 'fixture-report-job-id' },
  'adminSecurityAudit.webauthnExportQuarantineDelete': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportQuarantineRelease': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportQuarantineReleaseApprove': { jobId: 'fixture-job-id' },
  'adminSecurityAudit.webauthnExportRetry': { jobId: 'fixture-job-id' }
};

const HELPER_ROUTE_PATTERNS = [
  { pattern: /NocturnalSession\.getActiveUser\(/g, routeKey: 'auth.me' },
  { pattern: /NocturnalSession\.fetchMyApplications\(/g, routeKey: 'applications.list' },
  { pattern: /NocturnalSession\.fetchApplicationStats\(/g, routeKey: 'applications.stats' },
  { pattern: /NocturnalSession\.handleDutyApplication\(/g, routeKey: 'applications.list' },
  { pattern: /NocturnalSession\.applyForDuty\(/g, routeKey: 'applications.list' }
];

const ROUTE_KEY_PATTERNS = [
  /AppConfig\.fetchRoute\('([^']+)'/g,
  /NocturnalSession\.loadOptionalDraft\('([^']+)'/g
];

const EXPECTED_FRONTEND_API_DEPENDENCY_MAP = {
  'client/public/js/admin-analytics.js': ['analytics.hospitalDashboard'],
  'client/public/js/admin-applications.js': ['applications.received', 'applications.updateStatus'],
  'client/public/js/admin-dashboard.js': ['applications.received', 'auth.me', 'bookings.assign', 'bookings.list', 'bookings.providers', 'duties.myDuties'],
  'client/public/js/admin-post-duty.js': ['duties.list'],
  'client/public/js/admin-profile.js': ['auth.me'],
  'client/public/js/admin-settings.js': ['adminSecurityAudit.webauthn', 'analytics.hospitalDashboard', 'hospitalSettings.root'],
  'client/public/js/admin-waitlist.js': ['adminFunnel.dailyAnalytics', 'adminFunnel.waitlist', 'adminFunnel.waitlistStatus'],
  'client/public/js/doctor-achievements.js': ['achievements.claim', 'achievements.leaderboard', 'achievements.list', 'achievements.share'],
  'client/public/js/doctor-availability.js': ['calendar.availability', 'calendar.availabilityDetail'],
  'client/public/js/doctor-browse-shifts-enhanced.js': ['applications.list', 'auth.me', 'duties.list'],
  'client/public/js/doctor-calendar.js': ['calendar.events'],
  'client/public/js/doctor-dashboard.js': ['applications.list', 'applications.stats', 'auth.me', 'duties.list'],
  'client/public/js/doctor-duty-details.js': ['applications.list', 'duties.detail'],
  'client/public/js/doctor-earnings.js': ['earnings.dashboard', 'earnings.dispute', 'earnings.optimizer'],
  'client/public/js/doctor-onboarding.js': ['auth.me', 'auth.register', 'uploads.document', 'uploads.profilePhoto'],
  'client/public/js/doctor-profile-enhanced.js': ['auth.me', 'uploads.document', 'uploads.profilePhoto'],
  'client/public/js/doctor-my-applications.js': ['applications.list', 'applications.stats'],
  'client/public/js/frontend-session.js': ['applications.list', 'applications.stats', 'auth.logout', 'auth.me'],
  'client/public/js/landing.js': ['auth.login', 'auth.me', 'auth.register', 'funnelEvents.create'],
  'client/public/js/native-capabilities.js': ['mobileDevices.root'],
  'client/public/js/operator-audit.js': [
    'adminSecurityAudit.webauthn',
    'adminSecurityAudit.webauthnExportAuditEvents',
    'adminSecurityAudit.webauthnExportAuditReport',
    'adminSecurityAudit.webauthnExportAuditReportJob',
    'adminSecurityAudit.webauthnExportBulkDeleteStaleQuarantine',
    'adminSecurityAudit.webauthnExportCancel',
    'adminSecurityAudit.webauthnExportCleanup',
    'adminSecurityAudit.webauthnExportJob',
    'adminSecurityAudit.webauthnExportQuarantineApprovalHistoryReport',
    'adminSecurityAudit.webauthnExportQuarantineApprovalHistoryReportJob',
    'adminSecurityAudit.webauthnExportQuarantineDelete',
    'adminSecurityAudit.webauthnExportQuarantineRelease',
    'adminSecurityAudit.webauthnExportQuarantineReleaseApprove',
    'adminSecurityAudit.webauthnExportQuota',
    'adminSecurityAudit.webauthnExportRetentionSummary',
    'adminSecurityAudit.webauthnExportRetry',
    'adminSecurityAudit.webauthnExports'
  ],
  'client/public/js/patient-booking-details.js': ['bookings.cancel', 'bookings.detail', 'bookings.review'],
  'client/public/js/patient-booking-form.js': ['bookings.list', 'paymentsB2c.createOrder', 'paymentsB2c.failure', 'paymentsB2c.verify'],
  'client/public/js/patient-dashboard.js': ['bookings.patientMine', 'patients.stats'],
  'client/public/js/patient-health-dashboard.js': ['doctorAccess.list', 'doctorAccess.revoke', 'patientDashboard.emergencyQr', 'patientDashboard.root'],
  'client/public/js/patient-health-intake-form.js': ['healthIntake.draft', 'healthIntake.form', 'healthIntake.submit'],
  'client/public/js/patient-login.js': ['patients.login'],
  'client/public/js/patient-clinical-history-form.js': ['healthIntake.draft', 'healthIntake.form', 'healthIntake.submit'],
  'client/public/js/patient-register.js': ['patients.register'],
  'client/public/js/provider-dashboard.js': ['bookings.complete', 'bookings.confirm', 'bookings.enRoute', 'bookings.providerMine', 'bookings.start'],
  'client/public/js/provider-login.js': ['auth.login'],
  'client/public/js/rate-limit-dashboard.js': ['adminMetrics.rateLimits'],
  'client/public/js/session-management.js': [
    'webauthn.credential',
    'webauthn.credentials',
    'webauthn.lostDeviceRecover',
    'webauthn.passwordOptions',
    'webauthn.passwordVerify',
    'webauthn.recoveryCodeStatus',
    'webauthn.recoveryCodes',
    'webauthn.registrationOptions',
    'webauthn.registrationVerify'
  ],
  'client/public/js/shared-register.js': ['auth.register', 'hospitalWaitlist.create']
};

const RAW_FETCH_ALLOWLIST = [
  'client/public/js/auth.js',
  'client/public/js/frontend-session.js',
  'client/public/js/notification-center.js',
  'client/public/js/pagination.js',
  'client/public/js/unified-nav.js',
  'client/public/js/utils.js'
].sort();

function extractRouteKeys(source) {
  const routeKeys = new Set();

  ROUTE_KEY_PATTERNS.forEach((pattern) => {
    const matches = source.matchAll(pattern);
    for (const match of matches) {
      routeKeys.add(match[1]);
    }
  });

  HELPER_ROUTE_PATTERNS.forEach(({ pattern, routeKey }) => {
    const helperPattern = new RegExp(pattern.source, pattern.flags.replace('g', ''));
    if (helperPattern.test(source)) {
      routeKeys.add(routeKey);
    }
  });

  return Array.from(routeKeys).sort();
}

function loadAppConfig() {
  const configSrc = readProjectFile('client/public/js/config.js');
  const context = {
    AbortController,
    FormData: function FormData() {},
    URLSearchParams,
    console: { log() {}, error() {}, warn() {}, info() {} },
    fetch: async function fetch() {
      return {
        ok: true,
        text: async function text() {
          return '';
        }
      };
    },
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    },
    document: {
      querySelector() {
        return null;
      }
    },
    setTimeout,
    clearTimeout,
    window: {
      __NOCTURNAL_API_ORIGIN__: '',
      location: {
        hostname: 'example.com',
        origin: 'https://example.com',
        protocol: 'https:'
      }
    }
  };

  context.window.document = context.document;
  context.window.localStorage = context.localStorage;
  context.window.fetch = context.fetch;
  context.window.console = context.console;
  context.window.setTimeout = setTimeout;
  context.window.clearTimeout = clearTimeout;

  vm.createContext(context);
  vm.runInContext(configSrc, context);

  return context.window.AppConfig;
}

describe('Frontend Page API Dependency Map', () => {
  it('should keep the complete tracked frontend page/API dependency map aligned to shared route keys', () => {
    const actualMap = {};

    frontendJsFilePaths.forEach((absolutePath) => {
      const relativePath = toProjectRelativePath(absolutePath);
      const routeKeys = extractRouteKeys(readProjectFile(toProjectRelativePath(absolutePath)));

      if (routeKeys.length > 0) {
        actualMap[relativePath] = routeKeys;
      }
    });

    expect(actualMap).toEqual(EXPECTED_FRONTEND_API_DEPENDENCY_MAP);
  });

  it('should resolve every tracked dependency through AppConfig.endpoint()', () => {
    const appConfig = loadAppConfig();

    Object.values(EXPECTED_FRONTEND_API_DEPENDENCY_MAP)
      .flat()
      .filter((value, index, list) => list.indexOf(value) === index)
      .sort()
      .forEach((routeKey) => {
        expect(() => appConfig.endpoint(routeKey, {
          params: ROUTE_PARAM_FIXTURES[routeKey] || {}
        })).not.toThrow();
      });
  });

  it('should limit raw AppConfig.fetch usage to shared transport helpers', () => {
    const rawFetchUsers = frontendJsFilePaths
      .map((absolutePath) => toProjectRelativePath(absolutePath))
      .filter((relativePath) => {
        const source = readProjectFile(relativePath);
        return /AppConfig\.fetch\(/.test(source);
      })
      .sort();

    expect(rawFetchUsers).toEqual(RAW_FETCH_ALLOWLIST);
  });
});
