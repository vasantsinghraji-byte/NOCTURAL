const express = require('express');
const { body, validationResult } = require('express-validator');
const HospitalWaitlist = require('../models/hospitalWaitlist');
const logger = require('../utils/logger');

const router = express.Router();

const validateWaitlistRequest = [
  body('organizationName')
    .trim()
    .notEmpty().withMessage('Hospital or facility name is required')
    .isLength({ min: 2, max: 160 }).withMessage('Hospital or facility name must be between 2 and 160 characters'),
  body('contactName')
    .trim()
    .notEmpty().withMessage('Contact name is required')
    .isLength({ min: 2, max: 120 }).withMessage('Contact name must be between 2 and 120 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\+?[1-9]\d{9,14}$/).withMessage('Please provide a valid phone number'),
  body('city')
    .trim()
    .notEmpty().withMessage('City is required')
    .isLength({ min: 2, max: 100 }).withMessage('City must be between 2 and 100 characters'),
  body('facilityType')
    .isIn(['hospital', 'tertiary-care-centre', 'clinic-network', 'care-centre'])
    .withMessage('Invalid facility type'),
  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes must be 1000 characters or fewer'),
  body('source')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 80 }).withMessage('Source must be 80 characters or fewer')
];

router.post('/', validateWaitlistRequest, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg
      }))
    });
  }

  const lead = await HospitalWaitlist.create({
    organizationName: req.body.organizationName,
    contactName: req.body.contactName,
    email: req.body.email,
    phone: req.body.phone,
    city: req.body.city,
    facilityType: req.body.facilityType,
    notes: req.body.notes,
    source: req.body.source || 'public-funnel'
  });

  logger.info('Hospital waitlist lead captured', {
    leadId: lead._id,
    facilityType: lead.facilityType,
    city: lead.city,
    source: lead.source
  });

  res.status(201).json({
    success: true,
    message: 'Waitlist request received'
  });
});

module.exports = router;
