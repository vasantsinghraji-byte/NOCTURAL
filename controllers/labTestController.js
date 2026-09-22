/**
 * Lab Test Controller
 *
 * Catalog browsing, search, and admin management for diagnostic tests
 */

const LabTest = require('../models/labTest');
const { LAB_TEST_CATEGORIES } = require('../constants/enums');
const responseHelper = require('../utils/responseHelper');

/**
 * @desc    Get all lab tests with filtering, search, and pagination
 * @route   GET /api/v1/lab-tests
 * @access  Public
 */
exports.getTests = async (req, res, next) => {
  try {
    const {
      search,
      category,
      isPackage,
      isFeatured,
      isPopular,
      minPrice,
      maxPrice,
      city,
      page = 1,
      limit = 20,
      sortBy = 'popularity'
    } = req.query;

    const query = { 'availability.isActive': true };

    if (category) {
      query.category = category;
    }

    if (isPackage !== undefined) {
      query.isPackage = isPackage === 'true';
    }

    if (isFeatured !== undefined) {
      query.isFeatured = isFeatured === 'true';
    }

    if (isPopular !== undefined) {
      query.isPopular = isPopular === 'true';
    }

    if (city) {
      query['availability.availableCities'] = city;
    }

    if (minPrice || maxPrice) {
      query['pricing.sellingPrice'] = {};
      if (minPrice) query['pricing.sellingPrice'].$gte = Number(minPrice);
      if (maxPrice) query['pricing.sellingPrice'].$lte = Number(maxPrice);
    }

    if (search) {
      query.$text = { $search: search };
    }

    const sortOptions = {};
    if (sortBy === 'price_low_to_high') {
      sortOptions['pricing.sellingPrice'] = 1;
    } else if (sortBy === 'price_high_to_low') {
      sortOptions['pricing.sellingPrice'] = -1;
    } else if (sortBy === 'fastest_report') {
      sortOptions.reportTurnaroundHours = 1;
    } else {
      sortOptions['stats.totalOrders'] = -1;
      sortOptions.sortOrder = 1;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [tests, total] = await Promise.all([
      LabTest.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit))
        .populate('packageTests', 'name slug category pricing reportTurnaroundHours')
        .lean(),
      LabTest.countDocuments(query)
    ]);

    const pagination = {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
      totalResults: total
    };

    return responseHelper.sendPaginated(res, tests, pagination, 'Lab tests retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single lab test by ID or slug
 * @route   GET /api/v1/lab-tests/:identifier
 * @access  Public
 */
exports.getTestByIdOrSlug = async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);

    const test = await LabTest.findOne(
      isObjectId ? { _id: identifier } : { slug: identifier }
    ).populate('packageTests includedInPackages');

    if (!test) {
      return responseHelper.sendNotFound(res, 'Lab test not found');
    }

    return responseHelper.sendSuccess(res, { test }, 'Lab test details loaded');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all available lab test categories
 * @route   GET /api/v1/lab-tests/categories
 * @access  Public
 */
exports.getCategories = async (req, res) => {
  return responseHelper.sendSuccess(res, { categories: LAB_TEST_CATEGORIES }, 'Categories retrieved');
};

/**
 * @desc    Create new lab test in catalog
 * @route   POST /api/v1/lab-tests
 * @access  Private (Admin / Platform Admin)
 */
exports.createTest = async (req, res, next) => {
  try {
    const testData = { ...req.body };
    if (!testData.slug && testData.name) {
      testData.slug = testData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    const test = await LabTest.create(testData);
    return responseHelper.sendCreated(res, { test }, 'Lab test created successfully');
  } catch (error) {
    if (error.code === 11000) {
      return responseHelper.sendBadRequest(res, 'A test with this slug or code already exists');
    }
    next(error);
  }
};

/**
 * @desc    Update lab test
 * @route   PUT /api/v1/lab-tests/:id
 * @access  Private (Admin / Platform Admin)
 */
exports.updateTest = async (req, res, next) => {
  try {
    const test = await LabTest.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!test) {
      return responseHelper.sendNotFound(res, 'Lab test not found');
    }

    return responseHelper.sendSuccess(res, { test }, 'Lab test updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete or deactivate lab test
 * @route   DELETE /api/v1/lab-tests/:id
 * @access  Private (Admin / Platform Admin)
 */
exports.deleteTest = async (req, res, next) => {
  try {
    const test = await LabTest.findByIdAndUpdate(
      req.params.id,
      { 'availability.isActive': false },
      { new: true }
    );

    if (!test) {
      return responseHelper.sendNotFound(res, 'Lab test not found');
    }

    return responseHelper.sendSuccess(res, { test }, 'Lab test deactivated successfully');
  } catch (error) {
    next(error);
  }
};
