/**
 * Seed Script: Diagnostics & Pathology Tests Catalog
 *
 * Populates realistic lab tests and health checkup packages
 */

require('dotenv').config();
const mongoose = require('mongoose');
const LabTest = require('../models/labTest');

const labTestsData = [
  {
    name: 'Complete Blood Count (CBC)',
    slug: 'complete-blood-count-cbc',
    testCode: 'CBC001',
    category: 'HEMATOLOGY',
    subCategory: 'Routine Blood Work',
    displayName: 'Complete Blood Count (CBC)',
    shortDescription: 'Measures red & white blood cells, platelets, and hemoglobin to assess overall health.',
    sampleType: 'BLOOD',
    sampleVolume: '3 mL',
    tubeType: 'EDTA (Purple Top)',
    pricing: { mrp: 450, sellingPrice: 299, discountPercentage: 33 },
    reportTurnaroundHours: 12,
    preparation: {
      fastingRequired: false,
      instructions: ['No special fasting required', 'Stay well hydrated']
    },
    isPopular: true,
    isFeatured: true,
    availability: { isActive: true, homeCollectionAvailable: true }
  },
  {
    name: 'Lipid Profile (Cholesterol)',
    slug: 'lipid-profile',
    testCode: 'LPD002',
    category: 'LIPID',
    subCategory: 'Cardiovascular Health',
    displayName: 'Lipid Profile Screen',
    shortDescription: 'Comprehensive test for Total Cholesterol, HDL, LDL, VLDL, and Triglycerides.',
    sampleType: 'BLOOD',
    sampleVolume: '5 mL',
    tubeType: 'Serum Separator (Yellow/Gold Top)',
    pricing: { mrp: 650, sellingPrice: 450, discountPercentage: 30 },
    reportTurnaroundHours: 24,
    preparation: {
      fastingRequired: true,
      fastingHours: 10,
      instructions: ['10-12 hours overnight fasting mandatory', 'Water permitted']
    },
    isPopular: true,
    isFeatured: true,
    availability: { isActive: true, homeCollectionAvailable: true }
  },
  {
    name: 'Thyroid Stimulating Hormone (TSH)',
    slug: 'thyroid-stimulating-hormone-tsh',
    testCode: 'THY003',
    category: 'THYROID',
    subCategory: 'Endocrine Panel',
    displayName: 'TSH Ultrasensitive',
    shortDescription: 'Checks thyroid gland function; helpful for diagnosing hyperthyroidism and hypothyroidism.',
    sampleType: 'BLOOD',
    sampleVolume: '3 mL',
    tubeType: 'Serum Separator (Yellow Top)',
    pricing: { mrp: 350, sellingPrice: 220, discountPercentage: 37 },
    reportTurnaroundHours: 12,
    preparation: {
      fastingRequired: false,
      instructions: ['Morning sample preferred before taking thyroid medications']
    },
    isPopular: true,
    availability: { isActive: true, homeCollectionAvailable: true }
  },
  {
    name: 'HbA1c (Glycated Hemoglobin)',
    slug: 'hba1c-glycated-hemoglobin',
    testCode: 'DIA004',
    category: 'DIABETES',
    subCategory: 'Diabetes Care',
    displayName: 'HbA1c (3-Month Average Glucose)',
    shortDescription: 'Measures your average blood sugar levels over the past 2 to 3 months.',
    sampleType: 'BLOOD',
    sampleVolume: '3 mL',
    tubeType: 'EDTA (Purple Top)',
    pricing: { mrp: 550, sellingPrice: 380, discountPercentage: 30 },
    reportTurnaroundHours: 12,
    preparation: {
      fastingRequired: false,
      instructions: ['Fasting is not strictly required']
    },
    isPopular: true,
    isFeatured: true,
    availability: { isActive: true, homeCollectionAvailable: true }
  },
  {
    name: 'Liver Function Test (LFT)',
    slug: 'liver-function-test-lft',
    testCode: 'LVR005',
    category: 'LIVER',
    subCategory: 'Hepatic Panel',
    displayName: 'Liver Function Profile',
    shortDescription: 'Evaluates liver enzymes (SGOT, SGPT, Bilirubin, Alkaline Phosphatase, Total Protein).',
    sampleType: 'BLOOD',
    sampleVolume: '5 mL',
    tubeType: 'Serum Separator (Gold Top)',
    pricing: { mrp: 800, sellingPrice: 550, discountPercentage: 31 },
    reportTurnaroundHours: 24,
    preparation: {
      fastingRequired: true,
      fastingHours: 8,
      instructions: ['8-10 hours fasting recommended', 'Avoid alcohol for 24 hours prior']
    },
    isPopular: true,
    availability: { isActive: true, homeCollectionAvailable: true }
  },
  {
    name: 'Kidney Function Test (KFT / RFT)',
    slug: 'kidney-function-test-kft',
    testCode: 'KDN006',
    category: 'KIDNEY',
    subCategory: 'Renal Panel',
    displayName: 'Kidney Function Profile',
    shortDescription: 'Measures blood urea nitrogen (BUN), serum creatinine, electrolytes, and uric acid.',
    sampleType: 'BLOOD',
    sampleVolume: '5 mL',
    tubeType: 'Serum Separator (Gold Top)',
    pricing: { mrp: 850, sellingPrice: 590, discountPercentage: 30 },
    reportTurnaroundHours: 24,
    preparation: {
      fastingRequired: false,
      instructions: ['Avoid strenuous exercise 24 hours prior']
    },
    isPopular: false,
    availability: { isActive: true, homeCollectionAvailable: true }
  },
  {
    name: 'Vitamin D (25-Hydroxy)',
    slug: 'vitamin-d-25-hydroxy',
    testCode: 'VIT007',
    category: 'VITAMIN',
    subCategory: 'Bone & Immunity',
    displayName: 'Vitamin D Total',
    shortDescription: 'Measures 25-hydroxyvitamin D to detect deficiency linked to bone weakness and fatigue.',
    sampleType: 'BLOOD',
    sampleVolume: '4 mL',
    tubeType: 'Serum Separator (Gold Top)',
    pricing: { mrp: 1400, sellingPrice: 899, discountPercentage: 35 },
    reportTurnaroundHours: 24,
    preparation: {
      fastingRequired: false,
      instructions: ['No specific preparation needed']
    },
    isPopular: true,
    isFeatured: true,
    availability: { isActive: true, homeCollectionAvailable: true }
  },
  {
    name: 'Vitamin B12',
    slug: 'vitamin-b12',
    testCode: 'VIT008',
    category: 'VITAMIN',
    subCategory: 'Neurological & Energy',
    displayName: 'Vitamin B12 Cyanocobalamin',
    shortDescription: 'Essential vitamin test for nerve health, red blood cell production, and energy metabolism.',
    sampleType: 'BLOOD',
    sampleVolume: '4 mL',
    tubeType: 'Serum Separator (Gold Top)',
    pricing: { mrp: 950, sellingPrice: 650, discountPercentage: 31 },
    reportTurnaroundHours: 24,
    preparation: {
      fastingRequired: true,
      fastingHours: 8,
      instructions: ['Overnight 8-hour fasting recommended']
    },
    isPopular: true,
    availability: { isActive: true, homeCollectionAvailable: true }
  },
  {
    name: 'Routine Urine Examination',
    slug: 'routine-urine-examination',
    testCode: 'URN009',
    category: 'URINE_ANALYSIS',
    subCategory: 'General Screening',
    displayName: 'Urine Routine & Microscopic',
    shortDescription: 'Screens for urinary tract infections (UTI), kidney disease, and diabetes indicators.',
    sampleType: 'URINE',
    sampleVolume: '20 mL',
    tubeType: 'Sterile Urine Container',
    pricing: { mrp: 250, sellingPrice: 150, discountPercentage: 40 },
    reportTurnaroundHours: 12,
    preparation: {
      fastingRequired: false,
      instructions: ['Mid-stream clean catch sample required']
    },
    isPopular: true,
    availability: { isActive: true, homeCollectionAvailable: true }
  },
  {
    name: 'Full Body Comprehensive Health Package',
    slug: 'full-body-comprehensive-package',
    testCode: 'PKG010',
    category: 'FULL_BODY_CHECKUP',
    isPackage: true,
    packageTestCount: 75,
    displayName: 'MedRush Full Body Checkup (75 Parameters)',
    shortDescription: 'Includes CBC, Lipid Profile, Liver & Kidney Function, Thyroid, HbA1c, and Vitamin D.',
    sampleType: 'BLOOD',
    sampleVolume: '15 mL',
    tubeType: 'Multi-tube Collection',
    pricing: { mrp: 3999, sellingPrice: 1499, discountPercentage: 62 },
    reportTurnaroundHours: 24,
    preparation: {
      fastingRequired: true,
      fastingHours: 10,
      instructions: ['10-12 hours overnight fasting mandatory', 'Do not drink tea, coffee, or milk']
    },
    isPopular: true,
    isFeatured: true,
    availability: { isActive: true, homeCollectionAvailable: true }
  }
];

async function seedLabTests() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nocturnal';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for lab catalog seed');

    for (const testData of labTestsData) {
      await LabTest.findOneAndUpdate(
        { slug: testData.slug },
        { $set: testData },
        { upsert: true, new: true }
      );
    }

    console.log(`Seeded ${labTestsData.length} lab tests & health packages successfully.`);
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error seeding lab tests:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedLabTests();
}

module.exports = { seedLabTests, labTestsData };
