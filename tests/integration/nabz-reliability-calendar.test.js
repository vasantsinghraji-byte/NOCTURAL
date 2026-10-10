/**
 * Reliability score and one calendar per person (real MongoDB): urgent
 * dispatch skips a professional who is booked for a planned session, and
 * prefers the more reliable of two equally near professionals.
 */
const mongoose = require('mongoose');
const User = require('../../models/user');
const Patient = require('../../models/patient');
const NurseBooking = require('../../models/nurseBooking');
const SlotReservation = require('../../models/slotReservation');
const CareStore = require('../../models/careStore');

const RUN = Date.now();
const HOME = { lat: 26.9124, lng: 75.7873 };
const PASSWORD = 'Strong@12345';

describe('Reliability and person calendars (real MongoDB)', () => {
  let db = false;
  let patient;
  const nurses = [];
  const reliability = () => require('../../services/reliabilityService');

  const visit = (nurse, { daysAgo, lateMinutes = 0, status = 'COMPLETED', cancelledBy } = {}) => {
    const day = new Date(Date.now() - daysAgo * 86400000);
    const date = new Date(`${new Date(day.getTime() + 330 * 60000).toISOString().slice(0, 10)}T00:00:00.000Z`);
    const due = new Date(`${date.toISOString().slice(0, 10)}T10:00:00+05:30`);
    return {
      patient: patient._id, serviceProvider: nurse._id, serviceType: 'INJECTION',
      scheduledDate: date, scheduledTime: '10:00', scheduledTimezone: 'Asia/Kolkata', scheduledTimezoneOffsetMinutes: 330,
      serviceLocation: { type: 'HOME', address: { street: 'Ashok Marg', city: 'Jaipur', pincode: '302001', coordinates: HOME } },
      pricing: { basePrice: 299, platformFee: 44.85, gst: 61.9, totalAmount: 405.75, payableAmount: 405.75 },
      status,
      ...(status === 'COMPLETED' ? { statusTimestamps: { startedAt: new Date(due.getTime() + lateMinutes * 60000), completedAt: new Date(due.getTime() + (lateMinutes + 30) * 60000) } } : {}),
      ...(cancelledBy ? { cancellation: { cancelledBy, cancelledAt: due } } : {})
    };
  };

  beforeAll(async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000, autoIndex: false });
      db = true;
    } catch (error) {
      console.warn(`Skipping reliability tests: MongoDB unavailable (${error.message})`);
      return;
    }
    await Promise.all([User.createIndexes(), SlotReservation.createIndexes(), CareStore.createIndexes()]);
    patient = await Patient.create({ name: 'Ravi Kumar', email: `rel.${RUN}@nabz.test`, password: PASSWORD, phone: `9${String(RUN).slice(-9)}` });
    const verified = { careProfile: { verification: { idVerified: true, policeVerified: true, councilVerified: true } } };
    const online = (lat, lng) => ({ isOnline: true, currentLocation: { type: 'Point', coordinates: [lng, lat], updatedAt: new Date() } });
    for (const [i, name] of ['Asha', 'Bina', 'Chitra'].entries()) {
      nurses.push(await User.create({
        name: `Nurse ${name}`, email: `rel${i}.${RUN}@nabz.test`, password: PASSWORD, phone: `98765${String(RUN + i).slice(-5)}`,
        role: 'nurse', isVerified: true, ...verified, ...online(HOME.lat + 0.004 * (i + 1), HOME.lng)
      }));
    }
  }, 60000);

  afterAll(async () => {
    if (!db) return;
    const ids = nurses.map((n) => n._id);
    await Promise.all([
      NurseBooking.deleteMany({ patient: patient._id }),
      SlotReservation.deleteMany({ resource: { $in: ids.map((id) => `person:${id}`) } }),
      CareStore.deleteMany({ owner: { $in: ids } }),
      User.deleteMany({ _id: { $in: ids } }),
      Patient.deleteMany({ _id: patient._id })
    ]);
    await mongoose.disconnect();
  });

  it('scores on time, finishing visits and rating; new professionals have no score yet', () => {
    const { scoreFrom } = require('../../services/reliabilityService');
    expect(scoreFrom({ completed: 2, onTime: 2, scheduledCompleted: 2, providerCancelled: 0, rating: 5, reviews: 9, strikes: 0 }).score).toBeNull();
    expect(scoreFrom({ completed: 10, onTime: 10, scheduledCompleted: 10, providerCancelled: 0, rating: 5, reviews: 9, strikes: 0 }).score).toBe(100);
    // 3 of 4 on time, 4 of 5 finished, too few reviews (4.5★ assumed): 100 × (0.4×0.75 + 0.35×0.8 + 0.25×0.9) = 80.5 → 81
    expect(scoreFrom({ completed: 4, onTime: 3, scheduledCompleted: 4, providerCancelled: 1, rating: 0, reviews: 0, strikes: 0 }).score).toBe(81);
    expect(scoreFrom({ completed: 4, onTime: 3, scheduledCompleted: 4, providerCancelled: 1, rating: 0, reviews: 0, strikes: 2 }).score).toBe(65);
  });

  it('works the score out from the last 60 days of visits and saves it on the person and their shop', async () => {
    if (!db) return;
    const [asha] = nurses;
    await NurseBooking.create([
      visit(asha, { daysAgo: 2 }), visit(asha, { daysAgo: 3 }), visit(asha, { daysAgo: 4, lateMinutes: 40 }), visit(asha, { daysAgo: 5 }),
      visit(asha, { daysAgo: 6, status: 'CANCELLED', cancelledBy: 'NURSE' }),
      visit(asha, { daysAgo: 7, status: 'CANCELLED', cancelledBy: 'PATIENT' }), // the customer's choice doesn't count
      visit(asha, { daysAgo: 90 }) // too old
    ]);
    const r = await reliability().computeForUser(asha._id);
    expect(r).toMatchObject({ visits: 5, onTimeRate: 0.75, completionRate: 0.8, score: 81 });

    const store = await CareStore.create({
      kind: 'NURSING', format: 'SOLO', owner: asha._id, name: 'Asha Care', status: 'APPROVED',
      location: { type: 'Point', coordinates: [HOME.lng, HOME.lat] }, members: [{ user: asha._id }]
    });
    await reliability().recomputeAll();
    expect((await User.findById(asha._id).lean()).careProfile.reliability.score).toBe(81);
    expect((await CareStore.findById(store._id).lean()).reliability.score).toBe(81);
  });

  it('urgent dispatch skips someone whose own calendar is booked right now', async () => {
    if (!db) return;
    const [asha, bina] = nurses;
    const now = new Date(Date.now() + 330 * 60000);
    const date = now.toISOString().slice(0, 10);
    const time = `${String(now.getUTCHours()).padStart(2, '0')}:${String(Math.floor(now.getUTCMinutes() / 15) * 15).padStart(2, '0')}`;
    await SlotReservation.create({ key: `person:${asha._id}|${date}|${time}`, store: new mongoose.Types.ObjectId(), resource: `person:${asha._id}`, date, time, capacity: 1, count: 1, holders: ['plan-session'] });
    const held = await require('../../services/careSlotService').peopleHeldAround(new Date(), 60);
    expect(held).toContain(String(asha._id));
    expect(held).not.toContain(String(bina._id));

    const booking = await NurseBooking.create({ ...visit(bina, { daysAgo: 0, status: 'REQUESTED' }), serviceProvider: null, dispatch: { mode: 'ASAP', status: 'SEARCHING' } });
    const dispatch = require('../../services/dispatchService');
    const pick = await dispatch.findCandidate(booking.toObject());
    expect(pick).toBeTruthy();
    expect(String(pick._id)).not.toBe(String(asha._id)); // Asha is nearest but booked
  });

  it('between two about-equally near professionals, the more reliable one is offered first', () => {
    const { pickReliable } = require('../../services/dispatchService');
    const near = { _id: 'a', distanceMeters: 800, reliability: 70 };
    const alsoNear = { _id: 'b', distanceMeters: 1900, reliability: 96 };
    const far = { _id: 'c', distanceMeters: 6000, reliability: 100 };
    expect(pickReliable([near, alsoNear, far])._id).toBe('b');
    expect(pickReliable([near, far])._id).toBe('a'); // never sends someone much further away
    expect(pickReliable([])).toBeNull();
  });
});
