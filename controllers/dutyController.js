const dutyService = require('../services/dutyService');
const { HTTP_STATUS, SUCCESS_MESSAGE } = require('../constants');

// Get all duties
exports.getDuties = async (req, res, next) => {
  try {
    const result = await dutyService.getAllDuties();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      count: result.duties.length,
      duties: result.duties
    });
  } catch (error) {
    next(error);
  }
};

// Get single duty
exports.getDuty = async (req, res, next) => {
  try {
    const duty = await dutyService.getDutyById(req.params.id);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      duty
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

// Create new duty (admin only)
exports.createDuty = async (req, res, next) => {
  try {
    const duty = await dutyService.createDuty(req.body, req.user);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: SUCCESS_MESSAGE.DUTY_CREATED,
      duty
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

// Update duty (admin only)
exports.updateDuty = async (req, res, next) => {
  try {
    const duty = await dutyService.updateDuty(req.params.id, req.body, req.user);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGE.DUTY_UPDATED,
      duty
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

// Delete duty (admin only)
exports.deleteDuty = async (req, res, next) => {
  try {
    await dutyService.deleteDuty(req.params.id, req.user);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGE.DUTY_DELETED
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};
