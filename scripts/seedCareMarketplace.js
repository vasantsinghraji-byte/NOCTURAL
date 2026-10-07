/**
 * Seed the care marketplace catalog: physio services, lab tests and checkup
 * packages, home care and nursing shifts, each with a Nabz price band.
 * Idempotent (upsert by slug); admins edit it afterwards in the admin panel.
 *
 *   MONGODB_URI=... node scripts/seedCareMarketplace.js
 *   MONGODB_URI=... node scripts/seedCareMarketplace.js --demo
 *     STAGING ONLY: gives existing verified staging partners demo shops in
 *     Jaipur so testers see real listings. Refused when NODE_ENV=production.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const ServiceCatalog = require('../models/serviceCatalog');

const PHYSIO = [
  ['physio-assessment', 'Physio assessment', 'First visit: history, tests and a treatment plan', 300, 1500, 45, 'PHYSIOTHERAPY_SESSION'],
  ['back-pain-therapy', 'Back pain therapy', 'Lower and upper back pain, slipped disc, posture', 300, 2500, 45, 'BACK_PAIN_THERAPY'],
  ['knee-pain-therapy', 'Knee pain therapy', 'Arthritis, ligament injuries, knee replacement rehab', 300, 2500, 45, 'KNEE_PAIN_THERAPY'],
  ['neck-shoulder-therapy', 'Neck and shoulder therapy', 'Frozen shoulder, cervical pain, stiffness', 300, 2500, 45, 'PHYSIOTHERAPY_SESSION'],
  ['sports-injury-rehab', 'Sports injury rehab', 'Sprains, strains, return to sport', 400, 3000, 60, 'SPORTS_INJURY_THERAPY'],
  ['post-surgery-rehab', 'Post-surgery rehab', 'After joint replacement, fractures or spine surgery', 400, 3000, 60, 'POST_SURGERY_REHAB'],
  ['stroke-neuro-rehab', 'Stroke and neuro rehab', 'Stroke, Parkinson’s, spinal cord injury', 500, 3500, 60, 'NEUROLOGICAL_REHAB'],
  ['geriatric-physio', 'Elderly physio', 'Balance, fall prevention, mobility for seniors', 300, 2500, 45, 'GERIATRIC_PHYSIO'],
  ['pediatric-physio', 'Child physio', 'Developmental delay, cerebral palsy, torticollis', 400, 3000, 45, 'PEDIATRIC_PHYSIO']
];

// slug, name, sample, fasting hours, home collection, report hours, floor, ceiling
const LAB_TESTS = [
  ['cbc', 'Complete Blood Count (CBC)', 'BLOOD', 0, true, 12, 150, 800],
  ['lipid-profile', 'Lipid Profile', 'BLOOD', 10, true, 24, 250, 1200],
  ['thyroid-tsh', 'Thyroid (TSH)', 'BLOOD', 0, true, 12, 150, 800],
  ['thyroid-profile', 'Thyroid Profile (T3, T4, TSH)', 'BLOOD', 0, true, 24, 300, 1500],
  ['hba1c', 'HbA1c (3-month sugar)', 'BLOOD', 0, true, 12, 250, 1000],
  ['fasting-sugar', 'Fasting Blood Sugar', 'BLOOD', 10, true, 6, 50, 300],
  ['lft', 'Liver Function Test (LFT)', 'BLOOD', 8, true, 24, 300, 1500],
  ['kft', 'Kidney Function Test (KFT)', 'BLOOD', 0, true, 24, 300, 1500],
  ['vitamin-d', 'Vitamin D (25-OH)', 'BLOOD', 0, true, 24, 500, 2500],
  ['vitamin-b12', 'Vitamin B12', 'BLOOD', 8, true, 24, 400, 1800],
  ['urine-routine', 'Urine Routine', 'URINE', 0, true, 12, 80, 500],
  ['glucose-tolerance', 'Glucose Tolerance Test (GTT)', 'BLOOD', 10, false, 24, 200, 1000]
];

const LAB_PACKAGES = [
  ['basic-health-check', 'Basic Health Check', ['cbc', 'lipid-profile', 'fasting-sugar', 'urine-routine'], 10, 600, 3000],
  ['full-body-checkup', 'Full Body Checkup', ['cbc', 'lipid-profile', 'thyroid-profile', 'hba1c', 'lft', 'kft', 'vitamin-d', 'vitamin-b12', 'urine-routine'], 10, 1200, 6000],
  ['diabetes-care', 'Diabetes Care Package', ['hba1c', 'fasting-sugar', 'kft', 'lipid-profile'], 10, 700, 3500]
];

// slug, name, description, minutes, floor, ceiling, booking type
const HOMECARE = [
  ['elderly-care-12h', 'Elderly care attendant, 12 hours', 'Daytime help with meals, medicines, walking and hygiene', 720, 600, 3000, 'ELDERLY_CARE'],
  ['night-attendant-12h', 'Night attendant, 12 hours', 'Overnight care: turning, toilet help, medicines on time', 720, 700, 3500, 'ELDERLY_CARE'],
  ['patient-care-live-in', 'Live-in patient care, 24 hours', 'A caregiver who stays at home round the clock', 1440, 900, 4500, 'ELDERLY_CARE'],
  ['post-hospital-care-8h', 'Post-hospital care, 8 hours', 'Recovery at home after discharge', 480, 600, 3000, 'POST_SURGERY_CARE'],
  ['baby-care-japa-12h', 'Baby and mother care (japa), 12 hours', 'Newborn care, massage, mother’s recovery', 720, 700, 3500, 'BABY_CARE'],
  ['dementia-care-12h', 'Dementia care, 12 hours', 'Trained care for memory loss and confusion', 720, 800, 4000, 'ELDERLY_CARE'],
  ['nursing-attendant-8h', 'Nursing attendant, 8 hours', 'Vitals, dressing, catheter and feeding-tube care', 480, 800, 4000, 'GENERAL_NURSING']
];

async function upsert(slug, doc) {
  return ServiceCatalog.findOneAndUpdate({ slug }, { $set: doc, $setOnInsert: { slug, name: slug.toUpperCase().replace(/-/g, '_') } }, { upsert: true, returnDocument: 'after' });
}

async function seedCatalog() {
  let n = 0;
  for (const [slug, name, desc, floor, ceiling, minutes, type] of PHYSIO) {
    await upsert(`mkt-${slug}`, {
      displayName: name, shortDescription: desc, category: 'PHYSIOTHERAPY', pricing: { basePrice: floor }, 'availability.isActive': true,
      marketplace: { kind: 'PHYSIO', priceFloor: floor, priceCeiling: ceiling, homeAllowed: true, clinicAllowed: true, defaultDurationMinutes: minutes, bookingServiceType: type }
    });
    n += 1;
  }
  const ids = {};
  for (const [slug, name, sample, fasting, home, hours, floor, ceiling] of LAB_TESTS) {
    const doc = await upsert(`mkt-lab-${slug}`, {
      displayName: name, category: 'LAB_TEST', pricing: { basePrice: floor }, 'availability.isActive': true,
      marketplace: { kind: 'LAB', priceFloor: floor, priceCeiling: ceiling, homeAllowed: home, clinicAllowed: true, defaultDurationMinutes: 15 },
      lab: { sampleType: sample, fastingHours: fasting, homeCollectable: home, defaultReportHours: hours }
    });
    ids[slug] = doc._id;
    n += 1;
  }
  for (const [slug, name, tests, fasting, floor, ceiling] of LAB_PACKAGES) {
    await upsert(`mkt-lab-${slug}`, {
      displayName: name, shortDescription: `${tests.length} tests in one sample visit`, category: 'LAB_PACKAGE', pricing: { basePrice: floor }, 'availability.isActive': true,
      marketplace: { kind: 'LAB', priceFloor: floor, priceCeiling: ceiling, homeAllowed: true, clinicAllowed: true, defaultDurationMinutes: 15 },
      lab: { sampleType: 'BLOOD', fastingHours: fasting, homeCollectable: true, defaultReportHours: 24, tests: tests.map((t) => ids[t]) }
    });
    n += 1;
  }
  for (const [slug, name, desc, minutes, floor, ceiling, type] of HOMECARE) {
    await upsert(`mkt-hc-${slug}`, {
      displayName: name, shortDescription: desc, category: 'HOME_CARE', pricing: { basePrice: floor }, 'availability.isActive': true,
      marketplace: { kind: 'HOMECARE', priceFloor: floor, priceCeiling: ceiling, homeAllowed: true, clinicAllowed: false, defaultDurationMinutes: minutes, bookingServiceType: type }
    });
    n += 1;
  }
  return n;
}

/** STAGING ONLY: demo shops for verified staging partners without a shop. */
async function seedDemo() {
  if (process.env.NODE_ENV === 'production' && process.env.NABZ_STAGING !== 'true') throw new Error('Refusing: --demo is for staging only');
  const User = require('../models/user');
  const CareStore = require('../models/careStore');
  const RateCardItem = require('../models/rateCardItem');
  const verified = { 'careProfile.verification.idVerified': true, 'careProfile.verification.policeVerified': true, 'careProfile.verification.councilVerified': true };
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const hours = (open, close) => days.map((day) => ({ day, open, close }));
  const base = { lat: 26.9124, lng: 75.7873 };
  const catalog = await ServiceCatalog.find({ 'marketplace.kind': { $exists: true }, 'availability.isActive': true }).lean();
  let made = 0;
  const plan = [
    ['physiotherapist', 'PHYSIO', 'SOLO', 6],
    ['medical_staff', 'HOMECARE', 'SOLO', 4],
    ['lab_partner', 'LAB', 'LAB', 3]
  ];
  for (const [role, kind, format, max] of plan) {
    const users = await User.find({ role, isActive: { $ne: false }, ...(kind === 'LAB' ? {} : verified) }).limit(max).lean();
    for (const [i, u] of users.entries()) {
      if (await CareStore.exists({ owner: u._id, kind })) continue;
      const point = { type: 'Point', coordinates: [base.lng + (i - 2) * 0.02, base.lat + ((i % 3) - 1) * 0.02] };
      const store = await CareStore.create({
        kind, format, owner: u._id, name: kind === 'LAB' ? `${u.name.split(' ')[0]} Diagnostics` : u.name,
        members: [{ user: u._id, role: kind === 'LAB' ? 'MANAGER' : 'PRACTITIONER' }],
        location: point, address: { line1: 'Demo area', city: 'Jaipur', pincode: '302001' }, languages: ['Hindi', 'English'],
        gender: u.careProfile && u.careProfile.gender, qualification: u.careProfile && u.careProfile.qualification, experienceYears: 3 + i,
        bio: 'Demo listing for Nabz staging testers.', status: 'APPROVED', rating: { avg: 4.3 + (i % 5) / 10, count: 8 + i * 3 },
        clinic: { enabled: kind !== 'HOMECARE', capacity: kind === 'LAB' ? 3 : 1, hours: hours('08:00', '20:00') },
        home: { enabled: true, radiusKm: 12, ratePerKm: 10 + (i % 6), bufferMinutes: 30, capacity: kind === 'LAB' ? 2 : 1, hours: kind === 'HOMECARE' ? hours('00:00', '23:59') : hours('07:00', '20:00'), freeCollectionAbove: kind === 'LAB' ? 999 : 0 }
      });
      for (const s of catalog.filter((c) => c.marketplace.kind === kind)) {
        const price = Math.round((s.marketplace.priceFloor + (s.marketplace.priceCeiling - s.marketplace.priceFloor) * (0.15 + 0.05 * i)) / 10) * 10;
        await RateCardItem.updateOne({ store: store._id, service: s._id }, {
          $set: {
            kind,
            clinic: { enabled: kind !== 'HOMECARE' && s.marketplace.clinicAllowed !== false, price },
            home: { enabled: s.marketplace.homeAllowed !== false, price: kind === 'PHYSIO' ? price + 100 : price },
            durationMinutes: s.marketplace.defaultDurationMinutes || 45,
            liveIn: (s.marketplace.defaultDurationMinutes || 0) === 1440,
            sessionDiscounts: kind === 'PHYSIO' ? [{ minSessions: 5, percent: 5 }, { minSessions: 10, percent: 10 }] : kind === 'HOMECARE' ? [{ minSessions: 7, percent: 5 }, { minSessions: 30, percent: 12 }] : [],
            lab: kind === 'LAB' ? { reportHours: (s.lab && s.lab.defaultReportHours) || 24, homeCollection: s.marketplace.homeAllowed !== false } : undefined,
            isActive: true
          },
          $setOnInsert: { version: 1 }
        }, { upsert: true });
      }
      made += 1;
    }
  }
  return made;
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGODB_URI');
  await mongoose.connect(uri);
  for (const M of [ServiceCatalog, require('../models/careStore'), require('../models/rateCardItem')]) await M.createIndexes();
  console.log(`Catalog services upserted: ${await seedCatalog()}`);
  if (process.argv.includes('--demo')) console.log(`Demo shops created: ${await seedDemo()}`);
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
