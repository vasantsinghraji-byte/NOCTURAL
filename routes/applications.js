const express = require('express');
const router = express.Router();
const {
  getMyApplications,
  getApplicationStats,
  getReceivedApplications,
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

router.get('/stats', protect, getApplicationStats);
router.get('/received', protect, authorize('admin'), getReceivedApplications);
router.get('/duty/:dutyId', protect, authorize('admin'), getDutyApplications);
router.put('/:id/status', protect, authorize('admin'), validateUpdateApplicationStatus, updateApplicationStatus);

router.route('/:id')
  .put(protect, authorize('admin'), validateUpdateApplicationStatus, updateApplicationStatus)
  .delete(protect, validateWithdrawApplication, withdrawApplication);

module.exports = router;
