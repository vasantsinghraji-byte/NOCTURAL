/**
 * Unit Tests - NurseBooking Model
 */

const mongoose = require('mongoose');
const { NurseBooking, Patient } = require('../../../src/models');

describe('NurseBooking Model', () => {
  let testPatient;

  beforeEach(async () => {
    await NurseBooking.deleteMany({});
    await Patient.deleteMany({});

    // Create a test patient
    testPatient = await Patient.create({
      name: 'Test Patient',
      email: 'testpatient@example.com',
      phone: '9876543210',
      password: 'password123'
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Booking Creation', () => {
    it('should create a booking with valid data', async () => {
      const bookingData = {
        patient: testPatient._id,
        serviceType: 'INJECTION',
        scheduledDate: new Date('2025-01-15'),
        scheduledTime: '10:00 AM',
        serviceLocation: {
          type: 'HOME',
          address: {
            street: '123 Main St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001'
          }
        },
        pricing: {
          basePrice: 500
        }
      };

      const booking = await NurseBooking.create(bookingData);

      expect(booking).toBeDefined();
      expect(booking.patient.toString()).toBe(testPatient._id.toString());
      expect(booking.serviceType).toBe('INJECTION');
      expect(booking.status).toBe('REQUESTED');
    });

    it('should fail without required fields', async () => {
      const bookingData = {
        patient: testPatient._id
        // Missing serviceType, scheduledDate, scheduledTime
      };

      await expect(NurseBooking.create(bookingData)).rejects.toThrow();
    });

    it('should accept valid service types', async () => {
      const serviceTypes = [
        'INJECTION',
        'IV_DRIP',
        'PHYSIOTHERAPY_SESSION',
        'ELDERLY_CARE_PACKAGE'
      ];

      for (const serviceType of serviceTypes) {
        const booking = await NurseBooking.create({
          patient: testPatient._id,
          serviceType,
          scheduledDate: new Date('2025-01-15'),
          scheduledTime: '10:00 AM',
          serviceLocation: {
            type: 'HOME',
            address: { city: 'Mumbai' }
          },
          pricing: { basePrice: 500 }
        });

        expect(booking.serviceType).toBe(serviceType);
      }
    });
  });

  describe('Status Management', () => {
    it('should set default status to REQUESTED', async () => {
      const booking = await NurseBooking.create({
        patient: testPatient._id,
        serviceType: 'INJECTION',
        scheduledDate: new Date('2025-01-15'),
        scheduledTime: '10:00 AM',
        serviceLocation: {
          type: 'HOME',
          address: { city: 'Mumbai' }
        },
        pricing: { basePrice: 500 }
      });

      expect(booking.status).toBe('REQUESTED');
    });

    it('should update statusTimestamps when status changes', async () => {
      const booking = await NurseBooking.create({
        patient: testPatient._id,
        serviceType: 'INJECTION',
        scheduledDate: new Date('2025-01-15'),
        scheduledTime: '10:00 AM',
        serviceLocation: {
          type: 'HOME',
          address: { city: 'Mumbai' }
        },
        pricing: { basePrice: 500 }
      });

      // Change status to ASSIGNED
      booking.status = 'ASSIGNED';
      await booking.save();

      expect(booking.statusTimestamps.assignedAt).toBeDefined();
      expect(booking.statusTimestamps.assignedAt).toBeInstanceOf(Date);
    });

    it('should track multiple status changes', async () => {
      const booking = await NurseBooking.create({
        patient: testPatient._id,
        serviceType: 'INJECTION',
        scheduledDate: new Date('2025-01-15'),
        scheduledTime: '10:00 AM',
        serviceLocation: {
          type: 'HOME',
          address: { city: 'Mumbai' }
        },
        pricing: { basePrice: 500 }
      });

      // Simulate booking lifecycle
      booking.status = 'ASSIGNED';
      await booking.save();

      booking.status = 'CONFIRMED';
      await booking.save();

      booking.status = 'COMPLETED';
      await booking.save();

      expect(booking.statusTimestamps.assignedAt).toBeDefined();
      expect(booking.statusTimestamps.confirmedAt).toBeDefined();
      expect(booking.statusTimestamps.completedAt).toBeDefined();
    });
  });

  describe('Pricing Calculation', () => {
    it('should calculate total amount correctly', async () => {
      const booking = new NurseBooking({
        patient: testPatient._id,
        serviceType: 'INJECTION',
        scheduledDate: new Date('2025-01-15'),
        scheduledTime: '10:00 AM',
        serviceLocation: {
          type: 'HOME',
          address: { city: 'Mumbai' }
        },
        pricing: {
          basePrice: 1000
        }
      });

      booking.calculateTotalAmount();

      expect(booking.pricing.platformFee).toBe(150); // 15% of 1000
      expect(booking.pricing.gst).toBe(207); // 18% of (1000 + 150)
      expect(booking.pricing.totalAmount).toBe(1357); // 1000 + 150 + 207
      expect(booking.pricing.payableAmount).toBe(1357);
    });

    it('should apply discount if provided', async () => {
      const booking = new NurseBooking({
        patient: testPatient._id,
        serviceType: 'INJECTION',
        scheduledDate: new Date('2025-01-15'),
        scheduledTime: '10:00 AM',
        serviceLocation: {
          type: 'HOME',
          address: { city: 'Mumbai' }
        },
        pricing: {
          basePrice: 1000,
          discount: 100
        }
      });

      booking.calculateTotalAmount();

      expect(booking.pricing.payableAmount).toBe(1257); // 1357 - 100
    });
  });

  describe('Payment Tracking', () => {
    it('should track payment status', async () => {
      const booking = await NurseBooking.create({
        patient: testPatient._id,
        serviceType: 'INJECTION',
        scheduledDate: new Date('2025-01-15'),
        scheduledTime: '10:00 AM',
        serviceLocation: {
          type: 'HOME',
          address: { city: 'Mumbai' }
        },
        pricing: { basePrice: 500 },
        payment: {
          method: 'ONLINE',
          status: 'PAID',
          transactionId: 'TXN123456',
          paidAt: new Date()
        }
      });

      expect(booking.payment.status).toBe('PAID');
      expect(booking.payment.transactionId).toBe('TXN123456');
      expect(booking.payment.paidAt).toBeInstanceOf(Date);
    });
  });

  describe('Service Location', () => {
    it('should store service location details', async () => {
      const booking = await NurseBooking.create({
        patient: testPatient._id,
        serviceType: 'INJECTION',
        scheduledDate: new Date('2025-01-15'),
        scheduledTime: '10:00 AM',
        serviceLocation: {
          type: 'HOME',
          address: {
            street: '123 Main St',
            landmark: 'Near Park',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            coordinates: {
              lat: 19.0760,
              lng: 72.8777
            }
          },
          contactPerson: 'Test Patient',
          contactPhone: '9876543210',
          floorNumber: '3rd Floor'
        },
        pricing: { basePrice: 500 }
      });

      expect(booking.serviceLocation.type).toBe('HOME');
      expect(booking.serviceLocation.address.city).toBe('Mumbai');
      expect(booking.serviceLocation.address.coordinates.lat).toBe(19.0760);
      expect(booking.serviceLocation.contactPhone).toBe('9876543210');
    });
  });

  describe('Cancellation', () => {
    it('should store cancellation details', async () => {
      const booking = await NurseBooking.create({
        patient: testPatient._id,
        serviceType: 'INJECTION',
        scheduledDate: new Date('2025-01-15'),
        scheduledTime: '10:00 AM',
        serviceLocation: {
          type: 'HOME',
          address: { city: 'Mumbai' }
        },
        pricing: { basePrice: 500 }
      });

      booking.status = 'CANCELLED';
      booking.cancellation = {
        cancelledBy: 'PATIENT',
        reason: 'Changed plans',
        cancelledAt: new Date(),
        refundEligible: true,
        refundAmount: 500
      };

      await booking.save();

      expect(booking.status).toBe('CANCELLED');
      expect(booking.cancellation.cancelledBy).toBe('PATIENT');
      expect(booking.cancellation.refundEligible).toBe(true);
    });
  });

  describe('Ratings and Reviews', () => {
    it('should store rating and review', async () => {
      const booking = await NurseBooking.create({
        patient: testPatient._id,
        serviceType: 'INJECTION',
        scheduledDate: new Date('2025-01-15'),
        scheduledTime: '10:00 AM',
        serviceLocation: {
          type: 'HOME',
          address: { city: 'Mumbai' }
        },
        pricing: { basePrice: 500 },
        status: 'COMPLETED'
      });

      booking.rating = {
        stars: 5,
        review: 'Excellent service!',
        punctuality: 5,
        professionalism: 5,
        skillLevel: 5,
        communication: 5,
        ratedAt: new Date()
      };

      await booking.save();

      expect(booking.rating.stars).toBe(5);
      expect(booking.rating.review).toBe('Excellent service!');
    });
  });
});
