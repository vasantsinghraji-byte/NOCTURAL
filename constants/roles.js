/**
 * User Role Constants
 *
 * Centralized role definitions to prevent typos and ensure consistency
 * across the application.
 */

const ROLES = {
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  ADMIN: 'admin'
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
    'verify_documents',
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
