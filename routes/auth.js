const express = require('express');
const router = express.Router();
const {
  register,
  login,
  refresh,
  logout,
  getMe,
  updateMe,
  changePassword
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { rejectHoneypotSubmissions } = require('../middleware/spamTrap');

// Enhanced security validators
const {
  validateRegister,
  validateLogin,
  validateChangePassword,
  validateUpdateProfile
} = require('../validators/authValidator');

// Auth routes with enhanced validation
router.post('/register', rejectHoneypotSubmissions, validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.put('/me', protect, validateUpdateProfile, updateMe);
router.put('/change-password', protect, validateChangePassword, changePassword);

module.exports = router;
