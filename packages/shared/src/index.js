'use strict';

/**
 * @nocturnal/shared - shared toolkit facade (restructure Phase 1).
 *
 * Every export is a lazy getter over a module that still lives in its
 * original root location; nothing is loaded until an export is first
 * accessed, so requiring this package (or reading one export) never
 * initializes unrelated subsystems (storage, upload, Redis-backed
 * caching, notification/WebAuthn services).
 *
 * Decision record and export inventory: docs/PHASE1_IMPLEMENTATION_NOTES.md.
 * Patient-owned modules (patientAuth, healthDataAccess, the outbox models,
 * bookingReviewAggregate) are intentionally not exported.
 */

function lazyExport(name, load) {
  Object.defineProperty(module.exports, name, {
    enumerable: true,
    configurable: false,
    get: load,
  });
}

// utils
lazyExport('logger', () => require('../../../utils/logger'));
lazyExport('responseHelper', () => require('../../../utils/responseHelper'));
lazyExport('errors', () => require('../../../utils/errors'));
lazyExport('encryption', () => require('../../../utils/encryption'));
lazyExport('mobileAuth', () => require('../../../utils/mobileAuth'));
lazyExport('authCookies', () => require('../../../utils/authCookies'));
lazyExport('safeMongo', () => require('../../../utils/safeMongo'));
lazyExport('queryUpdateOptions', () => require('../../../utils/queryUpdateOptions'));
lazyExport('requestSecurityMetadata', () => require('../../../utils/requestSecurityMetadata'));
lazyExport('monitoring', () => require('../../../utils/monitoring'));
lazyExport('number', () => require('../../../utils/number'));
lazyExport('pagination', () => require('../../../utils/pagination'));
lazyExport('tenantScope', () => require('../../../utils/tenantScope'));
lazyExport('pickAllowedFields', () => require('../../../utils/pickAllowedFields'));
// Added in Phase 3: surfaced by the patient-health dependency trace; shared per
// root usage (spamTrap: auth/waitlist/patient routes; authTokens: auth +
// patientAuth middleware; localFileSystem: uploadEnhanced + geminiAnalysis).
lazyExport('authTokens', () => require('../../../utils/authTokens'));
lazyExport('localFileSystem', () => require('../../../utils/localFileSystem'));

// middleware
lazyExport('auth', () => require('../../../middleware/auth'));
lazyExport('validation', () => require('../../../middleware/validation'));
lazyExport('queryCache', () => require('../../../middleware/queryCache'));
lazyExport('rateLimiter', () => require('../../../middleware/rateLimiter'));
lazyExport('idempotency', () => require('../../../middleware/idempotency'));
lazyExport('upload', () => require('../../../middleware/upload'));
lazyExport('spamTrap', () => require('../../../middleware/spamTrap'));

// config
lazyExport('storage', () => require('../../../config/storage'));

// models
lazyExport('User', () => require('../../../models/user'));

// services
lazyExport('notificationService', () => require('../../../services/notificationService'));
lazyExport('refreshSessionService', () => require('../../../services/refreshSessionService'));
lazyExport('securityAuditService', () => require('../../../services/securityAuditService'));
lazyExport('passwordSecurityService', () => require('../../../services/passwordSecurityService'));
lazyExport('compromisedPasswordService', () => require('../../../services/compromisedPasswordService'));
