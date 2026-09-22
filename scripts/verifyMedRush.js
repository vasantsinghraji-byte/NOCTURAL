/**
 * Self-contained verification runner for MedRush MVP Phase 1
 */

const assert = require('assert');

console.log('Running MedRush Verification Suite...\n');

// 1. Enums
const enums = require('../constants/enums');
assert(enums.STAFF_ROLES.includes('medical_staff'), 'enums.STAFF_ROLES must include medical_staff');
assert(enums.STAFF_ROLES.includes('phlebotomist'), 'enums.STAFF_ROLES must include phlebotomist');
assert(enums.LAB_TEST_CATEGORIES.includes('HEMATOLOGY'), 'LAB_TEST_CATEGORIES must include HEMATOLOGY');
assert(enums.SAMPLE_STATUSES.includes('SCHEDULED'), 'SAMPLE_STATUSES must include SCHEDULED');
assert(enums.CONSULTATION_TYPES.includes('CHAT'), 'CONSULTATION_TYPES must include CHAT');
assert(enums.EMERGENCY_STATUSES.includes('TRIGGERED'), 'EMERGENCY_STATUSES must include TRIGGERED');
console.log('✅ Constants & Enums verified');

// 2. Models
const LabTest = require('../models/labTest');
const LabTestBooking = require('../models/labTestBooking');
const Consultation = require('../models/consultation');
const EmergencyBooking = require('../models/emergencyBooking');
const User = require('../models/user');
const Patient = require('../models/patient');

assert(LabTest.schema.paths.category, 'LabTest schema must have category path');
assert(LabTest.schema.paths['pricing.sellingPrice'], 'LabTest schema must have pricing.sellingPrice path');
assert(LabTestBooking.schema.paths.bookingNumber, 'LabTestBooking schema must have bookingNumber');
assert(LabTestBooking.schema.paths.sampleStatus, 'LabTestBooking schema must have sampleStatus');
assert(Consultation.schema.paths.consultationNumber, 'Consultation schema must have consultationNumber');
assert(EmergencyBooking.schema.paths.emergencyNumber, 'EmergencyBooking schema must have emergencyNumber');
assert(EmergencyBooking.schema.paths['patientLocation.coordinates'], 'EmergencyBooking schema must have patientLocation.coordinates');
assert(User.schema.paths['currentLocation.coordinates'], 'User schema must have currentLocation.coordinates path');
assert(User.schema.paths.isOnline, 'User schema must have isOnline path');
assert(Patient.schema.paths.emergencyContacts, 'Patient schema must have emergencyContacts path');
console.log('✅ Models verified');

// 3. Controllers
const labTestController = require('../controllers/labTestController');
const labTestBookingController = require('../controllers/labTestBookingController');
const consultationController = require('../controllers/consultationController');
const emergencyController = require('../controllers/emergencyController');
const staffLocationController = require('../controllers/staffLocationController');

assert(typeof labTestController.getTests === 'function', 'labTestController.getTests must be a function');
assert(typeof labTestBookingController.createBooking === 'function', 'labTestBookingController.createBooking must be a function');
assert(typeof consultationController.requestConsultation === 'function', 'consultationController.requestConsultation must be a function');
assert(typeof emergencyController.triggerEmergency === 'function', 'emergencyController.triggerEmergency must be a function');
assert(typeof staffLocationController.updateLocation === 'function', 'staffLocationController.updateLocation must be a function');
console.log('✅ Controllers verified');

// 4. Routes
const labTestsRouter = require('../routes/labTests');
const labTestBookingsRouter = require('../routes/labTestBookings');
const consultationsRouter = require('../routes/consultations');
const emergencyRouter = require('../routes/emergency');
const staffLocationRouter = require('../routes/staffLocation');
const v1Router = require('../routes/v1/index');

assert(labTestsRouter.stack.length > 0, 'labTestsRouter must have registered routes');
assert(labTestBookingsRouter.stack.length > 0, 'labTestBookingsRouter must have registered routes');
assert(consultationsRouter.stack.length > 0, 'consultationsRouter must have registered routes');
assert(emergencyRouter.stack.length > 0, 'emergencyRouter must have registered routes');
assert(staffLocationRouter.stack.length > 0, 'staffLocationRouter must have registered routes');
assert(v1Router.stack.length > 0, 'v1Router must have registered routes');
console.log('✅ Routes and Route Mounts verified');

// 5. Validators
const labTestValidator = require('../validators/labTestValidator');
const consultationValidator = require('../validators/consultationValidator');
const emergencyValidator = require('../validators/emergencyValidator');

assert(Array.isArray(labTestValidator.createLabTestValidation), 'createLabTestValidation must be array');
assert(Array.isArray(consultationValidator.requestConsultationValidation), 'requestConsultationValidation must be array');
assert(Array.isArray(emergencyValidator.triggerEmergencyValidation), 'triggerEmergencyValidation must be array');
console.log('✅ Validators verified');

console.log('\n🎉 ALL MEDRUSH PHASE 1 VERIFICATIONS PASSED SUCCESSFULLY!');
