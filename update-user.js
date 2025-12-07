const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/user');

async function updateUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find the most recent user
    const user = await User.findOne().sort({ createdAt: -1 });
    
    if (user) {
      console.log('Found user:', user.email);
      
      // Mark onboarding as complete
      user.onboardingCompleted = true;
      user.onboardingStep = 4;
      
      await user.save();
      console.log('✅ User updated - onboarding marked as complete!');
    } else {
      console.log('No user found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateUser();
