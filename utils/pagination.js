/**
 * Pagination Utility
 *
 * Provides consistent pagination across all API endpoints
 * with performance optimizations and query flexibility
 */

const mongoose = require('mongoose');

/**
 * Paginate mongoose query results
 *
 * @param {Model} model - Mongoose model
 * @param {Object} query - MongoDB query object
 * @param {Object} options - Pagination options
 * @param {Number} options.page - Page number (default: 1)
 * @param {Number} options.limit - Items per page (default: 20, max: 100)
 * @param {Object} options.sort - Sort criteria (default: { createdAt: -1 })
 * @param {String|Object} options.select - Fields to select
 * @param {String|Array} options.populate - Relations to populate
 * @param {Boolean} options.lean - Use lean() for better performance (default: true)
 * @returns {Promise<Object>} Paginated results with metadata
 */
const paginate = async (model, query = {}, options = {}) => {
    // Parse and validate pagination parameters
    const page = Math.max(1, parseInt(options.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
    const skip = (page - 1) * limit;

    // Default options
    const sort = options.sort || { createdAt: -1 };
    const select = options.select || '';
    const populate = options.populate || '';
    const useLean = options.lean !== false; // Default true for performance

    try {
        // Build base query
        let docsQuery = model.find(query)
            .limit(limit)
            .skip(skip)
            .sort(sort);

        // Apply field selection
        if (select) {
            docsQuery = docsQuery.select(select);
        }

        // Apply population
        if (populate) {
            if (Array.isArray(populate)) {
                populate.forEach(pop => {
                    docsQuery = docsQuery.populate(pop);
                });
            } else {
                docsQuery = docsQuery.populate(populate);
            }
        }

        // Use lean for better performance (returns plain JS objects)
        if (useLean) {
            docsQuery = docsQuery.lean();
        }

        // Execute query and count in parallel for better performance
        const [docs, total] = await Promise.all([
            docsQuery.exec(),
            model.countDocuments(query)
        ]);

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        return {
            success: true,
            data: docs,
            pagination: {
                total,
                count: docs.length,
                page,
                limit,
                pages: totalPages,
                hasNext: hasNextPage,
                hasPrev: hasPrevPage,
                nextPage: hasNextPage ? page + 1 : null,
                prevPage: hasPrevPage ? page - 1 : null
            }
        };
    } catch (error) {
        throw new Error(`Pagination error: ${error.message}`);
    }
};

/**
 * Advanced pagination with search and filters
 *
 * @param {Model} model - Mongoose model
 * @param {Object} params - Request parameters
 * @param {Object} params.filters - Filter conditions
 * @param {String} params.search - Search query
 * @param {Array} params.searchFields - Fields to search in
 * @param {Object} options - Pagination options (same as paginate)
 * @returns {Promise<Object>} Paginated results with metadata
 */
const paginateWithSearch = async (model, params = {}, options = {}) => {
    const { filters = {}, search = '', searchFields = [] } = params;

    // Build query with filters
    let query = { ...filters };

    // Add search conditions if search term provided
    if (search && searchFields.length > 0) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = searchFields.map(field => ({
            [field]: searchRegex
        }));
    }

    return paginate(model, query, options);
};

/**
 * Cursor-based pagination (for infinite scroll)
 * Better for real-time data and large datasets
 *
 * @param {Model} model - Mongoose model
 * @param {Object} query - MongoDB query object
 * @param {Object} options - Pagination options
 * @param {String} options.cursor - Cursor for next page (document _id)
 * @param {Number} options.limit - Items per page
 * @param {Object} options.sort - Sort criteria
 * @returns {Promise<Object>} Results with next cursor
 */
const paginateCursor = async (model, query = {}, options = {}) => {
    const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
    const sort = options.sort || { createdAt: -1 };
    const select = options.select || '';
    const cursor = options.cursor;

    try {
        // Add cursor condition to query
        if (cursor) {
            const cursorDoc = await model.findById(cursor).select('createdAt').lean();
            if (cursorDoc) {
                // Assuming sort by createdAt descending
                if (sort.createdAt === -1) {
                    query.createdAt = { $lt: cursorDoc.createdAt };
                } else {
                    query.createdAt = { $gt: cursorDoc.createdAt };
                }
            }
        }

        // Fetch one extra to check if there's more
        let docsQuery = model.find(query)
            .limit(limit + 1)
            .sort(sort);

        if (select) {
            docsQuery = docsQuery.select(select);
        }

        const docs = await docsQuery.lean().exec();

        // Check if there are more results
        const hasMore = docs.length > limit;
        const results = hasMore ? docs.slice(0, limit) : docs;

        // Get next cursor (last document _id)
        const nextCursor = hasMore && results.length > 0
            ? results[results.length - 1]._id.toString()
            : null;

        return {
            success: true,
            data: results,
            pagination: {
                count: results.length,
                hasMore,
                nextCursor
            }
        };
    } catch (error) {
        throw new Error(`Cursor pagination error: ${error.message}`);
    }
};

/**
 * Middleware to add pagination helpers to request
 */
const paginationMiddleware = (req, res, next) => {
    // Parse pagination params from query string
    req.pagination = {
        page: parseInt(req.query.page) || 1,
        limit: Math.min(100, parseInt(req.query.limit) || 20),
        sort: req.query.sort || '-createdAt',
        select: req.query.select || '',
        populate: req.query.populate || ''
    };

    // Parse sort (e.g., "name,-createdAt" => { name: 1, createdAt: -1 })
    if (typeof req.pagination.sort === 'string') {
        const sortObj = {};
        req.pagination.sort.split(',').forEach(field => {
            if (field.startsWith('-')) {
                sortObj[field.slice(1)] = -1;
            } else {
                sortObj[field] = 1;
            }
        });
        req.pagination.sort = sortObj;
    }

    next();
};

/**
 * Helper to send paginated response
 */
const sendPaginatedResponse = (res, result, statusCode = 200) => {
    res.status(statusCode).json({
        success: result.success,
        data: result.data,
        pagination: result.pagination
    });
};

module.exports = {
    paginate,
    paginateWithSearch,
    paginateCursor,
    paginationMiddleware,
    sendPaginatedResponse
};
