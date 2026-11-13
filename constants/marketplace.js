/**
 * Care marketplace enums (physio and path labs as "shops" with rate cards).
 * See docs/product/PROVIDER_MARKETPLACE_PLAN.md.
 */

// What a shop offers. NURSING shops are the planned-visit side of hybrid nursing.
// HOMECARE = attendants, elderly / baby / post-hospital care, booked by days and
// shift times with the same caregiver every day.
const STORE_KINDS = ['PHYSIO', 'LAB', 'NURSING', 'HOMECARE'];

// SOLO = one professional (their own calendar); CLINIC = a place with several
// beds/professionals (capacity > 1); LAB = a path lab.
const STORE_FORMATS = ['SOLO', 'CLINIC', 'LAB'];

const STORE_STATUSES = ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'];

// Where the care happens.
const CARE_MODES = ['HOME', 'CLINIC'];

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// PENDING_PAYMENT: prepaid plan waiting for payment (slots held for a while).
const CARE_PLAN_STATUSES = ['PENDING_PAYMENT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED'];

// PREPAID: whole plan now (multi-session discount applies); PER_SESSION: pay after each visit.
const PLAN_PAYMENT_MODES = ['PREPAID', 'PER_SESSION'];

// Who may own a shop of each kind.
const STORE_OWNER_ROLES = Object.freeze({
  PHYSIO: ['physiotherapist'],
  LAB: ['lab_partner'],
  NURSING: ['nurse', 'medical_staff'],
  HOMECARE: ['medical_staff', 'nurse']
});

// Catalog category for each shop kind.
const KIND_CATEGORIES = Object.freeze({
  PHYSIO: ['PHYSIOTHERAPY', 'PACKAGE'],
  LAB: ['LAB_TEST', 'LAB_PACKAGE'],
  NURSING: ['NURSING'],
  HOMECARE: ['HOME_CARE']
});

module.exports = {
  STORE_KINDS,
  STORE_FORMATS,
  STORE_STATUSES,
  CARE_MODES,
  WEEKDAYS,
  CARE_PLAN_STATUSES,
  PLAN_PAYMENT_MODES,
  STORE_OWNER_ROLES,
  KIND_CATEGORIES
};
