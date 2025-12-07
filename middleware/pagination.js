/**
 * Pagination Middleware
 * Provides standardized pagination for list endpoints
 */

const logger = require('../utils/logger');

/**
 * Default pagination limits
 */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100; // Prevent excessive data retrieval

/**
 * Parse and validate pagination parameters
 */
const parsePaginationParams = (req) => {
  let page = parseInt(req.query.page) || DEFAULT_PAGE;
  let limit = parseInt(req.query.limit) || DEFAULT_LIMIT;

  // Validate page
  if (page < 1) {
    page = DEFAULT_PAGE;
  }

  // Validate and cap limit
  if (limit < 1) {
    limit = DEFAULT_LIMIT;
  }
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  }

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Add pagination metadata to response
 */
const buildPaginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);

  return {
    currentPage: page,
    pageSize: limit,
    totalItems: total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null
  };
};

/**
 * Pagination middleware
 * Attaches pagination helper to request object
 */
const paginationMiddleware = (req, res, next) => {
  const { page, limit, skip } = parsePaginationParams(req);

  // Attach pagination data to request
  req.pagination = {
    page,
    limit,
    skip,

    // Helper function to apply pagination to Mongoose query
    apply(query) {
      return query.skip(skip).limit(limit);
    },

    // Helper function to build paginated response
    buildResponse(items, total) {
      return {
        success: true,
        data: items,
        pagination: buildPaginationMeta(page, limit, total)
      };
    }
  };

  next();
};

/**
 * Mongoose query pagination helper
 * @param {Query} query - Mongoose query object
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 */
const paginateQuery = async (query, page = DEFAULT_PAGE, limit = DEFAULT_LIMIT) => {
  // Validate inputs
  page = Math.max(1, parseInt(page));
  limit = Math.min(Math.max(1, parseInt(limit)), MAX_LIMIT);

  const skip = (page - 1) * limit;

  // Execute query with pagination and count in parallel
  const [items, total] = await Promise.all([
    query.skip(skip).limit(limit).lean().exec(),
    query.model.countDocuments(query.getFilter())
  ]);

  return {
    items,
    pagination: buildPaginationMeta(page, limit, total)
  };
};

/**
 * Cursor-based pagination (for real-time data)
 * More efficient for large datasets and real-time updates
 */
const cursorPaginationMiddleware = (req, res, next) => {
  const limit = Math.min(parseInt(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const cursor = req.query.cursor; // ID of last item from previous page

  req.cursorPagination = {
    limit,
    cursor,

    // Helper function to apply cursor pagination
    apply(query, sortField = '_id') {
      let paginatedQuery = query.limit(limit + 1); // Fetch one extra to determine if there's a next page

      if (cursor) {
        // For descending sort (newest first)
        if (req.query.sort === 'desc') {
          paginatedQuery = paginatedQuery.where(sortField).lt(cursor);
        } else {
          // For ascending sort
          paginatedQuery = paginatedQuery.where(sortField).gt(cursor);
        }
      }

      return paginatedQuery;
    },

    // Helper function to build cursor-based response
    buildResponse(items, sortField = '_id') {
      const hasMore = items.length > limit;
      const results = hasMore ? items.slice(0, limit) : items;

      return {
        success: true,
        data: results,
        pagination: {
          pageSize: limit,
          hasMore,
          nextCursor: hasMore ? results[results.length - 1][sortField] : null,
          count: results.length
        }
      };
    }
  };

  next();
};

/**
 * Aggregation pipeline pagination helper
 */
const paginateAggregation = async (model, pipeline, page = DEFAULT_PAGE, limit = DEFAULT_LIMIT) => {
  page = Math.max(1, parseInt(page));
  limit = Math.min(Math.max(1, parseInt(limit)), MAX_LIMIT);

  const skip = (page - 1) * limit;

  // Add pagination stages to pipeline
  const paginatedPipeline = [
    ...pipeline,
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: limit }]
      }
    }
  ];

  const result = await model.aggregate(paginatedPipeline);

  const total = result[0].metadata[0]?.total || 0;
  const items = result[0].data || [];

  return {
    items,
    pagination: buildPaginationMeta(page, limit, total)
  };
};

/**
 * Link header builder for REST API best practices
 */
const buildLinkHeader = (req, page, totalPages) => {
  const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
  const queryWithoutPage = { ...req.query };
  delete queryWithoutPage.page;

  const buildLink = (pageNum, rel) => {
    const params = new URLSearchParams({ ...queryWithoutPage, page: pageNum });
    return `<${baseUrl}?${params}>; rel="${rel}"`;
  };

  const links = [];

  // First page
  if (page > 1) {
    links.push(buildLink(1, 'first'));
  }

  // Previous page
  if (page > 1) {
    links.push(buildLink(page - 1, 'prev'));
  }

  // Next page
  if (page < totalPages) {
    links.push(buildLink(page + 1, 'next'));
  }

  // Last page
  if (page < totalPages) {
    links.push(buildLink(totalPages, 'last'));
  }

  return links.join(', ');
};

/**
 * Enhanced pagination middleware with Link headers
 */
const paginationWithLinksMiddleware = (req, res, next) => {
  paginationMiddleware(req, res, next);

  // Override buildResponse to include Link headers
  const originalBuildResponse = req.pagination.buildResponse;

  req.pagination.buildResponse = function(items, total) {
    const response = originalBuildResponse(items, total);

    // Add Link header for API best practices
    const linkHeader = buildLinkHeader(req, response.pagination.currentPage, response.pagination.totalPages);
    if (linkHeader) {
      res.setHeader('Link', linkHeader);
    }

    // Add total count header
    res.setHeader('X-Total-Count', total);

    return response;
  };
};

module.exports = {
  paginationMiddleware,
  cursorPaginationMiddleware,
  paginationWithLinksMiddleware,
  paginateQuery,
  paginateAggregation,
  parsePaginationParams,
  buildPaginationMeta,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
