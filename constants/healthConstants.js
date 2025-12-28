/**
 * Health Constants
 *
 * Constants for the Patient Analytics & Health History Dashboard
 * Includes metric types, normal ranges, status enums, and configurations
 */

// Metric types for vital readings
const METRIC_TYPES = {
  BP_SYSTOLIC: 'BP_SYSTOLIC',
  BP_DIASTOLIC: 'BP_DIASTOLIC',
  HEART_RATE: 'HEART_RATE',
  TEMPERATURE: 'TEMPERATURE',
  OXYGEN_LEVEL: 'OXYGEN_LEVEL',
  BLOOD_SUGAR: 'BLOOD_SUGAR',
  BLOOD_SUGAR_FASTING: 'BLOOD_SUGAR_FASTING',
  BLOOD_SUGAR_PP: 'BLOOD_SUGAR_PP',
  BLOOD_SUGAR_RBS: 'BLOOD_SUGAR_RBS',  // Random Blood Sugar
  HBA1C: 'HBA1C',                       // Glycated Hemoglobin
  WEIGHT: 'WEIGHT',
  HEIGHT: 'HEIGHT',
  BMI: 'BMI',
  RESPIRATORY_RATE: 'RESPIRATORY_RATE'
};

// Units for each metric type
const METRIC_UNITS = {
  [METRIC_TYPES.BP_SYSTOLIC]: 'mmHg',
  [METRIC_TYPES.BP_DIASTOLIC]: 'mmHg',
  [METRIC_TYPES.HEART_RATE]: 'bpm',
  [METRIC_TYPES.TEMPERATURE]: 'celsius',
  [METRIC_TYPES.OXYGEN_LEVEL]: '%',
  [METRIC_TYPES.BLOOD_SUGAR]: 'mg/dL',
  [METRIC_TYPES.BLOOD_SUGAR_FASTING]: 'mg/dL',
  [METRIC_TYPES.BLOOD_SUGAR_PP]: 'mg/dL',
  [METRIC_TYPES.BLOOD_SUGAR_RBS]: 'mg/dL',
  [METRIC_TYPES.HBA1C]: '%',
  [METRIC_TYPES.WEIGHT]: 'kg',
  [METRIC_TYPES.HEIGHT]: 'cm',
  [METRIC_TYPES.BMI]: 'kg/m2',
  [METRIC_TYPES.RESPIRATORY_RATE]: 'breaths/min'
};

// Normal ranges for vital signs (adult defaults)
// Age and gender-specific adjustments can be applied programmatically
const NORMAL_RANGES = {
  [METRIC_TYPES.BP_SYSTOLIC]: { min: 90, max: 120 },
  [METRIC_TYPES.BP_DIASTOLIC]: { min: 60, max: 80 },
  [METRIC_TYPES.HEART_RATE]: { min: 60, max: 100 },
  [METRIC_TYPES.TEMPERATURE]: { min: 36.1, max: 37.2 },
  [METRIC_TYPES.OXYGEN_LEVEL]: { min: 95, max: 100 },
  [METRIC_TYPES.BLOOD_SUGAR]: { min: 70, max: 140 },
  [METRIC_TYPES.BLOOD_SUGAR_FASTING]: { min: 70, max: 100 },
  [METRIC_TYPES.BLOOD_SUGAR_PP]: { min: 70, max: 140 },
  [METRIC_TYPES.BLOOD_SUGAR_RBS]: { min: 70, max: 140 },
  [METRIC_TYPES.HBA1C]: { min: 4.0, max: 5.6 },  // Normal: <5.7%, Prediabetes: 5.7-6.4%, Diabetes: >=6.5%
  [METRIC_TYPES.WEIGHT]: { min: 30, max: 200 }, // General range
  [METRIC_TYPES.HEIGHT]: { min: 100, max: 220 }, // General range
  [METRIC_TYPES.BMI]: { min: 18.5, max: 24.9 },
  [METRIC_TYPES.RESPIRATORY_RATE]: { min: 12, max: 20 }
};

// Abnormality thresholds (multipliers)
const ABNORMALITY_THRESHOLDS = {
  LOW: 0.9,      // 90% of min
  HIGH: 1.1,     // 110% of max
  CRITICAL: 1.25 // 125% beyond normal
};

// Abnormality levels
const ABNORMALITY_LEVELS = {
  NORMAL: 'NORMAL',
  LOW: 'LOW',
  HIGH: 'HIGH',
  CRITICAL_LOW: 'CRITICAL_LOW',
  CRITICAL_HIGH: 'CRITICAL_HIGH'
};

// Health record types
const RECORD_TYPES = {
  BASELINE: 'BASELINE',           // Initial intake form
  UPDATE: 'UPDATE',               // Patient self-update
  BOOKING_CAPTURE: 'BOOKING_CAPTURE', // Captured during booking
  DOCTOR_REVIEW: 'DOCTOR_REVIEW'  // Doctor-added information
};

// Health record status (for intake workflow)
const RECORD_STATUS = {
  DRAFT: 'DRAFT',                 // Patient saving draft
  PENDING_PATIENT: 'PENDING_PATIENT', // Waiting for patient to complete
  PENDING_REVIEW: 'PENDING_REVIEW',   // Waiting for doctor review
  APPROVED: 'APPROVED',           // Doctor approved
  REJECTED: 'REJECTED',           // Doctor rejected (needs changes)
  CHANGES_REQUESTED: 'CHANGES_REQUESTED' // Doctor requested changes
};

// Intake status for patient model
const INTAKE_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  PENDING_PATIENT: 'PENDING_PATIENT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED'
};

// Doctor note types
const NOTE_TYPES = {
  CONSULTATION: 'CONSULTATION',
  OBSERVATION: 'OBSERVATION',
  RECOMMENDATION: 'RECOMMENDATION',
  PRESCRIPTION: 'PRESCRIPTION',
  FOLLOW_UP: 'FOLLOW_UP',
  INTAKE_REVIEW: 'INTAKE_REVIEW'
};

// Access levels for doctor access tokens
const ACCESS_LEVELS = {
  READ_ONLY: 'READ_ONLY',
  READ_WRITE: 'READ_WRITE'
};

// Allowed resources for access tokens
const ALLOWED_RESOURCES = {
  HEALTH_RECORD: 'HEALTH_RECORD',
  HEALTH_METRIC: 'HEALTH_METRIC',
  DOCTOR_NOTE: 'DOCTOR_NOTE',
  EMERGENCY_SUMMARY: 'EMERGENCY_SUMMARY',
  FULL_HISTORY: 'FULL_HISTORY'
};

// Access audit actions
const AUDIT_ACTIONS = {
  VIEW: 'VIEW',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  EXPORT: 'EXPORT',
  SHARE: 'SHARE'
};

// Access reasons for audit
const ACCESS_REASONS = {
  BOOKING_ASSIGNMENT: 'BOOKING_ASSIGNMENT',
  PATIENT_REQUEST: 'PATIENT_REQUEST',
  EMERGENCY: 'EMERGENCY',
  ADMIN_AUDIT: 'ADMIN_AUDIT',
  ANALYTICS: 'ANALYTICS',
  INTAKE_REVIEW: 'INTAKE_REVIEW',
  DIRECT_ACCESS: 'DIRECT_ACCESS'
};

// User types for audit logging
const USER_TYPES = {
  PATIENT: 'PATIENT',
  DOCTOR: 'DOCTOR',
  NURSE: 'NURSE',
  PHYSIOTHERAPIST: 'PHYSIOTHERAPIST',
  ADMIN: 'ADMIN',
  SYSTEM: 'SYSTEM'
};

// Measurement source types
const MEASUREMENT_SOURCES = {
  PATIENT: 'PATIENT',
  PROVIDER: 'PROVIDER',
  DEVICE: 'DEVICE'
};

// Data source types
const DATA_SOURCES = {
  BOOKING: 'BOOKING',
  MANUAL_ENTRY: 'MANUAL_ENTRY',
  DEVICE_SYNC: 'DEVICE_SYNC',
  PATIENT_SELF: 'PATIENT_SELF',
  DOCTOR_INPUT: 'DOCTOR_INPUT',
  SYSTEM: 'SYSTEM'
};

// Allergy severity levels
const ALLERGY_SEVERITY = {
  MILD: 'MILD',
  MODERATE: 'MODERATE',
  SEVERE: 'SEVERE',
  LIFE_THREATENING: 'LIFE_THREATENING'
};

// Condition severity levels
const CONDITION_SEVERITY = {
  MILD: 'MILD',
  MODERATE: 'MODERATE',
  SEVERE: 'SEVERE',
  CHRONIC: 'CHRONIC',
  CONTROLLED: 'CONTROLLED'
};

// Analytics periods
const ANALYTICS_PERIODS = {
  WEEK: '7d',
  MONTH: '30d',
  QUARTER: '90d',
  YEAR: '1y',
  CUSTOM: 'custom'
};

// QR token configuration
const QR_TOKEN_CONFIG = {
  DEFAULT_EXPIRY_HOURS: 24,
  MAX_EXPIRY_HOURS: 168, // 7 days
  MIN_EXPIRY_HOURS: 1
};

// Emergency summary fields to include
const EMERGENCY_FIELDS = [
  'bloodGroup',
  'criticalConditions',
  'criticalAllergies',
  'currentMedications',
  'emergencyContacts',
  'primaryPhysician',
  'insurance'
];

// Investigation report status
const INVESTIGATION_REPORT_STATUS = {
  UPLOADED: 'UPLOADED',
  AI_ANALYZING: 'AI_ANALYZING',
  AI_ANALYZED: 'AI_ANALYZED',
  AI_FAILED: 'AI_FAILED',
  PENDING_DOCTOR_REVIEW: 'PENDING_DOCTOR_REVIEW',
  DOCTOR_REVIEWING: 'DOCTOR_REVIEWING',
  REVIEWED: 'REVIEWED',
  REJECTED: 'REJECTED'
};

// Investigation report types
const INVESTIGATION_REPORT_TYPES = {
  BLOOD_TEST: 'BLOOD_TEST',
  URINE_TEST: 'URINE_TEST',
  IMAGING: 'IMAGING',           // X-ray, CT, MRI, Ultrasound
  ECG: 'ECG',
  BIOPSY: 'BIOPSY',
  PATHOLOGY: 'PATHOLOGY',
  LIPID_PROFILE: 'LIPID_PROFILE',
  THYROID_PANEL: 'THYROID_PANEL',
  LIVER_FUNCTION: 'LIVER_FUNCTION',
  KIDNEY_FUNCTION: 'KIDNEY_FUNCTION',
  DIABETES_PANEL: 'DIABETES_PANEL',
  VITAMIN_PANEL: 'VITAMIN_PANEL',
  ALLERGY_TEST: 'ALLERGY_TEST',
  OTHER: 'OTHER'
};

// Doctor assignment types for investigation reports
const REPORT_ASSIGNMENT_TYPE = {
  MANUAL: 'MANUAL',           // Admin assigns specific doctor
  AUTO_QUEUE: 'AUTO_QUEUE',   // Goes to specialist queue
  PATIENT_CHOICE: 'PATIENT_CHOICE' // Patient selects doctor
};

// Health tracker types
const TRACKER_TYPES = {
  DIABETES: 'DIABETES',
  HYPERTENSION: 'HYPERTENSION'
};

module.exports = {
  METRIC_TYPES,
  METRIC_UNITS,
  NORMAL_RANGES,
  ABNORMALITY_THRESHOLDS,
  ABNORMALITY_LEVELS,
  RECORD_TYPES,
  RECORD_STATUS,
  INTAKE_STATUS,
  NOTE_TYPES,
  ACCESS_LEVELS,
  ALLOWED_RESOURCES,
  AUDIT_ACTIONS,
  ACCESS_REASONS,
  USER_TYPES,
  MEASUREMENT_SOURCES,
  DATA_SOURCES,
  ALLERGY_SEVERITY,
  CONDITION_SEVERITY,
  ANALYTICS_PERIODS,
  QR_TOKEN_CONFIG,
  EMERGENCY_FIELDS,
  INVESTIGATION_REPORT_STATUS,
  INVESTIGATION_REPORT_TYPES,
  REPORT_ASSIGNMENT_TYPE,
  TRACKER_TYPES
};
