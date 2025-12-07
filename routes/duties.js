const express = require('express');
const router = express.Router();
const {
  getDuties,
  getDuty,
  createDuty,
  updateDuty,
  deleteDuty
} = require('../controllers/dutyController');
const { protect, authorize } = require('../middleware/auth');
const { queryCache } = require('../middleware/queryCache');

// Enhanced security validators
const {
  validateCreateDuty,
  validateUpdateDuty,
  validateGetDuty,
  validateSearchDuties,
  validateDeleteDuty
} = require('../validators/dutyValidator');

// Cache duty list for 2 minutes (fast-changing data)
router.route('/')
  .get(protect, validateSearchDuties, queryCache({ ttl: 120 }), getDuties)
  .post(protect, authorize('admin'), validateCreateDuty, createDuty);

// Cache individual duty for 5 minutes
router.route('/:id')
  .get(protect, validateGetDuty, queryCache({ ttl: 300 }), getDuty)
  .put(protect, authorize('admin'), validateUpdateDuty, updateDuty)
  .delete(protect, authorize('admin'), validateDeleteDuty, deleteDuty);

module.exports = router;