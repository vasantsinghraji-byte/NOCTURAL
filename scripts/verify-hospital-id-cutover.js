/**
 * Read-only verification for the hospitalId tenant cutover.
 *
 * Usage:
 *   MONGODB_URI=... node scripts/verify-hospital-id-cutover.js --label=staging
 *
 * Exits non-zero when any cutover collection still has records without
 * hospitalId, or records whose hospitalId does not resolve to a Hospital.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Hospital = require('../models/hospital');
const User = require('../models/user');
const Duty = require('../models/duty');
const ShiftSeries = require('../models/shiftSeries');
const Earning = require('../models/earning');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...valueParts] = arg.replace(/^--/, '').split('=');
    return [key, valueParts.join('=') || true];
  })
);

const label = args.get('label') || process.env.NODE_ENV || 'unknown';
const outputJson = args.has('json');

const missingHospitalId = {
  $or: [
    { hospitalId: { $exists: false } },
    { hospitalId: null }
  ]
};

const CHECKS = [
  {
    label: 'Admin users',
    model: User,
    filter: { role: 'admin', ...missingHospitalId },
    scopedFilter: { role: 'admin' }
  },
  {
    label: 'Duties',
    model: Duty,
    filter: missingHospitalId,
    scopedFilter: {}
  },
  {
    label: 'Shift series',
    model: ShiftSeries,
    filter: missingHospitalId,
    scopedFilter: {}
  },
  {
    label: 'Earnings',
    model: Earning,
    filter: missingHospitalId,
    scopedFilter: {}
  }
];

async function countOrphanedHospitalIds(Model, scopedFilter) {
  const collection = Model.collection.name;
  const result = await Model.aggregate([
    {
      $match: {
        ...scopedFilter,
        hospitalId: { $exists: true, $ne: null }
      }
    },
    {
      $lookup: {
        from: Hospital.collection.name,
        localField: 'hospitalId',
        foreignField: '_id',
        as: 'hospital'
      }
    },
    {
      $match: {
        hospital: { $eq: [] }
      }
    },
    {
      $count: 'count'
    }
  ]);

  return {
    collection,
    count: result[0]?.count || 0
  };
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000
  });

  const checks = [];
  for (const check of CHECKS) {
    const [missingCount, orphanResult] = await Promise.all([
      check.model.countDocuments(check.filter),
      countOrphanedHospitalIds(check.model, check.scopedFilter)
    ]);

    checks.push({
      label: check.label,
      collection: orphanResult.collection,
      missingHospitalId: missingCount,
      orphanedHospitalId: orphanResult.count
    });
  }

  const failed = checks.some((check) => check.missingHospitalId > 0 || check.orphanedHospitalId > 0);
  const result = {
    environment: label,
    ok: !failed,
    checkedAt: new Date().toISOString(),
    checks
  };

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`HospitalId cutover verification: ${label}`);
    checks.forEach((check) => {
      console.log(
        `${check.label} (${check.collection}): missingHospitalId=${check.missingHospitalId}, orphanedHospitalId=${check.orphanedHospitalId}`
      );
    });
    console.log(failed ? 'FAIL: hospitalId cutover verification failed.' : 'PASS: all checked records have valid hospitalId references.');
  }

  await mongoose.disconnect();

  if (failed) {
    process.exit(1);
  }
}

run().catch(async (error) => {
  console.error('HospitalId cutover verification failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
