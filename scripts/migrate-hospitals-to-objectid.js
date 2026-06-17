/**
 * Migration: backfill structured Hospital references (expand phase).
 *
 * Creates a Hospital document per distinct `hospital` string found across the
 * tenant-scoped collections, then sets `hospitalId` on every record whose
 * `hospital` string matches. The free-text `hospital` field is left untouched,
 * so route scoping keeps working throughout (zero-downtime expand phase).
 *
 * Idempotent: hospitals are upserted by name and records are only updated when
 * `hospitalId` is not already set.
 *
 * Usage:
 *   node scripts/migrate-hospitals-to-objectid.js            # apply changes
 *   node scripts/migrate-hospitals-to-objectid.js --dry-run  # report only
 *
 * After this has run in every environment, the route scoping can be cut over
 * from the `hospital` string to `hospitalId` (the contract phase).
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Hospital = require('../models/hospital');
const User = require('../models/user');
const Duty = require('../models/duty');
const ShiftSeries = require('../models/shiftSeries');
const Earning = require('../models/earning');

const DRY_RUN = process.argv.includes('--dry-run');

// Collections that carry a `hospital` string and gain a `hospitalId` reference.
const TENANT_MODELS = [
  ['User', User],
  ['Duty', Duty],
  ['ShiftSeries', ShiftSeries],
  ['Earning', Earning]
];

function collectNames(values, target) {
  values.filter((v) => typeof v === 'string' && v.trim() !== '').forEach((v) => target.add(v));
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}`);

  // 1. Gather distinct hospital names across all tenant-scoped collections.
  const names = new Set();
  for (const [, Model] of TENANT_MODELS) {
    collectNames(await Model.distinct('hospital'), names);
  }
  console.log(`Found ${names.size} distinct hospital name(s).`);

  // 2. Upsert a Hospital per name and remember its id.
  const idByName = new Map();
  for (const name of names) {
    let hospital = await Hospital.findOne({ name });
    if (!hospital && !DRY_RUN) {
      hospital = await Hospital.create({ name });
    }
    idByName.set(name, hospital ? hospital._id : null);
    console.log(`  "${name}" -> ${hospital ? hospital._id : '(would create)'}`);
  }

  // 3. Backfill hospitalId on records that don't have one yet.
  for (const [label, Model] of TENANT_MODELS) {
    let affected = 0;
    for (const [name, id] of idByName) {
      if (!id) continue; // dry run, hospital not created yet
      const filter = { hospital: name, hospitalId: { $exists: false } };
      if (DRY_RUN) {
        affected += await Model.countDocuments(filter);
      } else {
        const res = await Model.updateMany(filter, { $set: { hospitalId: id } });
        affected += res.modifiedCount || 0;
      }
    }
    console.log(`${label}: ${DRY_RUN ? 'would update' : 'updated'} ${affected} document(s).`);
  }

  await mongoose.disconnect();
  console.log(DRY_RUN ? 'Dry run complete (no changes written).' : 'Migration complete.');
}

run().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
