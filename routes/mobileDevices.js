const express = require('express');
const { body } = require('express-validator');
const { protectBoth } = require('../middleware/patientAuth');
const { validate } = require('../middleware/validation');
const mobileDeviceService = require('../services/mobileDeviceService');

const router = express.Router();

const tokenValidation = body('token')
  .isString()
  .trim()
  .isLength({ min: 16, max: 4096 })
  .withMessage('A valid device token is required');

router.post(
  '/',
  protectBoth,
  [
    tokenValidation,
    body('platform').isIn(['android', 'ios']).withMessage('Invalid mobile platform')
  ],
  validate,
  async (req, res, next) => {
    try {
      const device = await mobileDeviceService.register({
        owner: req.user._id,
        userType: req.userType,
        token: req.body.token,
        platform: req.body.platform
      });
      res.status(201).json({ success: true, data: { device } });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/',
  protectBoth,
  [tokenValidation],
  validate,
  async (req, res, next) => {
    try {
      const device = await mobileDeviceService.unregister({
        owner: req.user._id,
        userType: req.userType,
        token: req.body.token
      });
      res.json({ success: true, data: { device } });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
