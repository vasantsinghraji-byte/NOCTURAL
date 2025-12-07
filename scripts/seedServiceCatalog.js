/**
 * Seed Service Catalog
 *
 * Populates the database with initial nursing and physiotherapy services
 */

const mongoose = require('mongoose');
const ServiceCatalog = require('../models/serviceCatalog');
require('dotenv').config();

const services = [
  // NURSING SERVICES
  {
    name: 'INJECTION_IM',
    slug: 'injection-intramuscular',
    category: 'NURSING',
    subCategory: 'Injection Services',
    displayName: 'Intramuscular (IM) Injection',
    shortDescription: 'Professional IM injection administration at home',
    longDescription: 'Get safe and painless intramuscular injections administered by trained nurses at the comfort of your home. Ideal for antibiotic injections, vitamin B12, pain relief medications, and more.',
    pricing: {
      basePrice: 299,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 20,
      equipmentRequired: ['Syringe', 'Needle', 'Cotton swabs', 'Antiseptic'],
      suppliesNeeded: ['Medicine (patient provides)', 'Prescription'],
      skillLevel: 'BASIC'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune'],
      availableHours: { start: '06:00', end: '22:00' },
      availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    },
    requirements: {
      prescriptionRequired: true,
      advanceBookingHours: 2
    },
    included: ['Nurse visit charge', 'Injection administration', 'Disposal of medical waste', 'Basic vitals check'],
    notIncluded: ['Medicine cost', 'Syringes/needles (if not provided)', 'Parking charges'],
    patientInstructions: {
      beforeService: ['Keep prescription ready', 'Ensure medicine is available', 'Inform about allergies'],
      duringService: ['Relax during injection', 'Inform if you feel unwell'],
      afterService: ['Rest for 10 minutes', 'Apply ice if swelling occurs', 'Monitor for side effects']
    },
    isFeatured: true,
    isPopular: true,
    sortOrder: 1
  },

  {
    name: 'IV_DRIP',
    slug: 'iv-drip-infusion',
    category: 'NURSING',
    subCategory: 'IV Services',
    displayName: 'IV Drip/Infusion at Home',
    shortDescription: 'Intravenous fluid or medicine administration at home',
    longDescription: 'Professional IV drip administration for hydration, medication, or vitamin infusions. Our trained nurses ensure safe and comfortable IV therapy at your home.',
    pricing: {
      basePrice: 799,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 60,
      equipmentRequired: ['IV Set', 'IV Stand', 'Cannula', 'Tape', 'Antiseptic'],
      suppliesNeeded: ['IV fluid/medicine', 'Prescription'],
      skillLevel: 'INTERMEDIATE'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune'],
      availableHours: { start: '06:00', end: '22:00' }
    },
    requirements: {
      prescriptionRequired: true,
      advanceBookingHours: 4
    },
    included: ['Nurse visit', 'IV cannulation', 'Drip monitoring', 'Vitals monitoring', 'Post-care instructions'],
    notIncluded: ['IV fluids/medicine', 'IV set (if not provided)'],
    isFeatured: true,
    isPopular: true,
    sortOrder: 2
  },

  {
    name: 'WOUND_DRESSING',
    slug: 'wound-dressing-care',
    category: 'NURSING',
    subCategory: 'Wound Care',
    displayName: 'Wound Dressing & Care',
    shortDescription: 'Professional wound cleaning and dressing at home',
    longDescription: 'Expert wound care including cleaning, antiseptic application, and sterile dressing. Suitable for post-surgery wounds, diabetic foot ulcers, bed sores, and injuries.',
    pricing: {
      basePrice: 499,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 30,
      equipmentRequired: ['Sterile gloves', 'Gauze', 'Bandages', 'Antiseptic solution', 'Scissors'],
      skillLevel: 'INTERMEDIATE'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune'],
      availableHours: { start: '06:00', end: '22:00' }
    },
    requirements: {
      prescriptionRequired: false,
      advanceBookingHours: 2
    },
    included: ['Wound cleaning', 'Antiseptic application', 'Sterile dressing', 'Vitals check'],
    notIncluded: ['Dressing materials (if not provided)', 'Antibiotics/ointments'],
    isFeatured: true,
    isPopular: true,
    sortOrder: 3
  },

  {
    name: 'CATHETER_CARE',
    slug: 'catheter-insertion-care',
    category: 'NURSING',
    subCategory: 'Critical Care',
    displayName: 'Catheter Insertion & Care',
    shortDescription: 'Urinary catheter insertion and maintenance',
    longDescription: 'Professional urinary catheter insertion, removal, and daily care by experienced nurses. Ensures hygiene and prevents infections.',
    pricing: {
      basePrice: 899,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 45,
      skillLevel: 'ADVANCED'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune'],
      availableHours: { start: '06:00', end: '22:00' }
    },
    requirements: {
      prescriptionRequired: true,
      advanceBookingHours: 4
    },
    included: ['Catheter insertion/removal', 'Hygiene care', 'Vitals monitoring'],
    notIncluded: ['Catheter kit (if not provided)'],
    sortOrder: 4
  },

  {
    name: 'POST_SURGERY_CARE',
    slug: 'post-surgery-nursing-care',
    category: 'NURSING',
    subCategory: 'Post-Operative Care',
    displayName: 'Post-Surgery Nursing Care',
    shortDescription: 'Comprehensive nursing care after surgery',
    longDescription: 'Complete post-operative care including wound monitoring, pain management, mobility assistance, and medication administration.',
    pricing: {
      basePrice: 1499,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 120,
      skillLevel: 'ADVANCED'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune'],
      availableHours: { start: '06:00', end: '22:00' }
    },
    requirements: {
      prescriptionRequired: true,
      advanceBookingHours: 12
    },
    included: ['Wound care', 'Vitals monitoring', 'Medicine administration', 'Mobility assistance', 'Pain assessment'],
    notIncluded: ['Medicines', 'Medical equipment'],
    isFeatured: true,
    sortOrder: 5
  },

  {
    name: 'ELDERLY_CARE_DAILY',
    slug: 'elderly-care-daily-visit',
    category: 'NURSING',
    subCategory: 'Elderly Care',
    displayName: 'Elderly Care - Daily Visit',
    shortDescription: 'Daily nursing care for senior citizens',
    longDescription: 'Comprehensive daily care for elderly including vitals monitoring, medication reminders, hygiene assistance, and companionship.',
    pricing: {
      basePrice: 999,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 90,
      skillLevel: 'INTERMEDIATE'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune'],
      availableHours: { start: '06:00', end: '22:00' }
    },
    requirements: {
      advanceBookingHours: 6,
      minAge: 60
    },
    included: ['Vitals check', 'Medicine reminder', 'Hygiene assistance', 'Light exercises', 'Meal assistance'],
    notIncluded: ['Food', 'Medicines', 'Personal care items'],
    isPopular: true,
    sortOrder: 6
  },

  // PHYSIOTHERAPY SERVICES
  {
    name: 'PHYSIO_SESSION',
    slug: 'physiotherapy-session',
    category: 'PHYSIOTHERAPY',
    subCategory: 'General Physiotherapy',
    displayName: 'Physiotherapy Session at Home',
    shortDescription: 'Professional physiotherapy treatment at home',
    longDescription: 'Expert physiotherapy session for pain relief, mobility improvement, and rehabilitation. Customized treatment plan based on your condition.',
    pricing: {
      basePrice: 799,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 45,
      skillLevel: 'INTERMEDIATE',
      certificationRequired: ['BPT Degree', 'State Registration']
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune'],
      availableHours: { start: '06:00', end: '21:00' }
    },
    requirements: {
      prescriptionRequired: false,
      advanceBookingHours: 4
    },
    included: ['Assessment', 'Manual therapy', 'Exercise prescription', 'Heat/ice therapy', 'Progress tracking'],
    notIncluded: ['Exercise equipment (if needed)'],
    isFeatured: true,
    isPopular: true,
    sortOrder: 10
  },

  {
    name: 'BACK_PAIN_PHYSIO',
    slug: 'back-pain-physiotherapy',
    category: 'PHYSIOTHERAPY',
    subCategory: 'Pain Management',
    displayName: 'Back Pain Physiotherapy',
    shortDescription: 'Specialized physiotherapy for back pain relief',
    longDescription: 'Targeted physiotherapy for lower back pain, sciatica, disc problems, and posture correction. Includes manual therapy, exercises, and education.',
    pricing: {
      basePrice: 899,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 50,
      skillLevel: 'ADVANCED'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune'],
      availableHours: { start: '06:00', end: '21:00' }
    },
    included: ['Pain assessment', 'Manual therapy', 'Stretching exercises', 'Strengthening program', 'Posture correction'],
    isFeatured: true,
    isPopular: true,
    sortOrder: 11
  },

  {
    name: 'KNEE_PAIN_PHYSIO',
    slug: 'knee-pain-physiotherapy',
    category: 'PHYSIOTHERAPY',
    subCategory: 'Joint Care',
    displayName: 'Knee Pain Physiotherapy',
    shortDescription: 'Specialized treatment for knee pain and arthritis',
    longDescription: 'Expert physiotherapy for knee pain, arthritis, post-surgery rehabilitation, and sports injuries. Personalized exercise program included.',
    pricing: {
      basePrice: 899,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 50,
      skillLevel: 'ADVANCED'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune']
    },
    included: ['Joint assessment', 'Pain relief therapy', 'Strengthening exercises', 'Mobility training', 'Home exercise program'],
    isPopular: true,
    sortOrder: 12
  },

  {
    name: 'POST_SURGERY_REHAB',
    slug: 'post-surgery-rehabilitation',
    category: 'PHYSIOTHERAPY',
    subCategory: 'Rehabilitation',
    displayName: 'Post-Surgery Rehabilitation',
    shortDescription: 'Complete rehabilitation after orthopedic surgery',
    longDescription: 'Comprehensive post-operative physiotherapy for faster recovery. Suitable for joint replacements, ligament repairs, fractures, and other surgeries.',
    pricing: {
      basePrice: 1299,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 60,
      skillLevel: 'ADVANCED',
      certificationRequired: ['BPT', 'MPT', 'Orthopedic Specialization']
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune']
    },
    requirements: {
      prescriptionRequired: true,
      advanceBookingHours: 12
    },
    included: ['Initial assessment', 'Wound/scar management', 'Range of motion exercises', 'Strength training', 'Gait training', 'Progress documentation'],
    isFeatured: true,
    sortOrder: 13
  },

  {
    name: 'STROKE_REHAB',
    slug: 'stroke-rehabilitation',
    category: 'PHYSIOTHERAPY',
    subCategory: 'Neurological Rehabilitation',
    displayName: 'Stroke Rehabilitation',
    shortDescription: 'Specialized physiotherapy for stroke recovery',
    longDescription: 'Expert neurological physiotherapy for stroke patients. Focus on mobility restoration, balance training, and functional independence.',
    pricing: {
      basePrice: 1499,
      currency: 'INR'
    },
    serviceDetails: {
      duration: 60,
      skillLevel: 'SPECIALIST',
      certificationRequired: ['BPT', 'MPT Neurology', 'Stroke Rehab Certification']
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune']
    },
    requirements: {
      prescriptionRequired: true,
      advanceBookingHours: 24
    },
    included: ['Neurological assessment', 'Mobility training', 'Balance exercises', 'ADL training', 'Caregiver education'],
    sortOrder: 14
  },

  // PACKAGES
  {
    name: 'PHYSIO_PACKAGE_10',
    slug: 'physiotherapy-package-10-sessions',
    category: 'PACKAGE',
    subCategory: 'Physiotherapy Package',
    displayName: 'Physiotherapy - 10 Sessions Package',
    shortDescription: 'Complete 10-session physiotherapy package',
    longDescription: 'Comprehensive physiotherapy package with 10 sessions. Best value for chronic pain, post-surgery recovery, or long-term rehabilitation.',
    pricing: {
      basePrice: 6999,
      currency: 'INR',
      packageDetails: {
        sessions: 10,
        duration: 21, // days
        pricePerSession: 699,
        totalPrice: 6999
      }
    },
    serviceDetails: {
      duration: 45,
      skillLevel: 'INTERMEDIATE'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune']
    },
    included: ['10 physiotherapy sessions', 'Personalized treatment plan', 'Exercise sheets', 'Progress tracking', 'WhatsApp support'],
    isFeatured: true,
    isPopular: true,
    sortOrder: 20
  },

  {
    name: 'ELDERLY_CARE_MONTHLY',
    slug: 'elderly-care-monthly-package',
    category: 'PACKAGE',
    subCategory: 'Elderly Care Package',
    displayName: 'Elderly Care - Monthly Package',
    shortDescription: '30-day comprehensive elderly care package',
    longDescription: 'Complete monthly care package for senior citizens including daily nursing visits, vitals monitoring, medicine management, and emergency support.',
    pricing: {
      basePrice: 24999,
      currency: 'INR',
      packageDetails: {
        sessions: 30,
        duration: 30,
        pricePerSession: 833,
        totalPrice: 24999
      }
    },
    serviceDetails: {
      duration: 90,
      skillLevel: 'INTERMEDIATE'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai']
    },
    requirements: {
      advanceBookingHours: 24,
      minAge: 60
    },
    included: ['30 nursing visits', 'Daily vitals monitoring', 'Medicine reminders', 'Hygiene assistance', 'Monthly health report', '24/7 phone support'],
    isFeatured: true,
    sortOrder: 21
  },

  {
    name: 'POST_SURGERY_14DAY',
    slug: 'post-surgery-care-14-days',
    category: 'PACKAGE',
    subCategory: 'Post-Surgery Package',
    displayName: 'Post-Surgery Care - 14 Days',
    shortDescription: 'Complete post-operative care for 2 weeks',
    longDescription: 'Comprehensive 14-day post-surgery nursing care including wound care, medication, physiotherapy, and doctor consultations.',
    pricing: {
      basePrice: 18999,
      currency: 'INR',
      packageDetails: {
        sessions: 14,
        duration: 14,
        pricePerSession: 1357,
        totalPrice: 18999
      }
    },
    serviceDetails: {
      duration: 120,
      skillLevel: 'ADVANCED'
    },
    availability: {
      isActive: true,
      availableCities: ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune']
    },
    requirements: {
      prescriptionRequired: true,
      advanceBookingHours: 24
    },
    included: ['14 nursing visits', 'Wound care', 'Vitals monitoring', 'Medicine administration', '7 physiotherapy sessions', '2 doctor video consultations', 'Medical report'],
    isFeatured: true,
    sortOrder: 22
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing services
    await ServiceCatalog.deleteMany({});
    console.log('🗑️  Cleared existing services');

    // Insert new services
    const result = await ServiceCatalog.insertMany(services);
    console.log(`✅ Inserted ${result.length} services`);

    // Display summary
    console.log('\n📊 Service Summary:');
    console.log(`- Nursing Services: ${services.filter(s => s.category === 'NURSING').length}`);
    console.log(`- Physiotherapy Services: ${services.filter(s => s.category === 'PHYSIOTHERAPY').length}`);
    console.log(`- Packages: ${services.filter(s => s.category === 'PACKAGE').length}`);
    console.log(`- Total: ${services.length}`);

    console.log('\n✅ Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
