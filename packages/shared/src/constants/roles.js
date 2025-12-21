/**
 * User Role Constants
 *
 * Centralized role definitions to prevent typos and ensure consistency
 * across all microservices.
 */

const ROLES = {
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  PHYSIOTHERAPIST: 'physiotherapist',
  HOSPITAL: 'hospital',
  ADMIN: 'admin',
  PATIENT: 'patient'
};

const ALL_ROLES = Object.values(ROLES);

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
  [ROLES.PHYSIOTHERAPIST]: [
    'view_shifts',
    'apply_for_shifts',
    'view_own_applications',
    'view_own_earnings',
    'view_own_profile',
    'update_own_profile',
    'upload_documents',
    'view_notifications'
  ],
  [ROLES.HOSPITAL]: [
    'create_shifts',
    'edit_shifts',
    'delete_shifts',
    'view_all_applications',
    'accept_applications',
    'reject_applications',
    'view_hospital_analytics',
    'manage_hospital_settings',
    'view_notifications'
  ],
  [ROLES.PATIENT]: [
    'view_own_profile',
    'update_own_profile',
    'book_services',
    'view_own_bookings',
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

const hasPermission = (role, permission) => {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
};

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
