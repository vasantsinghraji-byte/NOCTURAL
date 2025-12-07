/**
 * Application Constants
 *
 * Centralized location for all magic numbers, strings, and configuration values
 * used throughout the application.
 */

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// User Roles
const USER_ROLES = {
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  ADMIN: 'admin'
};

// Duty Statuses
const DUTY_STATUS = {
  OPEN: 'OPEN',
  FILLED: 'FILLED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

// Application Statuses
const APPLICATION_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN'
};

// Payment Statuses
const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED'
};

// Cache TTL (in seconds)
const CACHE_TTL = {
  SHORT: 60,           // 1 minute - fast-changing data
  MEDIUM: 300,         // 5 minutes - moderate data
  LONG: 600,           // 10 minutes - slow-changing data
  VERY_LONG: 1800,     // 30 minutes - rarely changing data
  DUTY_LIST: 120,      // 2 minutes
  DUTY_DETAIL: 300,    // 5 minutes
  ANALYTICS: 600,      // 10 minutes
  USER_PROFILE: 300    // 5 minutes
};

// Pagination
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1
};

// Time Constants (in milliseconds)
const TIME = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  TWO_WEEKS: 14 * 24 * 60 * 60 * 1000
};

// Profile Completion Weights
const PROFILE_WEIGHTS = {
  BASIC_INFO: 25,        // Name, email, phone, photo
  PROFESSIONAL: 30,      // MCI, specialization, experience, skills
  DOCUMENTS: 30,         // Certificates, ID, degree
  BANK_DETAILS: 10,      // Account info
  PREFERENCES: 5         // Shift preferences
};

// Rating Thresholds
const RATING_THRESHOLD = {
  EXCELLENT: 4.5,
  GOOD: 4.0,
  AVERAGE: 3.5,
  POOR: 3.0,
  MIN: 0,
  MAX: 5
};

// Match Score Weights
const MATCH_SCORE_WEIGHTS = {
  SPECIALTY: 40,
  SKILLS: 30,
  EXPERIENCE: 20,
  RATING: 10
};

// Platform Fee
const PLATFORM_FEE = {
  PERCENTAGE: 5,         // 5% platform commission
  MIN_AMOUNT: 0
};

// Success Messages
const SUCCESS_MESSAGE = {
  DUTY_CREATED: 'Duty posted successfully',
  DUTY_UPDATED: 'Duty updated successfully',
  DUTY_DELETED: 'Duty deleted successfully',
  APPLICATION_SUBMITTED: 'Application submitted successfully',
  APPLICATION_UPDATED: 'Application status updated',
  USER_REGISTERED: 'User registered successfully',
  LOGIN_SUCCESS: 'Login successful',
  PROFILE_UPDATED: 'Profile updated successfully',
  PAYMENT_PROCESSED: 'Payment processed successfully'
};

// Error Messages
const ERROR_MESSAGE = {
  INVALID_CREDENTIALS: 'Invalid credentials',
  USER_EXISTS: 'User already exists',
  USER_NOT_FOUND: 'User not found',
  DUTY_NOT_FOUND: 'Duty not found',
  APPLICATION_NOT_FOUND: 'Application not found',
  UNAUTHORIZED: 'Not authorized',
  FORBIDDEN: 'Access forbidden',
  VALIDATION_ERROR: 'Validation error',
  SERVER_ERROR: 'Internal server error',
  EMAIL_REQUIRED: 'Please provide email and password',
  DUPLICATE_APPLICATION: 'You have already applied for this duty',
  DUTY_FILLED: 'This duty is already filled'
};

// Query Limits
const QUERY_LIMITS = {
  RECENT_APPLICATIONS: 10,
  TOP_DOCTORS: 5,
  RECENT_DUTIES: 20,
  FILL_RATE_TREND_MONTHS: 6
};

// Thresholds
const THRESHOLD = {
  HIGH_COMPETITION: 30,           // Applications count
  AVG_TIME_TO_FILL_HOURS: 48,     // Time in hours
  STAFFING_GAP_WARNING: 3,        // Unfilled shifts
  PREFERRED_DOCTORS_MIN: 5,        // Minimum preferred doctors
  BUDGET_ALERT: 80,               // Budget usage percentage
  PENDING_APPS_WARNING: 5         // Pending applications count
};

// Regular Expressions
const REGEX = {
  EMAIL: /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
  PHONE: /^[6-9]\d{9}$/,
  IFSC: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  PAN: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
};

module.exports = {
  HTTP_STATUS,
  USER_ROLES,
  DUTY_STATUS,
  APPLICATION_STATUS,
  PAYMENT_STATUS,
  CACHE_TTL,
  PAGINATION,
  TIME,
  PROFILE_WEIGHTS,
  RATING_THRESHOLD,
  MATCH_SCORE_WEIGHTS,
  PLATFORM_FEE,
  SUCCESS_MESSAGE,
  ERROR_MESSAGE,
  QUERY_LIMITS,
  THRESHOLD,
  REGEX
};
