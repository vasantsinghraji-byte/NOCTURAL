/**
 * Login portals — each partner type signs in through its own app/page, and an
 * account can only open the portal for its role (a pharmacy login can't open
 * the medical-staff app, etc.). Patients use /patients/login (separate model).
 * Doctor consultation is out of scope for now, so there's no doctor portal.
 */
const LOGIN_PORTALS = Object.freeze({
  staff: Object.freeze(['nurse', 'physiotherapist', 'medical_staff']),
  pharmacy: Object.freeze(['pharmacy_vendor']),
  lab: Object.freeze(['lab_partner', 'phlebotomist']),
  rider: Object.freeze(['delivery_partner']),
  admin: Object.freeze(['admin', 'platform_admin'])
});

const PORTAL_LABELS = Object.freeze({
  staff: 'Medical staff',
  pharmacy: 'Pharmacy partner',
  lab: 'Path lab partner',
  rider: 'Delivery partner',
  admin: 'Admin'
});

const isRoleAllowedInPortal = (portal, role) =>
  Object.prototype.hasOwnProperty.call(LOGIN_PORTALS, portal) && LOGIN_PORTALS[portal].includes(role);

/** Which portal an account should use (for a helpful error message). */
const portalForRole = (role) =>
  Object.keys(LOGIN_PORTALS).find((portal) => LOGIN_PORTALS[portal].includes(role)) || null;

module.exports = { LOGIN_PORTALS, PORTAL_LABELS, isRoleAllowedInPortal, portalForRole };
