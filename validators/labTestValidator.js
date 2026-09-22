/**
 * Lab Test Validators
 */

const { body, param, query } = require('express-validator');
const { LAB_TEST_CATEGORIES, SAMPLE_STATUSES } = require('../constants/enums');

exports.createLabTestValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Test name is required')
    .isLength({ min: 2, max: 200 }).withMessage('Test name must be between 2 and 200 characters'),
  body('category')
    .notEmpty().withMessage('Category is required')
    .isIn(LAB_TEST_CATEGORIES).withMessage('Invalid lab test category'),
  body('sampleType')
    .notEmpty().withMessage('Sample type is required')
    .isIn(['BLOOD', 'URINE', 'STOOL', 'SPUTUM', 'SWAB', 'SALIVA', 'OTHER']).withMessage('Invalid sample type'),
  body('pricing.mrp')
    .notEmpty().withMessage('MRP is required')
    .isFloat({ min: 0 }).withMessage('MRP must be a non-negative number'),
  body('pricing.sellingPrice')
    .notEmpty().withMessage('Selling price is required')
    .isFloat({ min: 0 }).withMessage('Selling price must be a non-negative number')
];

exports.searchLabTestsValidation = [
  query('category')
    .optional()
    .isIn(LAB_TEST_CATEGORIES).withMessage('Invalid category filter'),
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

exports.bookLabTestValidation = [
  body('tests')
    .isArray({ min: 1 }).withMessage('At least one lab test must be selected'),
  body('tests.*.testId')
    .notEmpty().withMessage('Test ID is required')
    .isMongoId().withMessage('Invalid test ID format'),
  body('scheduledDate')
    .notEmpty().withMessage('Scheduled date is required')
    .isISO8601().withMessage('Invalid scheduled date format'),
  body('scheduledSlot')
    .trim()
    .notEmpty().withMessage('Scheduled slot is required'),
  body('collectionAddress')
    .notEmpty().withMessage('Collection address is required'),
  body('collectionAddress.street')
    .trim()
    .notEmpty().withMessage('Street address is required'),
  body('collectionAddress.city')
    .trim()
    .notEmpty().withMessage('City is required'),
  body('collectionAddress.pincode')
    .trim()
    .notEmpty().withMessage('Pincode is required')
];

exports.updateSampleStatusValidation = [
  param('id')
    .isMongoId().withMessage('Invalid booking ID'),
  body('sampleStatus')
    .notEmpty().withMessage('Sample status is required')
    .isIn(SAMPLE_STATUSES).withMessage('Invalid sample status')
];
