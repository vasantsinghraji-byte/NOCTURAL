/**
 * Test Data Factories
 * Generate realistic mock data for testing
 */

/**
 * User Data Factories
 */

function userFactory(overrides = {}) {
  return {
    name: 'John Doe',
    email: global.testUtils.randomEmail(),
    password: 'Password@123',
    phone: global.testUtils.randomPhone(),
    role: 'doctor',
    dateOfBirth: new Date('1990-01-01'),
    gender: 'male',
    address: {
      street: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      country: 'USA'
    },
    status: 'ACTIVE',
    isVerified: true,
    emailVerified: true,
    phoneVerified: true,
    profileCompleted: true,
    ...overrides
  };
}

function doctorFactory(overrides = {}) {
  return userFactory({
    role: 'doctor',
    specialty: 'Emergency Medicine',
    licenseNumber: `MD${Math.floor(Math.random() * 1000000)}`,
    licenseState: 'CA',
    licenseExpiry: global.testUtils.futureDate(365),
    experience: 5,
    education: [{
      degree: 'MD',
      institution: 'Stanford Medical School',
      graduationYear: 2015
    }],
    certifications: ['BLS', 'ACLS', 'PALS'],
    ...overrides
  });
}

function nurseFactory(overrides = {}) {
  return userFactory({
    role: 'nurse',
    specialty: 'Critical Care',
    licenseNumber: `RN${Math.floor(Math.random() * 1000000)}`,
    licenseState: 'CA',
    licenseExpiry: global.testUtils.futureDate(365),
    experience: 3,
    certifications: ['BLS', 'ACLS'],
    ...overrides
  });
}

function patientFactory(overrides = {}) {
  return userFactory({
    role: 'patient',
    emergencyContact: {
      name: 'Jane Doe',
      relationship: 'Spouse',
      phone: global.testUtils.randomPhone()
    },
    insurance: {
      provider: 'Blue Cross',
      policyNumber: `POL${Math.floor(Math.random() * 1000000)}`,
      groupNumber: `GRP${Math.floor(Math.random() * 10000)}`
    },
    medicalHistory: {
      allergies: ['Penicillin'],
      chronicConditions: [],
      currentMedications: []
    },
    ...overrides
  });
}

function hospitalFactory(overrides = {}) {
  return userFactory({
    role: 'hospital',
    name: 'Test Hospital',
    email: 'hospital@test.com',
    hospital: 'Test Hospital',
    hospitalType: 'General',
    hospitalVerified: true,
    facilitySize: 'Large',
    departments: ['Emergency', 'ICU', 'Surgery'],
    ...overrides
  });
}

/**
 * Duty/Shift Data Factories
 */

function dutyFactory(hospitalId, overrides = {}) {
  return {
    title: 'Night Shift - Emergency Department',
    specialty: 'Emergency Medicine',
    hospital: hospitalId,
    hospitalName: 'Test Hospital',
    location: {
      address: '123 Hospital St',
      city: 'San Francisco',
      state: 'CA',
      zipCode: '94102',
      coordinates: {
        latitude: 37.7749,
        longitude: -122.4194
      }
    },
    date: global.testUtils.futureDate(7),
    startTime: '20:00',
    endTime: '08:00',
    duration: 12,
    payRate: 75,
    totalPay: 900,
    requirements: {
      minExperience: 2,
      requiredCertifications: ['BLS', 'ACLS'],
      preferredCertifications: ['PALS'],
      skills: ['Emergency Care', 'Triage'],
      licenseRequired: true
    },
    description: 'Seeking experienced ER physician for night shift coverage',
    responsibilities: [
      'Provide emergency medical care',
      'Supervise nursing staff',
      'Document patient encounters'
    ],
    benefits: ['Meals provided', 'Free parking'],
    maxApplicants: 10,
    status: 'OPEN',
    postedBy: hospitalId,
    ...overrides
  };
}

function urgentDutyFactory(hospitalId, overrides = {}) {
  return dutyFactory(hospitalId, {
    title: 'URGENT: ICU Coverage Needed',
    specialty: 'Critical Care',
    date: global.testUtils.futureDate(1),
    payRate: 100,
    totalPay: 1200,
    priority: 'HIGH',
    ...overrides
  });
}

/**
 * Application Data Factories
 */

function applicationFactory(dutyId, applicantId, overrides = {}) {
  return {
    duty: dutyId,
    applicant: applicantId,
    status: 'PENDING',
    appliedAt: new Date(),
    coverLetter: 'I am very interested in this position and believe my experience makes me an excellent candidate.',
    availability: {
      confirmed: true,
      notes: 'Available for the entire shift'
    },
    ...overrides
  };
}

function acceptedApplicationFactory(dutyId, applicantId, overrides = {}) {
  return applicationFactory(dutyId, applicantId, {
    status: 'ACCEPTED',
    reviewedBy: dutyId, // In real scenario, this would be reviewer ID
    reviewedAt: new Date(),
    reviewNotes: 'Excellent qualifications',
    ...overrides
  });
}

/**
 * Review Data Factories
 */

function reviewFactory(reviewerId, reviewedUserId, dutyId, overrides = {}) {
  return {
    reviewer: reviewerId,
    reviewedUser: reviewedUserId,
    duty: dutyId,
    rating: {
      overall: 4.5,
      punctuality: 5,
      professionalism: 4,
      clinicalSkills: 5,
      communication: 4,
      teamwork: 5
    },
    comment: 'Excellent performance, highly professional and skilled.',
    visibility: 'PUBLIC',
    ...overrides
  };
}

/**
 * Earning Data Factories
 */

function earningFactory(userId, dutyId, overrides = {}) {
  return {
    user: userId,
    duty: dutyId,
    amount: 900,
    status: 'COMPLETED',
    shiftDate: global.testUtils.pastDate(7),
    paymentMethod: 'BANK_TRANSFER',
    ...overrides
  };
}

function pendingEarningFactory(userId, dutyId, overrides = {}) {
  return earningFactory(userId, dutyId, {
    status: 'PENDING',
    shiftDate: global.testUtils.pastDate(1),
    ...overrides
  });
}

/**
 * Certification Data Factories
 */

function certificationFactory(userId, overrides = {}) {
  return {
    user: userId,
    name: 'Basic Life Support (BLS)',
    issuingOrganization: 'American Heart Association',
    certificationNumber: `BLS${Math.floor(Math.random() * 1000000)}`,
    issueDate: global.testUtils.pastDate(365),
    expiryDate: global.testUtils.futureDate(365),
    verified: true,
    ...overrides
  };
}

/**
 * Message/Conversation Data Factories
 */

function conversationFactory(participant1, participant2, overrides = {}) {
  return {
    participants: [participant1, participant2],
    type: 'DIRECT',
    status: 'ACTIVE',
    lastMessageAt: new Date(),
    ...overrides
  };
}

function messageFactory(conversationId, senderId, overrides = {}) {
  return {
    conversation: conversationId,
    sender: senderId,
    content: 'This is a test message',
    type: 'TEXT',
    status: 'SENT',
    ...overrides
  };
}

/**
 * Notification Data Factories
 */

function notificationFactory(userId, overrides = {}) {
  return {
    user: userId,
    title: 'New Duty Posted',
    message: 'A new duty matching your specialty has been posted',
    type: 'DUTY_POSTED',
    priority: 'NORMAL',
    read: false,
    ...overrides
  };
}

/**
 * Achievement Data Factories
 */

function achievementFactory(userId, overrides = {}) {
  return {
    user: userId,
    type: 'MILESTONE',
    title: 'First Duty Completed',
    description: 'Successfully completed your first duty assignment',
    icon: '🎉',
    points: 100,
    earnedAt: new Date(),
    visible: true,
    ...overrides
  };
}

/**
 * Payment Data Factories
 */

function paymentFactory(userId, overrides = {}) {
  return {
    user: userId,
    amount: 900,
    currency: 'USD',
    type: 'DUTY_PAYMENT',
    method: 'RAZORPAY',
    status: 'COMPLETED',
    ...overrides
  };
}

/**
 * Shift Series Data Factories
 */

function shiftSeriesFactory(hospitalId, overrides = {}) {
  return {
    title: 'Weekly Night Shifts - ER',
    description: 'Recurring night shift coverage for emergency department',
    specialty: 'Emergency Medicine',
    hospital: hospitalId,
    postedBy: hospitalId,
    recurrence: {
      pattern: 'WEEKLY',
      daysOfWeek: [1, 3, 5], // Monday, Wednesday, Friday
      startDate: global.testUtils.futureDate(7),
      endDate: global.testUtils.futureDate(90)
    },
    shiftDetails: {
      startTime: '20:00',
      endTime: '08:00',
      duration: 12,
      payRate: 75
    },
    status: 'OPEN',
    ...overrides
  };
}

/**
 * Bulk Data Generators
 */

function generateUsers(count, role = 'doctor') {
  const users = [];
  const factory = role === 'doctor' ? doctorFactory :
                  role === 'nurse' ? nurseFactory :
                  role === 'patient' ? patientFactory :
                  role === 'hospital' ? hospitalFactory : userFactory;

  for (let i = 0; i < count; i++) {
    users.push(factory({ name: `Test ${role} ${i + 1}` }));
  }
  return users;
}

function generateDuties(hospitalId, count) {
  const duties = [];
  for (let i = 0; i < count; i++) {
    duties.push(dutyFactory(hospitalId, {
      title: `Test Duty ${i + 1}`,
      date: global.testUtils.futureDate(i + 1)
    }));
  }
  return duties;
}

function generateApplications(dutyId, applicantIds) {
  return applicantIds.map((applicantId, index) =>
    applicationFactory(dutyId, applicantId, {
      appliedAt: new Date(Date.now() - (applicantIds.length - index) * 3600000)
    })
  );
}

module.exports = {
  // User factories
  userFactory,
  doctorFactory,
  nurseFactory,
  patientFactory,
  hospitalFactory,

  // Duty factories
  dutyFactory,
  urgentDutyFactory,

  // Application factories
  applicationFactory,
  acceptedApplicationFactory,

  // Review factories
  reviewFactory,

  // Earning factories
  earningFactory,
  pendingEarningFactory,

  // Certification factories
  certificationFactory,

  // Message factories
  conversationFactory,
  messageFactory,

  // Notification factories
  notificationFactory,

  // Achievement factories
  achievementFactory,

  // Payment factories
  paymentFactory,

  // Shift series factories
  shiftSeriesFactory,

  // Bulk generators
  generateUsers,
  generateDuties,
  generateApplications
};
