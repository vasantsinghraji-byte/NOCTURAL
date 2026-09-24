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
// MedRush quick-commerce adds: pharmacy_vendor (store staff), delivery_partner (rider),
// medical_staff (paramedic/home-visit) and phlebotomist (lab sample collection).
const STAFF_ROLES = [
  'doctor', 'nurse', 'physiotherapist', 'admin', 'platform_admin',
  'pharmacy_vendor', 'delivery_partner', 'medical_staff', 'phlebotomist', 'lab_partner'
];

/** Staff roles allowed during /auth/register self-registration (no admin). Patients use /patients/register. */
// Vendor/delivery/medical_staff/phlebotomist are admin-seeded/verified, so they are NOT self-registerable.
const REGISTRATION_ROLES = ['doctor', 'nurse', 'physiotherapist'];

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

// ══════════════════════════════════════════════════════════════════════
//  MedRush quick-commerce enums (pharmacy marketplace, lab, consult, SOS)
// ══════════════════════════════════════════════════════════════════════

// ── Pharmacy: medicine catalog ─────────────────────────────────────────

const MEDICINE_FORMS = [
  'TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'INJECTION', 'DROPS',
  'CREAM', 'OINTMENT', 'GEL', 'INHALER', 'SPRAY', 'POWDER', 'SACHET',
  'SOLUTION', 'LOTION', 'SUPPOSITORY', 'PATCH', 'DEVICE', 'OTHER'
];

// OTC = over the counter; PRESCRIPTION / SCHEDULE_H(1) require an uploaded prescription.
const MEDICINE_SCHEDULE_TYPES = ['OTC', 'PRESCRIPTION', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X'];

const MEDICINE_CATEGORIES = [
  'PAIN_RELIEF', 'ANTIBIOTIC', 'ANTACID', 'DIABETES', 'CARDIAC',
  'RESPIRATORY', 'DERMATOLOGY', 'VITAMINS_SUPPLEMENTS', 'COLD_FLU',
  'GASTRO', 'GYNAECOLOGY', 'PEDIATRIC', 'OPHTHALMOLOGY', 'FIRST_AID',
  'DEVICES', 'AYURVEDA', 'PERSONAL_CARE', 'OTHER'
];

// ── Pharmacy: order lifecycle ──────────────────────────────────────────

const PHARMACY_ORDER_STATUSES = [
  'PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED'
];

const PHARMACY_VENDOR_STATUSES = ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'];

// DELIVERY = rider brings it to the customer; STAFF_PICKUP = the nurse/medical
// staff collects it from the store on the way to a home-care visit.
const PHARMACY_FULFILMENT_TYPES = ['DELIVERY', 'STAFF_PICKUP'];

// Home-care supplies: who provides each item needed for the visit.
const CARE_SUPPLY_SOURCES = ['PATIENT_HAS', 'STAFF_BRINGS'];

// ── Delivery / rider ───────────────────────────────────────────────────

const DELIVERY_STATUSES = [
  'ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_STORE', 'PICKED_UP',
  'ARRIVED_AT_CUSTOMER', 'DELIVERED', 'CANCELLED'
];

// ── Lab tests ──────────────────────────────────────────────────────────

const LAB_TEST_CATEGORIES = [
  'HEMATOLOGY', 'BIOCHEMISTRY', 'URINE_ANALYSIS', 'THYROID', 'DIABETES',
  'LIPID', 'LIVER', 'KIDNEY', 'CARDIAC', 'VITAMIN', 'ALLERGY',
  'FULL_BODY_CHECKUP', 'COVID', 'HORMONE', 'INFECTION', 'OTHER'
];

const LAB_SAMPLE_TYPES = ['BLOOD', 'URINE', 'STOOL', 'SWAB', 'SALIVA', 'OTHER'];

const SAMPLE_STATUSES = [
  'SCHEDULED', 'COLLECTED', 'IN_TRANSIT', 'AT_LAB',
  'PROCESSING', 'REPORT_READY', 'DELIVERED', 'CANCELLED'
];

// ── Doctor consultation ────────────────────────────────────────────────

const CONSULTATION_TYPES = ['CHAT', 'AUDIO', 'VIDEO'];

const CONSULTATION_STATUSES = [
  'REQUESTED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'
];

// ── Serviceability & inventory ledger ──────────────────────────────────

// Ops lever per delivery zone (rain, rider shortage) — shrinks delivery radius.
const ZONE_STRESS_LEVELS = ['NORMAL', 'HIGH', 'SEVERE'];

// Append-only stock ledger (models/inventoryMovement.js).
const INVENTORY_MOVEMENT_TYPES = [
  'ORDER_RESERVED', // stock taken for an order (delta < 0)
  'ORDER_RELEASED', // returned on cancel / reject / payment expiry (delta > 0)
  'ADJUSTMENT', // vendor/admin stock count change (either sign)
  'MARKED_UNAVAILABLE', // store said "don't have it" on an order: count zeroed (delta < 0)
  'BATCH_RECEIVED', // new stock booked in against a batch (delta > 0)
  'EXPIRY_QUARANTINE', // batch fell inside the minimum shelf life: out of sellable stock
  'RECALL_QUARANTINE', // batch recalled: out of sellable stock everywhere
  'PRODUCT_MERGED' // duplicate catalogue product folded into another
];

// Why a store turned an order (or items in it) down. The reason decides what
// happens next: stock/capacity problems move the order to another store,
// prescription problems follow the order and cancel it.
const PHARMACY_REJECTION_REASONS = [
  'OUT_OF_STOCK', 'STORE_CLOSED', 'STORE_BUSY',
  'PRESCRIPTION_INVALID', 'PRESCRIPTION_MISSING', 'OTHER'
];
const PHARMACY_REASSIGNABLE_REJECTIONS = ['OUT_OF_STOCK', 'STORE_CLOSED', 'STORE_BUSY'];

// Outcome of offering an order to one store (order.assignmentAttempts[]).
const PHARMACY_ASSIGNMENT_OUTCOMES = ['PENDING', 'ACCEPTED', 'REJECTED', 'TIMED_OUT', 'CANCELLED'];

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
  // MedRush quick-commerce
  MEDICINE_FORMS,
  MEDICINE_SCHEDULE_TYPES,
  MEDICINE_CATEGORIES,
  PHARMACY_ORDER_STATUSES,
  PHARMACY_VENDOR_STATUSES,
  PHARMACY_FULFILMENT_TYPES,
  CARE_SUPPLY_SOURCES,
  DELIVERY_STATUSES,
  LAB_TEST_CATEGORIES,
  LAB_SAMPLE_TYPES,
  SAMPLE_STATUSES,
  CONSULTATION_TYPES,
  CONSULTATION_STATUSES,
  ZONE_STRESS_LEVELS,
  INVENTORY_MOVEMENT_TYPES,
  PHARMACY_REJECTION_REASONS,
  PHARMACY_REASSIGNABLE_REJECTIONS,
  PHARMACY_ASSIGNMENT_OUTCOMES,
  FIELD_LIMITS
};
