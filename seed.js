require('dotenv').config();

const mongoose = require('mongoose');
const User = require('./models/user');
const Duty = require('./models/duty');
const Hospital = require('./models/hospital');

mongoose.connect(process.env.MONGODB_URI);

async function seed() {
  console.log('Starting seed...');
  
  const hospitalOrg = await Hospital.create({
    name: 'Demo Hospital',
    location: 'Mumbai, India'
  });

  // Create hospital admin
  const hospital = await User.create({
    name: 'Demo Hospital',
    email: 'demo@hospital.com',
    password: 'demo123',
    role: 'admin',
    hospitalId: hospitalOrg._id,
    location: 'Mumbai, India'
  });
  
  console.log('Created hospital admin');

  // Create platform admin (cross-tenant operator, e.g. credential verification)
  await User.create({
    name: 'Platform Admin',
    email: 'platform@nocturnal.com',
    password: 'demo123',
    role: 'platform_admin',
    location: 'Mumbai, India'
  });

  console.log('Created platform admin');

  // Create 5 sample duties
  for (let i = 1; i <= 5; i++) {
    await Duty.create({
      title: `Night Shift ER Doctor ${i}`,
      hospitalId: hospitalOrg._id,
      department: 'Emergency',
      specialty: 'Emergency Medicine',
      description: 'Need experienced ER doctor for night coverage',
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
      startTime: '20:00',
      endTime: '06:00',
      hourlyRate: 2000,
      location: 'Emergency Department',
      urgency: i <= 2 ? 'URGENT' : 'NORMAL',
      postedBy: hospital._id
    });
  }
  
  console.log('Created 5 duties');
  console.log('Seed completed!');
  process.exit();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
