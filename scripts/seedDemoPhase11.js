/**
 * Phase 1.1 demo data top-up for STAGING (safe to re-run).
 *
 * - Demo stores get neutral names: demos must not imply partnerships with
 *   real pharmacy chains.
 * - Demo nurse / physio get a gender, so "prefer a female professional" can be shown.
 * - About 30 more everyday medicines, stocked (with gaps) at the demo stores, so the
 *   customer app and the store app show a realistic catalogue. Prices are approximate
 *   MRPs for demo use only.
 *
 * Usage: MONGODB_URI=... ALLOW_DEMO_SEED=true node scripts/seedDemoPhase11.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Medicine = require('../models/medicine');
const PharmacyVendor = require('../models/pharmacyVendor');
const VendorInventory = require('../models/vendorInventory');
const User = require('../models/user');

const STORE_NAMES = {
  'apollo-c-scheme-jaipur': 'Nabz Demo Pharmacy · C-Scheme',
  'medplus-malviya-nagar-jaipur': 'Nabz Demo Pharmacy · Malviya Nagar',
  'wellness-vaishali-nagar-jaipur': 'Nabz Demo Pharmacy · Vaishali Nagar'
};

const STAFF_GENDER = { 'nurse@nabz-staging.test': 'FEMALE', 'physio@nabz-staging.test': 'FEMALE' };

const m = (name, genericName, brand, manufacturer, form, strength, packSize, scheduleType, category, referenceMrp) =>
  ({ name, genericName, brand, manufacturer, form, strength, packSize, scheduleType, category, referenceMrp });

const MEDICINES = [
  m('Combiflam Tablet', 'Ibuprofen 400mg + Paracetamol 325mg', 'Combiflam', 'Sanofi', 'TABLET', '400mg/325mg', '20 tablets', 'OTC', 'PAIN_RELIEF', 45),
  m('Saridon Tablet', 'Propyphenazone + Paracetamol + Caffeine', 'Saridon', 'Bayer', 'TABLET', undefined, '10 tablets', 'OTC', 'PAIN_RELIEF', 42),
  m('Volini Gel', 'Diclofenac Diethylamine 1.16%', 'Volini', 'Sun Pharma', 'GEL', '1.16%', '30g', 'OTC', 'PAIN_RELIEF', 150),
  m('Moov Pain Relief Cream', 'Diclofenac + Menthol', 'Moov', 'Reckitt', 'CREAM', undefined, '50g', 'OTC', 'PAIN_RELIEF', 185),
  m('Augmentin 625 Duo Tablet', 'Amoxicillin 500mg + Clavulanic Acid 125mg', 'Augmentin', 'GSK', 'TABLET', '625mg', '10 tablets', 'PRESCRIPTION', 'ANTIBIOTIC', 223),
  m('Ciplox 500 Tablet', 'Ciprofloxacin 500mg', 'Ciplox', 'Cipla', 'TABLET', '500mg', '10 tablets', 'PRESCRIPTION', 'ANTIBIOTIC', 75),
  m('Digene Antacid Gel', 'Aluminium Hydroxide + Magnesium Hydroxide + Simethicone', 'Digene', 'Abbott', 'SUSPENSION', undefined, '200ml', 'OTC', 'ANTACID', 140),
  m('Eno Fruit Salt Lemon', 'Sodium Bicarbonate + Citric Acid', 'Eno', 'GSK', 'SACHET', undefined, '5g x 6', 'OTC', 'ANTACID', 60),
  m('Rantac 150 Tablet', 'Ranitidine 150mg', 'Rantac', 'JB Chemicals', 'TABLET', '150mg', '30 tablets', 'PRESCRIPTION', 'ANTACID', 50),
  m('Omez 20 Capsule', 'Omeprazole 20mg', 'Omez', 'Dr Reddy’s', 'CAPSULE', '20mg', '20 capsules', 'PRESCRIPTION', 'GASTRO', 70),
  m('Glycomet GP 1 Tablet', 'Metformin 500mg + Glimepiride 1mg', 'Glycomet GP', 'USV', 'TABLET', '1mg/500mg', '15 tablets', 'PRESCRIPTION', 'DIABETES', 98),
  m('Januvia 100 Tablet', 'Sitagliptin 100mg', 'Januvia', 'MSD', 'TABLET', '100mg', '7 tablets', 'PRESCRIPTION', 'DIABETES', 390),
  m('Telma 40 Tablet', 'Telmisartan 40mg', 'Telma', 'Glenmark', 'TABLET', '40mg', '15 tablets', 'PRESCRIPTION', 'CARDIAC', 110),
  m('Amlong 5 Tablet', 'Amlodipine 5mg', 'Amlong', 'Micro Labs', 'TABLET', '5mg', '15 tablets', 'PRESCRIPTION', 'CARDIAC', 40),
  m('Ecosprin 75 Tablet', 'Aspirin 75mg', 'Ecosprin', 'USV', 'TABLET', '75mg', '14 tablets', 'PRESCRIPTION', 'CARDIAC', 6),
  m('Atorva 10 Tablet', 'Atorvastatin 10mg', 'Atorva', 'Zydus', 'TABLET', '10mg', '15 tablets', 'PRESCRIPTION', 'CARDIAC', 105),
  m('Asthalin Inhaler', 'Salbutamol 100mcg', 'Asthalin', 'Cipla', 'INHALER', '100mcg', '200 doses', 'PRESCRIPTION', 'RESPIRATORY', 150),
  m('Benadryl Cough Syrup', 'Diphenhydramine + Ammonium Chloride', 'Benadryl', 'Johnson & Johnson', 'SYRUP', undefined, '100ml', 'OTC', 'COLD_FLU', 125),
  m('Vicks Action 500 Advanced Tablet', 'Paracetamol + Phenylephrine + Caffeine', 'Vicks Action 500', 'P&G', 'TABLET', undefined, '10 tablets', 'OTC', 'COLD_FLU', 50),
  m('Otrivin Nasal Spray', 'Xylometazoline 0.1%', 'Otrivin', 'GSK', 'SPRAY', '0.1%', '10ml', 'OTC', 'COLD_FLU', 110),
  m('Allegra 120 Tablet', 'Fexofenadine 120mg', 'Allegra', 'Sanofi', 'TABLET', '120mg', '10 tablets', 'OTC', 'COLD_FLU', 210),
  m('Candid Cream', 'Clotrimazole 1%', 'Candid', 'Glenmark', 'CREAM', '1%', '20g', 'OTC', 'DERMATOLOGY', 90),
  m('Soframycin Skin Cream', 'Framycetin Sulphate 1%', 'Soframycin', 'Sanofi', 'CREAM', '1%', '30g', 'OTC', 'FIRST_AID', 60),
  m('Band-Aid Washproof Strips', 'Adhesive bandage', 'Band-Aid', 'Johnson & Johnson', 'OTHER', undefined, '20 strips', 'OTC', 'FIRST_AID', 60),
  m('Shelcal 500 Tablet', 'Calcium 500mg + Vitamin D3 250 IU', 'Shelcal', 'Torrent', 'TABLET', '500mg', '15 tablets', 'OTC', 'VITAMINS_SUPPLEMENTS', 120),
  m('Becosules Capsule', 'Vitamin B Complex + Vitamin C', 'Becosules', 'Pfizer', 'CAPSULE', undefined, '20 capsules', 'OTC', 'VITAMINS_SUPPLEMENTS', 50),
  m('Neurobion Forte Tablet', 'Vitamin B1 + B6 + B12', 'Neurobion Forte', 'P&G', 'TABLET', undefined, '30 tablets', 'OTC', 'VITAMINS_SUPPLEMENTS', 40),
  m('Thyronorm 50 Tablet', 'Thyroxine 50mcg', 'Thyronorm', 'Abbott', 'TABLET', '50mcg', '100 tablets', 'PRESCRIPTION', 'OTHER', 180),
  m('Refresh Tears Eye Drops', 'Carboxymethylcellulose 0.5%', 'Refresh Tears', 'Allergan', 'DROPS', '0.5%', '10ml', 'OTC', 'OPHTHALMOLOGY', 150),
  m('Accu-Chek Active Test Strips', 'Blood glucose test strips', 'Accu-Chek', 'Roche', 'DEVICE', undefined, '50 strips', 'OTC', 'DEVICES', 1150),
  m('Omron BP Monitor HEM-7120', 'Automatic blood pressure monitor', 'Omron', 'Omron', 'DEVICE', undefined, '1 unit', 'OTC', 'DEVICES', 2400),
  m('Pulse Oximeter', 'Fingertip pulse oximeter', 'Dr Trust', 'Dr Trust', 'DEVICE', undefined, '1 unit', 'OTC', 'DEVICES', 1500)
];

const toSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const priceFor = (mrp, pct) => Math.max(1, Math.round(mrp * (1 - pct / 100)));

async function main() {
  if (process.env.DEPLOYMENT_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Demo seed only runs on staging with ALLOW_DEMO_SEED=true');
  }
  await mongoose.connect(process.env.MONGODB_URI);

  for (const [slug, name] of Object.entries(STORE_NAMES)) {
    const r = await PharmacyVendor.updateOne({ slug }, { $set: { name } });
    console.log(`store ${slug}: ${r.modifiedCount ? 'renamed' : 'unchanged'} → ${name}`);
  }
  for (const [email, gender] of Object.entries(STAFF_GENDER)) {
    await User.updateOne({ email }, { $set: { 'careProfile.gender': gender } });
  }

  const stores = await PharmacyVendor.find({ slug: { $in: Object.keys(STORE_NAMES) } }).select('_id').lean();
  let added = 0;
  let stocked = 0;
  for (const [j, med] of MEDICINES.entries()) {
    const slug = toSlug(med.name);
    let doc = await Medicine.findOne({ slug }).select('_id referenceMrp').lean();
    if (!doc) {
      [doc] = await Medicine.insertMany([{ ...med, slug }]);
      added += 1;
    }
    for (const [i, store] of stores.entries()) {
      if ((i + j) % 4 === 3) continue; // gaps, so stores differ and substitutes show up
      const res = await VendorInventory.updateOne(
        { vendor: store._id, medicine: doc._id },
        { $setOnInsert: { mrp: med.referenceMrp, sellingPrice: priceFor(med.referenceMrp, 5 + ((i + j) % 4) * 5), stockQty: 15 + ((i + j) % 5) * 10, stockUpdatedAt: new Date() } },
        { upsert: true }
      );
      if (res.upsertedCount) stocked += 1;
    }
  }
  console.log(`medicines added: ${added}; inventory rows added: ${stocked}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
