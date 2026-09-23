require('dotenv').config();

/**
 * Seed Pharmacy Marketplace
 *
 * Populates demo local-pharmacy vendors, a master medicine catalog, per-vendor
 * inventory, and a vendor login account so the MedRush pharmacy flow can be
 * exercised end-to-end. Idempotent-ish: clears the marketplace collections
 * (NOT users/patients) before re-seeding.
 *
 * Run: node scripts/seedPharmacyMarketplace.js
 */

const mongoose = require('mongoose');
const PharmacyVendor = require('../models/pharmacyVendor');
const Medicine = require('../models/medicine');
const VendorInventory = require('../models/vendorInventory');
const User = require('../models/user');
const Patient = require('../models/patient');

// LOCAL DEV ONLY demo customer for the web/mobile apps.
// Demo account password comes from env (never hardcoded, so it can't leak via git).
// LOCAL DEV ONLY: refuses to run in production.
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '';
if (process.env.NODE_ENV === 'production') {
  console.error('❌ Refusing to seed demo accounts in production');
  process.exit(1);
}
if (DEMO_PASSWORD.length < 8) {
  console.error('❌ Set SEED_DEMO_PASSWORD (min 8 chars) in your local .env');
  process.exit(1);
}
const DEMO_PATIENT = { name: 'Demo Patient', email: 'patient.demo@medrush.test', password: DEMO_PASSWORD, phone: '9876500099' };
// LOCAL DEV ONLY partner accounts, one per login portal.
const DEMO_PARTNERS = [
  { name: 'Demo Nurse', email: 'nurse.demo@medrush.test', password: DEMO_PASSWORD, phone: '9876500077', role: 'nurse' },
  { name: 'Demo Path Lab', email: 'lab.demo@medrush.test', password: DEMO_PASSWORD, phone: '9876500066', role: 'lab_partner' }
];

// Jaipur launch-area demo stores ([lng, lat]). Nabz launches in Jaipur first.
const VENDORS = [
  {
    name: 'Apollo Pharmacy - C-Scheme',
    slug: 'apollo-c-scheme-jaipur',
    contactPhone: '9876500011',
    address: { line1: 'Ashok Marg, C-Scheme', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
    location: { type: 'Point', coordinates: [75.8000, 26.9100] },
    serviceRadiusKm: 6,
    deliveryFee: 25,
    minOrderValue: 99,
    owner: { name: 'C-Scheme Store Manager', email: 'vendor.jaipur@medrush.test', password: DEMO_PASSWORD, phone: '9876500011' }
  },
  {
    name: 'MedPlus - Malviya Nagar',
    slug: 'medplus-malviya-nagar-jaipur',
    contactPhone: '9876500022',
    address: { line1: 'Gaurav Tower, Malviya Nagar', city: 'Jaipur', state: 'Rajasthan', pincode: '302017' },
    location: { type: 'Point', coordinates: [75.8243, 26.8549] },
    serviceRadiusKm: 5,
    deliveryFee: 20,
    minOrderValue: 149
  },
  {
    name: 'Wellness Forever - Vaishali Nagar',
    slug: 'wellness-vaishali-nagar-jaipur',
    contactPhone: '9876500033',
    address: { line1: 'Amrapali Marg, Vaishali Nagar', city: 'Jaipur', state: 'Rajasthan', pincode: '302021' },
    location: { type: 'Point', coordinates: [75.7430, 26.9130] },
    serviceRadiusKm: 7,
    deliveryFee: 0,
    minOrderValue: 199
  }
];

const MEDICINES = [
  { name: 'Dolo 650 Tablet', genericName: 'Paracetamol 650mg', brand: 'Dolo', manufacturer: 'Micro Labs', form: 'TABLET', strength: '650mg', packSize: '15 tablets', scheduleType: 'OTC', category: 'PAIN_RELIEF', referenceMrp: 32 },
  { name: 'Crocin Advance 500 Tablet', genericName: 'Paracetamol 500mg', brand: 'Crocin', manufacturer: 'GSK', form: 'TABLET', strength: '500mg', packSize: '15 tablets', scheduleType: 'OTC', category: 'PAIN_RELIEF', referenceMrp: 28 },
  { name: 'Azithral 500 Tablet', genericName: 'Azithromycin 500mg', brand: 'Azithral', manufacturer: 'Alembic', form: 'TABLET', strength: '500mg', packSize: '5 tablets', scheduleType: 'PRESCRIPTION', category: 'ANTIBIOTIC', referenceMrp: 118 },
  { name: 'Pan 40 Tablet', genericName: 'Pantoprazole 40mg', brand: 'Pan', manufacturer: 'Alkem', form: 'TABLET', strength: '40mg', packSize: '15 tablets', scheduleType: 'PRESCRIPTION', category: 'GASTRO', referenceMrp: 145 },
  { name: 'Cetrizine 10 Tablet', genericName: 'Cetirizine 10mg', brand: 'Cetrizine', manufacturer: 'Cipla', form: 'TABLET', strength: '10mg', packSize: '10 tablets', scheduleType: 'OTC', category: 'COLD_FLU', referenceMrp: 22 },
  { name: 'Metformin 500 Tablet', genericName: 'Metformin 500mg', brand: 'Glycomet', manufacturer: 'USV', form: 'TABLET', strength: '500mg', packSize: '20 tablets', scheduleType: 'PRESCRIPTION', category: 'DIABETES', referenceMrp: 26 },
  { name: 'ORS Powder Sachet', genericName: 'Oral Rehydration Salts', brand: 'Electral', manufacturer: 'FDC', form: 'SACHET', packSize: '21.8g', scheduleType: 'OTC', category: 'GASTRO', referenceMrp: 22 },
  { name: 'Betadine Antiseptic Solution', genericName: 'Povidone Iodine 5%', brand: 'Betadine', manufacturer: 'Win-Medicare', form: 'SOLUTION', packSize: '100ml', scheduleType: 'OTC', category: 'FIRST_AID', referenceMrp: 165 },
  { name: 'Vitamin C 500 Tablet', genericName: 'Ascorbic Acid 500mg', brand: 'Limcee', manufacturer: 'Abbott', form: 'TABLET', strength: '500mg', packSize: '15 tablets', scheduleType: 'OTC', category: 'VITAMINS_SUPPLEMENTS', referenceMrp: 25 },
  { name: 'Digital Thermometer', genericName: 'Clinical Digital Thermometer', brand: 'Dr Trust', manufacturer: 'Dr Trust', form: 'DEVICE', packSize: '1 unit', scheduleType: 'OTC', category: 'DEVICES', referenceMrp: 199 }
];

// Home-care supplies (linked from scripts/seedServiceCatalog.js by slug). Every
// store stocks these so "staff brings it" works in the demo.
const CARE_SUPPLIES = [
  { name: 'Dispovan Syringe 2ml', genericName: 'Disposable syringe with needle 2ml', brand: 'Dispovan', manufacturer: 'HMD', form: 'DEVICE', packSize: '1 unit', scheduleType: 'OTC', category: 'DEVICES', referenceMrp: 12 },
  { name: 'Alcohol Swabs', genericName: 'Isopropyl alcohol 70% swabs', brand: 'Romsons', manufacturer: 'Romsons', form: 'OTHER', packSize: '100 swabs', scheduleType: 'OTC', category: 'FIRST_AID', referenceMrp: 110 },
  { name: 'Surgical Gloves', genericName: 'Sterile latex surgical gloves', brand: 'Kanam', manufacturer: 'Kanam Latex', form: 'OTHER', packSize: '1 pair', scheduleType: 'OTC', category: 'FIRST_AID', referenceMrp: 30 },
  { name: 'Sterile Gauze Swabs', genericName: 'Sterile gauze 10x10cm', brand: 'Johnson', manufacturer: 'J&J', form: 'OTHER', packSize: '10 swabs', scheduleType: 'OTC', category: 'FIRST_AID', referenceMrp: 55 },
  { name: 'Crepe Bandage 10cm', genericName: 'Elastic crepe bandage', brand: 'Hansaplast', manufacturer: 'Beiersdorf', form: 'OTHER', packSize: '1 roll', scheduleType: 'OTC', category: 'FIRST_AID', referenceMrp: 135 },
  { name: 'Micropore Surgical Tape', genericName: 'Paper surgical tape 1 inch', brand: '3M Micropore', manufacturer: '3M', form: 'OTHER', packSize: '1 roll', scheduleType: 'OTC', category: 'FIRST_AID', referenceMrp: 70 },
  { name: 'IV Cannula 20G', genericName: 'Intravenous cannula 20G', brand: 'Venflon', manufacturer: 'BD', form: 'DEVICE', packSize: '1 unit', scheduleType: 'OTC', category: 'DEVICES', referenceMrp: 95 },
  { name: 'IV Infusion Set', genericName: 'Gravity IV administration set', brand: 'Romsons', manufacturer: 'Romsons', form: 'DEVICE', packSize: '1 set', scheduleType: 'OTC', category: 'DEVICES', referenceMrp: 85 },
  { name: 'Normal Saline 500ml', genericName: 'Sodium chloride 0.9% IV', brand: 'NS', manufacturer: 'Baxter', form: 'SOLUTION', packSize: '500ml bottle', scheduleType: 'PRESCRIPTION', category: 'OTHER', referenceMrp: 45 },
  { name: 'Foley Catheter Kit 16Fr', genericName: 'Foley catheter 16Fr with urine bag', brand: 'Romsons', manufacturer: 'Romsons', form: 'DEVICE', packSize: '1 kit', scheduleType: 'OTC', category: 'DEVICES', referenceMrp: 240 }
];

function priceFor(mrp, discountPct) {
  const price = Math.round(mrp * (1 - discountPct / 100));
  return Math.max(price, 1);
}

async function seed() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    await VendorInventory.deleteMany({});
    await PharmacyVendor.deleteMany({});
    await Medicine.deleteMany({});
    console.log('🗑️  Cleared vendors, medicines and inventory');

    // Medicines
    const toSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const medicineDocs = await Medicine.insertMany(MEDICINES.map((m) => ({ ...m, slug: toSlug(m.name) })));
    const supplyDocs = await Medicine.insertMany(CARE_SUPPLIES.map((m) => ({ ...m, slug: toSlug(m.name) })));
    console.log(`✅ Inserted ${medicineDocs.length} medicines + ${supplyDocs.length} home-care supplies`);

    // Vendors (+ optional owner login for the first vendor)
    let inventoryCount = 0;
    for (const [i, v] of VENDORS.entries()) {
      const vendor = await PharmacyVendor.create({
        ...v,
        owner: undefined,
        status: 'APPROVED',
        isOpen: true,
        verifiedAt: new Date()
      });

      if (v.owner) {
        const existing = await User.findOne({ email: v.owner.email.toLowerCase() });
        const owner = existing || await User.create({
          name: v.owner.name,
          email: v.owner.email,
          password: v.owner.password,
          phone: v.owner.phone,
          role: 'pharmacy_vendor',
          pharmacyVendor: vendor._id,
          isVerified: true
        });
        vendor.owner = owner._id;
        await vendor.save();
        if (!existing) console.log(`   👤 Vendor login: ${v.owner.email} / ${v.owner.password}`);
      }

      // Each vendor stocks a rotating subset of the catalog with varied prices/stock.
      for (const [j, med] of medicineDocs.entries()) {
        if ((i + j) % 4 === 3) continue; // leave some gaps so vendors differ
        const discountPct = 5 + ((i + j) % 4) * 5; // 5–20%
        await VendorInventory.create({
          vendor: vendor._id,
          medicine: med._id,
          mrp: med.referenceMrp,
          sellingPrice: priceFor(med.referenceMrp, discountPct),
          stockQty: 20 + ((i + j) % 5) * 15
        });
        inventoryCount += 1;
      }
      for (const supply of supplyDocs) {
        await VendorInventory.create({
          vendor: vendor._id,
          medicine: supply._id,
          mrp: supply.referenceMrp,
          sellingPrice: priceFor(supply.referenceMrp, 5 + i * 5),
          stockQty: 50
        });
        inventoryCount += 1;
      }
      console.log(`✅ Vendor "${vendor.name}" seeded`);
    }
    console.log(`✅ Inserted ${inventoryCount} inventory rows across ${VENDORS.length} vendors`);

    for (const partner of DEMO_PARTNERS) {
      if (!(await User.findOne({ email: partner.email }))) {
        await User.create({ ...partner, isVerified: true });
        console.log(`   👤 ${partner.role} login: ${partner.email} / ${partner.password}`);
      }
    }

    const existingPatient = await Patient.findOne({ email: DEMO_PATIENT.email });
    if (!existingPatient) {
      await Patient.create(DEMO_PATIENT);
      console.log(`   👤 Patient login: ${DEMO_PATIENT.email} / ${DEMO_PATIENT.password}`);
    }

    console.log('\n📊 Marketplace seed complete.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding pharmacy marketplace:', error);
    process.exit(1);
  }
}

seed();
