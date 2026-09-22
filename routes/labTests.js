/**
 * Lab Test Routes
 *
 * Endpoints for browsing and searching catalog, and admin CRUD
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validation');
const { protect, authorize } = require('../middleware/auth');
const {
  getTests,
  getTestByIdOrSlug,
  getCategories,
  createTest,
  updateTest,
  deleteTest
} = require('../controllers/labTestController');
const {
  createLabTestValidation,
  searchLabTestsValidation
} = require('../validators/labTestValidator');

// Public catalog routes
router.get('/', searchLabTestsValidation, validate, getTests);
router.get('/categories', getCategories);
router.get('/:identifier', getTestByIdOrSlug);

// Admin-only management routes
router.post('/', protect, authorize('admin', 'platform_admin'), createLabTestValidation, validate, createTest);
router.put('/:id', protect, authorize('admin', 'platform_admin'), updateTest);
router.delete('/:id', protect, authorize('admin', 'platform_admin'), deleteTest);

module.exports = router;
