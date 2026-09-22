/**
 * Shared Enums & Field Constraints
 *
 * Single source of truth for enum values and field limits used by both
 * Mongoose models and express-validator validators.
 *
 * Rule: update THIS file, and both layers stay in sync automatically.
 */

// ── Roles ──────────────────────────────────────────────────────────────

/** Roles stored in the User model (staff accounts) */
// 'admin' is a hospital-scoped admin (tenant = their `hospital`); 'platform_admin'
// is a cross-tenant operator for platform-level actions (e.g. credential verification).
// 'medical_staff' = general-purpose field staff; 'phlebotomist' = lab sample collectors.
const STAFF_ROLES = ['doctor', 'nurse', 'physiotherapist', 'medical_staff', 'phlebotomist', 'admin', 'platform_admin'];

/** Staff roles allowed during /auth/register self-registration (no admin). Patients use /patients/register. */
const REGISTRATION_ROLES = ['doctor', 'nurse', 'physiotherapist', 'medical_staff', 'phlebotomist'];

// ── Medical Specializations ────────────────────────────────────────────

const SPECIALIZATIONS = [
  'Home Healthcare',
  'Nursing Care',
  'Physiotherapy',
  'Internal Medicine',
  'Emergency Medicine',
  'General Surgery',
  'Anaesthesiology',
  'Intensive Care / Critical Care Medicine',
  'Obstetrics & Gynaecology',
  'Orthopaedics',
  'Urology',
  'Neurosurgery',
  'ENT (Otolaryngology)',
  'Cardiothoracic Surgery',
  'General Paediatrics',
  'Neonatology',
  'General Psychiatry',
  'Radiology',
  'Pathology / Laboratory Medicine',
  'Palliative Medicine',
  'General Medicine',
  'Other'
];

// ── Departments ────────────────────────────────────────────────────────

const DEPARTMENTS = [
  'Emergency', 'ICU', 'OPD', 'Surgery', 'General Ward',
  'Maternity', 'Pediatrics', 'Psychiatry', 'Other'
];

// ── Booking / Service Types ────────────────────────────────────────────

const BOOKING_SERVICE_TYPES = [
  // Nursing Services
  'INJECTION', 'IV_DRIP', 'WOUND_DRESSING', 'CATHETER_CARE',
  'BED_SORE_CARE', 'POST_SURGERY_CARE', 'ELDERLY_CARE', 'BABY_CARE',
  'NEBULIZATION', 'BLOOD_PRESSURE_CHECK', 'BLOOD_SUGAR_CHECK', 'GENERAL_NURSING',

  // Physiotherapy Services
  'PHYSIOTHERAPY_SESSION', 'POST_SURGERY_REHAB',
  'SPORTS_INJURY', 'SPORTS_INJURY_THERAPY',
  'BACK_PAIN_THERAPY', 'KNEE_PAIN_THERAPY', 'STROKE_REHAB',
  'GERIATRIC_PHYSIO', 'PEDIATRIC_PHYSIO', 'NEUROLOGICAL_REHAB',

  // Packages
  'ELDERLY_CARE_PACKAGE', 'POST_SURGERY_PACKAGE',
  'PHYSIO_PACKAGE_5', 'PHYSIO_PACKAGE_10', 'PHYSIO_PACKAGE_15',
  'HOME_NURSING_MONTHLY', 'NEWBORN_CARE_PACKAGE',

  'OTHER'
];

// ── Booking Statuses ───────────────────────────────────────────────────

const BOOKING_STATUSES = [
  'REQUESTED', 'SEARCHING', 'ASSIGNED', 'CONFIRMED',
  'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
];

// ── Duty Statuses ──────────────────────────────────────────────────────

const DUTY_STATUSES = ['OPEN', 'FILLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

// ── Urgency Levels ─────────────────────────────────────────────────────

const URGENCY_LEVELS = ['NORMAL', 'URGENT', 'EMERGENCY'];

// ── Employment Statuses ────────────────────────────────────────────────

const EMPLOYMENT_STATUSES = ['Full-time', 'Part-time', 'Freelance', 'Between Jobs', 'Student'];

// ── Shift Preferences ──────────────────────────────────────────────────

const SHIFT_PREFERENCES = ['Morning', 'Evening', 'Night', 'Weekend', '24hr'];

// ── Lab Test Categories ───────────────────────────────────────────────

const LAB_TEST_CATEGORIES = [
  'HEMATOLOGY', 'BIOCHEMISTRY', 'URINE_ANALYSIS', 'THYROID',
  'DIABETES', 'LIPID', 'LIVER', 'KIDNEY', 'CARDIAC',
  'VITAMIN', 'ALLERGY', 'HORMONES', 'INFECTION',
  'FULL_BODY_CHECKUP', 'COVID', 'OTHER'
];

// ── Sample Statuses ───────────────────────────────────────────────────

const SAMPLE_STATUSES = [
  'SCHEDULED', 'COLLECTED', 'IN_TRANSIT', 'AT_LAB',
  'PROCESSING', 'REPORT_READY', 'DELIVERED'
];

// ── Consultation Types & Statuses ─────────────────────────────────────

const CONSULTATION_TYPES = ['CHAT', 'AUDIO', 'VIDEO'];

const CONSULTATION_STATUSES = [
  'REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED'
];

// ── Emergency Statuses ────────────────────────────────────────────────

const EMERGENCY_STATUSES = [
  'TRIGGERED', 'DISPATCHING', 'STAFF_ASSIGNED', 'EN_ROUTE',
  'ARRIVED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'
];

// ── Field Constraints (shared between model validations & express-validator) ──

const FIELD_LIMITS = {
  NAME:        { min: 2,  max: 100 },
  PASSWORD:    { min: 8,  max: 128 },
  EMAIL:       { max: 255 },
  BIO:         { max: 500 },
  DESCRIPTION: { min: 20, max: 2000 },
  TITLE:       { min: 5,  max: 200 },
  PHONE_E164:  /^\+?[1-9]\d{1,14}$/,
  PASSWORD_PATTERN: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/
};

module.exports = {
  STAFF_ROLES,
  REGISTRATION_ROLES,
  SPECIALIZATIONS,
  DEPARTMENTS,
  BOOKING_SERVICE_TYPES,
  BOOKING_STATUSES,
  DUTY_STATUSES,
  URGENCY_LEVELS,
  EMPLOYMENT_STATUSES,
  SHIFT_PREFERENCES,
  LAB_TEST_CATEGORIES,
  SAMPLE_STATUSES,
  CONSULTATION_TYPES,
  CONSULTATION_STATUSES,
  EMERGENCY_STATUSES,
  FIELD_LIMITS
};
