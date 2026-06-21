const express = require('express');
const { body, validationResult } = require('express-validator');
const HospitalWaitlist = require('../models/hospitalWaitlist');
const { rejectHoneypotSubmissions } = require('../middleware/spamTrap');
const emailNotificationService = require('../services/emailNotificationService');
const logger = require('../utils/logger');

const router = express.Router();

const normalizeKey = (value) => String(value || '').trim().toLowerCase();

const waitlistValidation = [
  body('facilityName').trim().notEmpty().isLength({ min: 2, max: 180 }),
  body('facilityType').trim().isIn(['hospital', 'tertiary_care', 'clinic', 'care_centre', 'other']),
  body('contactName').trim().notEmpty().isLength({ min: 2, max: 120 }),
  body('email').trim().isEmail().normalizeEmail().isLength({ max: 160 }),
  body('phone').trim().notEmpty().isLength({ min: 8, max: 25 }),
  body('city').trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('state').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('expectedNeed').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }),
  body('companyWebsite').optional({ checkFalsy: true }).trim().isLength({ max: 200 })
];

router.post('/', rejectHoneypotSubmissions, waitlistValidation, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Please check the waitlist form and try again',
        errors: errors.array()
      });
    }

    const emailKey = normalizeKey(req.body.email);
    const organizationKey = normalizeKey(`${req.body.facilityName}|${req.body.city}`);
    const existingLead = await HospitalWaitlist.findOne({
      $or: [{ emailKey }, { organizationKey }]
    }).lean();

    if (existingLead) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: 'You are already on the hospital waitlist. We will contact you when B2B onboarding opens.'
      });
    }

    const lead = await HospitalWaitlist.create({
      facilityName: req.body.facilityName,
      facilityType: req.body.facilityType,
      contactName: req.body.contactName,
      email: req.body.email,
      emailKey,
      phone: req.body.phone,
      city: req.body.city,
      state: req.body.state,
      expectedNeed: req.body.expectedNeed,
      organizationKey,
      sourcePath: req.body.sourcePath || req.get('referer') || '',
      userAgent: req.get('user-agent') || '',
      ipAddress: req.ip || ''
    });

    Promise.allSettled([
      emailNotificationService.sendHospitalWaitlistConfirmation(lead),
      emailNotificationService.sendHospitalWaitlistAdminNotification(lead)
    ]).then((results) => {
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length > 0) {
        logger.warn('Hospital waitlist email notification failed', {
          leadId: lead._id,
          errors: failed.map((result) => result.reason.message)
        });
      }
    });

    return res.status(201).json({
      success: true,
      leadId: lead._id,
      message: 'You are on the hospital waitlist. We will contact you when B2B onboarding opens.'
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
