const dutyService = require('../services/dutyService');
const { SUCCESS_MESSAGE } = require('../constants');
const responseHelper = require('../utils/responseHelper');

// Get all duties
exports.getDuties = async (req, res, next) => {
  try {
    const result = await dutyService.getAllDuties();

    responseHelper.sendSuccess(res, {
      count: result.duties.length,
      duties: result.duties
    });
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// Get single duty
exports.getDuty = async (req, res, next) => {
  try {
    const duty = await dutyService.getDutyById(req.params.id);

    responseHelper.sendSuccess(res, { duty });
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// Create new duty (admin only)
exports.createDuty = async (req, res, next) => {
  try {
    const duty = await dutyService.createDuty(req.body, req.user);

    responseHelper.sendCreated(res, { duty }, SUCCESS_MESSAGE.DUTY_CREATED);
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// Update duty (admin only)
exports.updateDuty = async (req, res, next) => {
  try {
    const duty = await dutyService.updateDuty(req.params.id, req.body, req.user);

    responseHelper.sendSuccess(res, { duty }, SUCCESS_MESSAGE.DUTY_UPDATED);
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};

// Delete duty (admin only)
exports.deleteDuty = async (req, res, next) => {
  try {
    await dutyService.deleteDuty(req.params.id, req.user);

    responseHelper.sendSuccess(res, {}, SUCCESS_MESSAGE.DUTY_DELETED);
  } catch (error) {
    responseHelper.handleServiceError(error, res, next);
  }
};
