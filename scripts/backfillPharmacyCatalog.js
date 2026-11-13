require('dotenv').config();

/**
 * Backfill pharmacy catalogue fields added by the store-network work:
 *   - Medicine.saltKey (substitute matching) for every medicine that has a
 *     composition or generic name.
 *
 * Stock freshness (VendorInventory.stockUpdatedAt) is deliberately NOT
 * backfilled: nobody has confirmed those counts, so they should show as
 * "likely available" until each store confirms or recounts.
 *
 * Dry run by default. Write with:  node scripts/backfillPharmacyCatalog.js --write
 */

const mongoose = require('mongoose');
const Medicine = require('../models/medicine');

const WRITE = process.argv.includes('--write');

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('Set MONGODB_URI');
    process.exit(1);
  }
  const options = process.env.MONGODB_DB_NAME ? { dbName: process.env.MONGODB_DB_NAME } : {};
  await mongoose.connect(process.env.MONGODB_URI, options);

  let scanned = 0;
  let changed = 0;
  const cursor = Medicine.find({}).select('name composition genericName strength form saltKey').lean().cursor();
  for await (const med of cursor) {
    scanned += 1;
    const key = Medicine.deriveSaltKey(med);
    if (!key || key === med.saltKey) continue;
    changed += 1;
    console.log(`${WRITE ? 'set' : 'would set'} ${med.name} → ${key}`);
    if (WRITE) await Medicine.updateOne({ _id: med._id }, { $set: { saltKey: key } });
  }
  console.log(`Scanned ${scanned}, ${WRITE ? 'updated' : 'would update'} ${changed}.${WRITE ? '' : ' Re-run with --write to apply.'}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
