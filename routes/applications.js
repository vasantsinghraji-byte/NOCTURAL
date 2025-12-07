const express = require('express');
const router = express.Router();
const {
  getMyApplications,
  getDutyApplications,
  applyForDuty,
  updateApplicationStatus,
  withdrawApplication
} = require('../controllers/applicationController');
const { protect, authorize } = require('../middleware/auth');

// Enhanced security validators
const {
  validateApplyToDuty,
  validateUpdateApplicationStatus,
  validateGetApplication,
  validateWithdrawApplication
} = require('../validators/dutyValidator');

router.route('/')
  .get(protect, getMyApplications)
  .post(protect, authorize('doctor', 'nurse'), validateApplyToDuty, applyForDuty);

router.get('/duty/:dutyId', protect, authorize('admin'), getDutyApplications);

router.route('/:id')
  .put(protect, authorize('admin'), validateUpdateApplicationStatus, updateApplicationStatus)
  .delete(protect, validateWithdrawApplication, withdrawApplication);

module.exports = router;