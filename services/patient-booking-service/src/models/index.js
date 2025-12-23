/**
 * Models Index
 * Central export for all patient-booking-service models
 */

const Patient = require('./patient');
const NurseBooking = require('./nurseBooking');
const ServiceCatalog = require('./serviceCatalog');

module.exports = {
  Patient,
  NurseBooking,
  ServiceCatalog
};
