const User = require('../models/user');
const { generateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// Register new user
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, specialty, hospital, location, phone } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.logAuth('register', email, false, 'User already exists');
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    // Create user
    let user;
    try {
      user = await User.create({
        name,
        email,
        password,
        role,
        specialty,
        hospital,
        location,
        phone
      });
    } catch (error) {
      logger.error('User creation error', { email, error: error.message });
      return res.status(400).json({
        success: false,
        message: 'Error creating user account',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Generate token
    const token = generateToken(user._id);

    logger.logAuth('register', email, true);
    logger.info('New User Registered', {
      userId: user._id,
      role: user.role,
      email: user.email
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialty: user.specialty,
        hospital: user.hospital,
        location: user.location,
        onboardingCompleted: user.onboardingCompleted  // Include onboarding status
      }
    });
  } catch (error) {
    logger.error('Registration Error', {
      email: req.body.email,
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

// Login user
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      logger.logAuth('login', email, false, 'User not found');
      logger.logSecurity('failed_login_attempt', { email, reason: 'User not found' });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
      logger.logAuth('login', email, false, 'Invalid password');
      logger.logSecurity('failed_login_attempt', { email, userId: user._id, reason: 'Invalid password' });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(user._id);

    logger.logAuth('login', email, true);
    logger.info('User Login Successful', {
      userId: user._id,
      role: user.role,
      email: user.email
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialty: user.specialty,
        hospital: user.hospital,
        location: user.location,
        rating: user.rating,
        completedDuties: user.completedDuties,
        onboardingCompleted: user.onboardingCompleted  // CRITICAL: Include onboarding status
      }
    });
  } catch (error) {
    logger.error('Login Error', {
      email: req.body.email,
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

// Get current user
exports.getMe = async (req, res, next) => {
  try {
    // req.user is already set by protect middleware
    const user = await User.findById(req.user._id).select('-password');

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

// Update current user profile
exports.updateMe = async (req, res, next) => {
  try {
    const updates = req.body;

    // Don't allow updating password or email through this route
    delete updates.password;
    delete updates.role;

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    // Calculate profile strength after update
    if (user.calculateProfileStrength) {
      await user.calculateProfileStrength();
      await user.save();
    }

    res.status(200).json({
      success: true,
      user,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    next(error);
  }
};