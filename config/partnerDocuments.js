/**
 * Documents each kind of partner must provide before working on Nabz.
 *
 * `flag` links a document to the trust badges on the staff profile
 * (careProfile.verification) that decide whether they can go online:
 * id = Aadhaar, police = police clearance, council = professional
 * registration / qualification, vaccinated = vaccination record.
 *
 * Aadhaar: we never store the number. It comes from DigiLocker (verified
 * name, date of birth and last 4 digits) or, until DigiLocker is set up, as a
 * masked copy (only the last 4 digits visible) that an admin checks.
 */

const KINDS = {
  AADHAAR: {
    label: 'Aadhaar (identity)',
    hint: 'Share it from DigiLocker, or upload a masked Aadhaar where only the last 4 digits are visible.',
    numberLabel: 'Last 4 digits of Aadhaar',
    numberPattern: /^\d{4}$/,
    digilocker: true,
    flag: 'id'
  },
  NURSING_REGISTRATION: {
    label: 'Nursing council registration',
    hint: 'Your state nursing council certificate (e.g. Rajasthan Nursing Council) or Indian Nursing Council NUID.',
    numberLabel: 'Registration or NUID number',
    hasExpiry: true,
    flag: 'council'
  },
  NURSING_QUALIFICATION: {
    label: 'Nursing degree or diploma',
    hint: 'GNM, ANM, B.Sc or M.Sc Nursing certificate.',
    flag: 'council'
  },
  PHYSIO_DEGREE: {
    label: 'Physiotherapy degree',
    hint: 'BPT or MPT degree certificate.',
    flag: 'council'
  },
  PHYSIO_REGISTRATION: {
    label: 'Physiotherapy council registration',
    hint: 'Only if your state has a physiotherapy council.',
    numberLabel: 'Registration number',
    hasExpiry: true,
    optional: true
  },
  QUALIFICATION: {
    label: 'Qualification certificate',
    hint: 'Your highest relevant healthcare qualification.',
    flag: 'council'
  },
  PHLEBOTOMY_CERTIFICATE: {
    label: 'DMLT or phlebotomy certificate',
    hint: 'Diploma in Medical Lab Technology or a recognised phlebotomy course.',
    flag: 'council'
  },
  POLICE_CHECK: {
    label: 'Police clearance certificate',
    hint: 'From your local police station or the state police portal. Renewed every year.',
    hasExpiry: true,
    flag: 'police'
  },
  VACCINATION: {
    label: 'Hepatitis B vaccination record',
    hint: 'Recommended for anyone giving injections or drawing blood.',
    optional: true,
    flag: 'vaccinated'
  },
  DRUG_LICENCE: {
    label: 'Retail drug licence (Form 20/21)',
    hint: 'Issued by the state drug controller.',
    numberLabel: 'Licence number',
    hasExpiry: true
  },
  PHARMACIST_REGISTRATION: {
    label: 'Registered pharmacist certificate',
    hint: 'State Pharmacy Council registration of the pharmacist on duty.',
    numberLabel: 'Registration number',
    hasExpiry: true
  },
  GST_CERTIFICATE: {
    label: 'GST registration',
    hint: 'GST certificate of the store.',
    numberLabel: 'GSTIN',
    numberPattern: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    optional: true
  },
  NABL_CERTIFICATE: {
    label: 'NABL accreditation',
    hint: 'NABL certificate of the lab.',
    numberLabel: 'Certificate number',
    hasExpiry: true
  },
  CLINICAL_ESTABLISHMENT: {
    label: 'Clinical establishment registration',
    hint: 'State registration of the lab.',
    numberLabel: 'Registration number',
    hasExpiry: true
  },
  DRIVING_LICENCE: {
    label: 'Driving licence',
    numberLabel: 'Licence number',
    hasExpiry: true
  },
  VEHICLE_RC: {
    label: 'Vehicle registration (RC)',
    numberLabel: 'Vehicle number',
    hasExpiry: true
  }
};

const REQUIREMENTS = {
  nurse: ['AADHAAR', 'NURSING_REGISTRATION', 'NURSING_QUALIFICATION', 'POLICE_CHECK', 'VACCINATION'],
  physiotherapist: ['AADHAAR', 'PHYSIO_DEGREE', 'PHYSIO_REGISTRATION', 'POLICE_CHECK', 'VACCINATION'],
  medical_staff: ['AADHAAR', 'QUALIFICATION', 'POLICE_CHECK', 'VACCINATION'],
  phlebotomist: ['AADHAAR', 'PHLEBOTOMY_CERTIFICATE', 'POLICE_CHECK', 'VACCINATION'],
  pharmacy_vendor: ['AADHAAR', 'DRUG_LICENCE', 'PHARMACIST_REGISTRATION', 'GST_CERTIFICATE'],
  lab_partner: ['AADHAAR', 'NABL_CERTIFICATE', 'CLINICAL_ESTABLISHMENT'],
  delivery_partner: ['AADHAAR', 'DRIVING_LICENCE', 'VEHICLE_RC', 'POLICE_CHECK']
};

// Reminders start this many days before a document expires.
const EXPIRY_REMINDER_DAYS = 30;

module.exports = { KINDS, REQUIREMENTS, EXPIRY_REMINDER_DAYS, DOCUMENT_KINDS: Object.keys(KINDS) };
