const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  updateMe
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Enhanced security validators
const {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateVerifyEmail,
  validateVerifyPhone,
  validateChangePassword,
  validateUpdateProfile
} = require('../validators/authValidator');

// Auth routes with enhanced validation
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.get('/me', protect, getMe);
router.put('/me', protect, validateUpdateProfile, updateMe);

module.exports = router;