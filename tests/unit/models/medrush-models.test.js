const mongoose = require('mongoose');
const LabTest = require('../../../models/labTest');
const LabTestBooking = require('../../../models/labTestBooking');
const Consultation = require('../../../models/consultation');
const EmergencyBooking = require('../../../models/emergencyBooking');
const enums = require('../../../constants/enums');

describe('MedRush MVP Models & Enums', () => {
  describe('Constants & Enums', () => {
    test('STAFF_ROLES includes medical_staff and phlebotomist', () => {
      expect(enums.STAFF_ROLES).toContain('medical_staff');
      expect(enums.STAFF_ROLES).toContain('phlebotomist');
      expect(enums.STAFF_ROLES).toContain('doctor');
      expect(enums.STAFF_ROLES).toContain('nurse');
    });

    test('LAB_TEST_CATEGORIES contains expected categories', () => {
      expect(enums.LAB_TEST_CATEGORIES).toContain('HEMATOLOGY');
      expect(enums.LAB_TEST_CATEGORIES).toContain('BIOCHEMISTRY');
      expect(enums.LAB_TEST_CATEGORIES).toContain('THYROID');
      expect(enums.LAB_TEST_CATEGORIES).toContain('DIABETES');
      expect(enums.LAB_TEST_CATEGORIES).toContain('FULL_BODY_CHECKUP');
    });

    test('SAMPLE_STATUSES contains entire pipeline', () => {
      expect(enums.SAMPLE_STATUSES).toEqual([
        'SCHEDULED', 'COLLECTED', 'IN_TRANSIT', 'AT_LAB',
        'PROCESSING', 'REPORT_READY', 'DELIVERED'
      ]);
    });

    test('CONSULTATION_TYPES and STATUSES are defined', () => {
      expect(enums.CONSULTATION_TYPES).toEqual(['CHAT', 'AUDIO', 'VIDEO']);
      expect(enums.CONSULTATION_STATUSES).toContain('REQUESTED');
      expect(enums.CONSULTATION_STATUSES).toContain('ACCEPTED');
      expect(enums.CONSULTATION_STATUSES).toContain('IN_PROGRESS');
      expect(enums.CONSULTATION_STATUSES).toContain('COMPLETED');
    });

    test('EMERGENCY_STATUSES are defined', () => {
      expect(enums.EMERGENCY_STATUSES).toContain('TRIGGERED');
      expect(enums.EMERGENCY_STATUSES).toContain('DISPATCHING');
      expect(enums.EMERGENCY_STATUSES).toContain('STAFF_ASSIGNED');
      expect(enums.EMERGENCY_STATUSES).toContain('ARRIVED');
      expect(enums.EMERGENCY_STATUSES).toContain('RESOLVED');
    });
  });

  describe('LabTest Model', () => {
    test('instantiates valid LabTest document', () => {
      const testDoc = new LabTest({
        name: 'Complete Blood Count',
        slug: 'complete-blood-count',
        category: 'HEMATOLOGY',
        sampleType: 'BLOOD',
        pricing: { mrp: 400, sellingPrice: 299 },
        reportTurnaroundHours: 12
      });

      expect(testDoc.name).toBe('Complete Blood Count');
      expect(testDoc.category).toBe('HEMATOLOGY');
      expect(testDoc.availability.isActive).toBe(true);
      expect(testDoc.pricing.currency).toBe('INR');
    });
  });

  describe('LabTestBooking Model', () => {
    test('auto-generates bookingNumber on save pre-hook', () => {
      const patientId = new mongoose.Types.ObjectId();
      const testId = new mongoose.Types.ObjectId();

      const booking = new LabTestBooking({
        patient: patientId,
        tests: [{ test: testId, name: 'CBC', price: 299 }],
        scheduledDate: new Date(),
        scheduledSlot: '08:00-10:00 AM',
        pricing: { subtotal: 299, totalAmount: 299 }
      });

      expect(booking.bookingNumber).toBeUndefined();
      // Invoke pre-save hook
      for (const hook of LabTestBooking.schema.s.hooks._pres.get('save')) {
        if (typeof hook.fn === 'function') hook.fn.call(booking);
      }
      expect(booking.bookingNumber).toMatch(/^LT-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(booking.sampleStatus).toBe('SCHEDULED');
    });
  });

  describe('Consultation Model', () => {
    test('auto-generates consultationNumber on save pre-hook', () => {
      const patientId = new mongoose.Types.ObjectId();

      const consultation = new Consultation({
        patient: patientId,
        type: 'CHAT',
        chiefComplaint: 'Fever and headache for 2 days'
      });

      expect(consultation.consultationNumber).toBeUndefined();
      // Invoke pre-save hook
      for (const hook of Consultation.schema.s.hooks._pres.get('save')) {
        if (typeof hook.fn === 'function') hook.fn.call(consultation);
      }
      expect(consultation.consultationNumber).toMatch(/^CON-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(consultation.status).toBe('REQUESTED');
    });
  });

  describe('EmergencyBooking Model', () => {
    test('auto-generates emergencyNumber on save pre-hook', () => {
      const patientId = new mongoose.Types.ObjectId();

      const emergency = new EmergencyBooking({
        patient: patientId,
        emergencyType: 'WOUND_BLEEDING',
        patientLocation: {
          type: 'Point',
          coordinates: [72.8777, 19.0760],
          address: 'Andheri East, Mumbai'
        }
      });

      expect(emergency.emergencyNumber).toBeUndefined();
      // Invoke pre-save hook
      for (const hook of EmergencyBooking.schema.s.hooks._pres.get('save')) {
        if (typeof hook.fn === 'function') hook.fn.call(emergency);
      }
      expect(emergency.emergencyNumber).toMatch(/^SOS-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(emergency.status).toBe('TRIGGERED');
    });
  });
});
