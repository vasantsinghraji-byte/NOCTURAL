const mongoose = require('mongoose');

const enabled = process.env.RUN_LIVE_CONCURRENCY_TESTS === 'true';
const describeLive = enabled ? describe : describe.skip;

describeLive('live booking completion concurrency', () => {
  const Patient = require('../../models/patient');
  const NurseBooking = require('../../models/nurseBooking');
  const HealthMetric = require('../../models/healthMetric');
  const HealthRecord = require('../../models/healthRecord');
  const BookingCompletionOutbox = require('../../models/bookingCompletionOutbox');
  const bookingService = require('../../services/bookingService');

  let patient;
  let booking;
  let connected = false;
  const providerId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    connected = true;
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName) throw new Error('Live concurrency test requires a replica-set MongoDB');
    await Promise.all([
      HealthMetric.createIndexes(),
      HealthRecord.createIndexes(),
      BookingCompletionOutbox.createIndexes()
    ]);
  }, 30000);

  beforeEach(async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
    patient = await Patient.create({
      name: 'Concurrency Test Patient',
      email: `concurrency-${suffix}@example.test`,
      password: 'TestPassword123',
      phone: `9${suffix.slice(-9).padStart(9, '0')}`
    });
    booking = await NurseBooking.create({
      patient: patient._id,
      serviceProvider: providerId,
      serviceType: 'INJECTION',
      scheduledDate: new Date(),
      scheduledTime: '10:00',
      scheduledTimezone: 'Asia/Kolkata',
      scheduledTimezoneOffsetMinutes: 330,
      status: 'IN_PROGRESS',
      pricing: { payableAmount: 500 },
      actualService: { startTime: new Date(Date.now() - 60000) }
    });
  });

  afterEach(async () => {
    if (!connected) return;
    await Promise.all([
      Patient.deleteMany({ _id: patient?._id }),
      NurseBooking.deleteMany({ _id: booking?._id }),
      HealthMetric.deleteMany({ 'source.bookingId': booking?._id }),
      HealthRecord.deleteMany({ 'source.bookingId': booking?._id }),
      BookingCompletionOutbox.deleteMany({ booking: booking?._id })
    ]);
  });

  afterAll(async () => {
    await require('../../config/redis').disconnectRedis();
    if (connected) await mongoose.disconnect();
  });

  it('commits exactly one completion, one accounting update, and one derived metric', async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, () =>
      bookingService.completeService(String(booking._id), String(providerId), {
        vitalsChecked: { heartRate: 80 }
      })
    ));

    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const [updatedPatient, metricCount, outboxCount] = await Promise.all([
      Patient.findById(patient._id).lean(),
      HealthMetric.countDocuments({ 'source.bookingId': booking._id }),
      BookingCompletionOutbox.countDocuments({ booking: booking._id })
    ]);
    expect(updatedPatient.totalBookings).toBe(1);
    expect(updatedPatient.totalSpent).toBe(500);
    expect(metricCount).toBe(1);
    expect(outboxCount).toBe(1);
  }, 30000);
});
