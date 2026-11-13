/**
 * Admin team access: the main admin (platform_admin) gives each team member
 * (role ops_admin) a set of admin sections, and for the verification sections
 * the partner types they may verify (e.g. one person checks delivery partners,
 * another nurses). The server enforces it on every admin endpoint
 * (middleware/adminAccess.js); the website only shows what the server allows.
 *
 *   platform_admin        everything, and manages the team
 *   ops_admin             adminAccess.sections / adminAccess.partnerKinds
 *   onboarding_reviewer   (older accounts) applications + documents, every partner type
 */

const ADMIN_SECTIONS = Object.freeze([
  { key: 'tower', label: 'Control tower', group: 'Operations', hint: 'Live demand and supply map, zone surge' },
  { key: 'care', label: 'Care marketplace', group: 'Operations', hint: 'Visits, plans, lab orders, refunds, catalogue' },
  { key: 'support', label: 'Call-back requests', group: 'Operations', hint: 'Customers who asked Nabz to call' },
  { key: 'users', label: 'Users', group: 'People', hint: 'Customers and partners, suspend or restore' },
  { key: 'partners', label: 'Partner applications', group: 'Verification', hint: 'Approve or reject people who applied to join' },
  { key: 'documents', label: 'Partner documents', group: 'Verification', hint: 'ID, licence and registration documents' },
  { key: 'verification', label: 'Staff checks', group: 'Verification', hint: 'Nurse and physio badges (ID, police, council)' },
  { key: 'vendors', label: 'Pharmacies', group: 'Pharmacy', hint: 'Approve stores, zones, flagged orders, registers' },
  { key: 'medicines', label: 'Medicines', group: 'Pharmacy', hint: 'Master catalogue, merges and recalls' },
  { key: 'payments', label: 'Payments & revenue', group: 'Money', hint: 'Payment log and revenue' },
  { key: 'withdrawals', label: 'Withdrawals', group: 'Money', hint: 'Partner payout requests' },
  { key: 'plans', label: 'Plans & coupons', group: 'Money', hint: 'Nabz Plus plans and discount codes' },
  { key: 'campaigns', label: 'Campaigns', group: 'Growth', hint: 'Offers and announcements' },
  { key: 'ads', label: 'Ads & settings', group: 'Growth', hint: 'Sponsored listings and marketplace settings' },
  { key: 'posts', label: 'Partner posts', group: 'Growth', hint: 'Photos and videos partners post' },
  { key: 'logs', label: 'Live logs', group: 'System', hint: 'Server logs (redacted)' }
]);
const SECTION_KEYS = Object.freeze(ADMIN_SECTIONS.map((s) => s.key));

/** Partner types a verifier can be limited to (PartnerApplication kinds) and their account roles. */
const VERIFY_KINDS = Object.freeze([
  { key: 'MEDICAL_STAFF', label: 'Nurses, physios & medical staff', roles: ['nurse', 'physiotherapist', 'medical_staff'] },
  { key: 'DELIVERY', label: 'Delivery partners', roles: ['delivery_partner'] },
  { key: 'PHARMACY', label: 'Pharmacies', roles: ['pharmacy_vendor'] },
  { key: 'PATH_LAB', label: 'Path labs', roles: ['lab_partner'] },
  { key: 'PHLEBOTOMIST', label: 'Phlebotomists', roles: ['phlebotomist'] },
  { key: 'PRP_TECHNICIAN', label: 'PRP technicians', roles: [] },
  { key: 'HOSPITAL', label: 'Hospitals', roles: [] }
]);
const KIND_KEYS = Object.freeze(VERIFY_KINDS.map((k) => k.key));

/** Sections where the partner-type limit applies. */
const VERIFICATION_SECTIONS = Object.freeze(['partners', 'documents', 'verification']);

const LEGACY_REVIEWER_SECTIONS = Object.freeze(['partners', 'documents']);

const isFullAdmin = (user) => !!user && user.role === 'platform_admin';

/** The sections this account can open. */
function sectionsFor(user) {
  if (!user) return [];
  if (isFullAdmin(user)) return [...SECTION_KEYS];
  if (user.role === 'onboarding_reviewer') return [...LEGACY_REVIEWER_SECTIONS];
  if (user.role === 'ops_admin') {
    const mine = (user.adminAccess && user.adminAccess.sections) || [];
    return SECTION_KEYS.filter((k) => mine.includes(k));
  }
  return [];
}

const hasSection = (user, section) => sectionsFor(user).includes(section);

/** Partner types this account may verify: null = all of them. */
function kindsFor(user) {
  if (!user) return [];
  if (isFullAdmin(user) || user.role === 'onboarding_reviewer') return null;
  if (user.role === 'ops_admin') {
    const mine = (user.adminAccess && user.adminAccess.partnerKinds) || [];
    return KIND_KEYS.filter((k) => mine.includes(k));
  }
  return [];
}

const mayVerifyKind = (user, kind) => {
  const kinds = kindsFor(user);
  return kinds === null || kinds.includes(kind);
};

/** Account roles covered by these partner types (for document / staff queues): null = all. */
function rolesForKinds(kinds) {
  if (kinds === null) return null;
  return [...new Set(VERIFY_KINDS.filter((k) => kinds.includes(k.key)).flatMap((k) => k.roles))];
}

/** Partner type of an account role (e.g. delivery_partner → DELIVERY). */
const kindForRole = (role) => (VERIFY_KINDS.find((k) => k.roles.includes(role)) || {}).key || null;

/** Clean a requested access set (unknown keys dropped, partner types only with a verification section). */
function sanitizeAccess({ sections = [], partnerKinds = [] } = {}) {
  const s = SECTION_KEYS.filter((k) => Array.isArray(sections) && sections.includes(k));
  const verifies = s.some((k) => VERIFICATION_SECTIONS.includes(k));
  const kinds = verifies ? KIND_KEYS.filter((k) => Array.isArray(partnerKinds) && partnerKinds.includes(k)) : [];
  return { sections: s, partnerKinds: kinds };
}

/** What the website needs to draw the console for this account. */
const accessSummary = (user) => ({ full: isFullAdmin(user), sections: sectionsFor(user), partnerKinds: kindsFor(user) });

module.exports = {
  ADMIN_SECTIONS, SECTION_KEYS, VERIFY_KINDS, KIND_KEYS, VERIFICATION_SECTIONS,
  isFullAdmin, sectionsFor, hasSection, kindsFor, mayVerifyKind, rolesForKinds, kindForRole, sanitizeAccess, accessSummary
};
