/**
 * User Role Constants
 *
 * Centralized role definitions to prevent typos and ensure consistency
 * across the application.
 */

const ROLES = {
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  PHYSIOTHERAPIST: 'physiotherapist',
  ADMIN: 'admin', // hospital-scoped admin (tenant = their `hospital`)
  PLATFORM_ADMIN: 'platform_admin', // cross-tenant operator for platform-level actions
  PATIENT: 'patient',

  // ── MedRush quick-commerce roles ──────────────────────────────────────
  PHARMACY_VENDOR: 'pharmacy_vendor', // store staff, scoped to a PharmacyVendor org
  DELIVERY_PARTNER: 'delivery_partner', // rider fulfilling pharmacy orders
  MEDICAL_STAFF: 'medical_staff', // paramedic / general home-visit staff
  PHLEBOTOMIST: 'phlebotomist', // lab sample collection
  LAB_PARTNER: 'lab_partner' // path-lab staff, scoped to a partner lab
};

// Array of all valid roles for validation
const ALL_ROLES = Object.values(ROLES);

// Role permissions mapping
const ROLE_PERMISSIONS = {
  [ROLES.DOCTOR]: [
    'view_shifts',
    'apply_for_shifts',
    'view_own_applications',
    'view_own_earnings',
    'view_own_profile',
    'update_own_profile',
    'upload_documents',
    'view_notifications'
  ],
  [ROLES.NURSE]: [
    'view_shifts',
    'apply_for_shifts',
    'view_own_applications',
    'view_own_earnings',
    'view_own_profile',
    'update_own_profile',
    'upload_documents',
    'view_notifications'
  ],
  [ROLES.ADMIN]: [
    'create_shifts',
    'edit_shifts',
    'delete_shifts',
    'view_all_applications',
    'accept_applications',
    'reject_applications',
    'view_all_payments',
    'process_payments',
    'view_hospital_analytics',
    'manage_hospital_settings',
    'view_notifications'
  ],
  [ROLES.PLATFORM_ADMIN]: [
    // Cross-tenant, platform-level capabilities (not bound to a single hospital)
    'verify_documents',
    'view_notifications',
    // MedRush platform operations
    'manage_vendors',
    'verify_vendors',
    'manage_medicine_catalog',
    'verify_staff'
  ],

  // ── MedRush quick-commerce role permissions ────────────────────────────
  [ROLES.PHARMACY_VENDOR]: [
    'manage_own_inventory',
    'view_own_orders',
    'update_order_status',
    'manage_own_storefront',
    'view_own_earnings',
    'view_own_profile',
    'update_own_profile',
    'view_notifications'
  ],
  [ROLES.DELIVERY_PARTNER]: [
    'view_delivery_tasks',
    'update_delivery_status',
    'update_own_location',
    'view_own_earnings',
    'view_own_profile',
    'update_own_profile',
    'view_notifications'
  ],
  [ROLES.MEDICAL_STAFF]: [
    'view_bookings',
    'accept_bookings',
    'update_own_location',
    'update_availability',
    'view_own_earnings',
    'view_own_profile',
    'update_own_profile',
    'upload_documents',
    'view_notifications'
  ],
  [ROLES.LAB_PARTNER]: [
    'view_lab_orders',
    'update_sample_status',
    'upload_reports',
    'view_own_earnings',
    'view_own_profile',
    'update_own_profile',
    'view_notifications'
  ],
  [ROLES.PHLEBOTOMIST]: [
    'view_sample_collections',
    'accept_bookings',
    'update_sample_status',
    'update_own_location',
    'update_availability',
    'view_own_earnings',
    'view_own_profile',
    'update_own_profile',
    'upload_documents',
    'view_notifications'
  ]
};

/**
 * Check if a user has a specific permission
 * @param {string} role - User's role
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
const hasPermission = (role, permission) => {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
};

/**
 * Validate if a string is a valid role
 * @param {string} role - Role to validate
 * @returns {boolean}
 */
const isValidRole = (role) => {
  return ALL_ROLES.includes(role);
};

module.exports = {
  ROLES,
  ALL_ROLES,
  ROLE_PERMISSIONS,
  hasPermission,
  isValidRole
};
