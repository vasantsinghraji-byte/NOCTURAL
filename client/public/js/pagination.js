/**
 * Pagination Utilities for Nocturnal Frontend
 *
 * Provides reusable pagination components and API utilities
 * for integrating with the backend pagination API
 */

// ============================================
// API Utility Functions
// ============================================

/**
 * Fetch paginated data from API endpoint
 * @param {string} endpoint - API endpoint (e.g., '/api/achievements')
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Items per page (default: 20)
 * @param {string} options.sort - Sort order (e.g., '-createdAt')
 * @param {Object} options.filters - Additional filters
 * @returns {Promise<Object>} - { data, pagination, success }
 */
async function fetchPaginated(endpoint, options = {}) {
  const {
    page = 1,
    limit = 20,
    sort = null,
    select = null,
    filters = {}
  } = options;

  // Build query params
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...filters
  });

  if (sort) params.append('sort', sort);
  if (select) params.append('select', select);

  const url = `${endpoint}?${params}`;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to fetch data');
    }

    return {
      data: result.data,
      pagination: result.pagination,
      success: true,
      summary: result.summary // For endpoints that include summary (like reviews)
    };
  } catch (error) {
    console.error('Pagination fetch error:', error);
    return {
      data: [],
      pagination: null,
      success: false,
      error: error.message
    };
  }
}

/**
 * Fetch with cursor-based pagination (for chat, infinite scroll)
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Options
 * @param {number} options.limit - Items per page
 * @param {string} options.before - Cursor for pagination
 * @returns {Promise<Object>}
 */
async function fetchCursorPaginated(endpoint, options = {}) {
  const { limit = 50, before = null } = options;

  const params = new URLSearchParams({ limit: limit.toString() });
  if (before) params.append('before', before);

  const url = `${endpoint}?${params}`;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to fetch data');
    }

    return {
      data: result.data,
      pagination: result.pagination,
      success: true
    };
  } catch (error) {
    console.error('Cursor pagination fetch error:', error);
    return {
      data: [],
      pagination: { hasMore: false },
      success: false,
      error: error.message
    };
  }
}

// ============================================
// UI Component Functions
// ============================================

/**
 * Create pagination controls HTML
 * @param {Object} pagination - Pagination metadata from API
 * @param {Function} onPageChange - Callback when page changes
 * @param {Object} options - Display options
 * @returns {string} - HTML string for pagination controls
 */
function createPaginationControls(pagination, onPageChange, options = {}) {
  if (!pagination || pagination.pages <= 1) return '';

  const {
    showPageNumbers = true,
    showPageInfo = true,
    maxPageButtons = 5,
    containerClass = 'pagination-container',
    buttonClass = 'pagination-btn',
    activeClass = 'active',
    disabledClass = 'disabled'
  } = options;

  const { page, pages, hasNext, hasPrev, nextPage, prevPage, total, count } = pagination;

  let html = `<div class="${containerClass}">`;

  // Page info
  if (showPageInfo) {
    const startItem = (page - 1) * pagination.limit + 1;
    const endItem = Math.min(startItem + count - 1, total);
    html += `
      <div class="pagination-info">
        Showing ${startItem}-${endItem} of ${total} results
      </div>
    `;
  }

  html += '<div class="pagination-controls">';

  // Previous button
  html += `
    <button
      class="${buttonClass} ${!hasPrev ? disabledClass : ''}"
      ${!hasPrev ? 'disabled' : ''}
      data-page="${prevPage}"
      onclick="(${onPageChange.toString()})(${prevPage})"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M10 12l-4-4 4-4"/>
      </svg>
      Previous
    </button>
  `;

  // Page numbers
  if (showPageNumbers) {
    const pageNumbers = getPageNumbers(page, pages, maxPageButtons);

    pageNumbers.forEach((pageNum, index) => {
      if (pageNum === '...') {
        html += `<span class="pagination-ellipsis">...</span>`;
      } else {
        html += `
          <button
            class="${buttonClass} ${pageNum === page ? activeClass : ''}"
            data-page="${pageNum}"
            onclick="(${onPageChange.toString()})(${pageNum})"
          >
            ${pageNum}
          </button>
        `;
      }
    });
  }

  // Next button
  html += `
    <button
      class="${buttonClass} ${!hasNext ? disabledClass : ''}"
      ${!hasNext ? 'disabled' : ''}
      data-page="${nextPage}"
      onclick="(${onPageChange.toString()})(${nextPage})"
    >
      Next
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6 4l4 4-4 4"/>
      </svg>
    </button>
  `;

  html += '</div></div>';

  return html;
}

/**
 * Get page numbers to display (with ellipsis for large ranges)
 * @param {number} currentPage - Current page
 * @param {number} totalPages - Total pages
 * @param {number} maxButtons - Max page buttons to show
 * @returns {Array} - Array of page numbers and '...'
 */
function getPageNumbers(currentPage, totalPages, maxButtons = 5) {
  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = [];
  const halfButtons = Math.floor(maxButtons / 2);

  // Always show first page
  pages.push(1);

  let startPage = Math.max(2, currentPage - halfButtons);
  let endPage = Math.min(totalPages - 1, currentPage + halfButtons);

  // Adjust if at start
  if (currentPage <= halfButtons + 1) {
    endPage = maxButtons - 1;
  }

  // Adjust if at end
  if (currentPage >= totalPages - halfButtons) {
    startPage = totalPages - maxButtons + 2;
  }

  // Add ellipsis after first page if needed
  if (startPage > 2) {
    pages.push('...');
  }

  // Add middle pages
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  // Add ellipsis before last page if needed
  if (endPage < totalPages - 1) {
    pages.push('...');
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}

/**
 * Render pagination controls into a container
 * @param {string|HTMLElement} container - Container selector or element
 * @param {Object} pagination - Pagination metadata
 * @param {Function} onPageChange - Callback when page changes
 * @param {Object} options - Display options
 */
function renderPaginationControls(container, pagination, onPageChange, options = {}) {
  const element = typeof container === 'string'
    ? document.querySelector(container)
    : container;

  if (!element) {
    console.error('Pagination container not found:', container);
    return;
  }

  const html = createPaginationControls(pagination, onPageChange, options);
  element.innerHTML = html;
}

/**
 * Create items per page selector
 * @param {number} currentLimit - Current limit
 * @param {Function} onChange - Callback when limit changes
 * @param {Array} options - Available limits (default: [10, 20, 50, 100])
 * @returns {string} - HTML string
 */
function createLimitSelector(currentLimit, onChange, options = [10, 20, 50, 100]) {
  return `
    <div class="limit-selector">
      <label for="items-per-page">Items per page:</label>
      <select
        id="items-per-page"
        class="limit-select"
        onchange="(${onChange.toString()})(parseInt(this.value))"
      >
        ${options.map(opt => `
          <option value="${opt}" ${opt === currentLimit ? 'selected' : ''}>
            ${opt}
          </option>
        `).join('')}
      </select>
    </div>
  `;
}

// ============================================
// Pagination Manager Class
// ============================================

/**
 * Class to manage pagination state and UI
 */
class PaginationManager {
  constructor(options = {}) {
    this.endpoint = options.endpoint;
    this.container = options.container;
    this.paginationContainer = options.paginationContainer;
    this.limitContainer = options.limitContainer;
    this.renderItem = options.renderItem || ((item) => JSON.stringify(item));
    this.onError = options.onError || console.error;
    this.filters = options.filters || {};
    this.sort = options.sort || null;
    this.select = options.select || null;

    this.state = {
      page: 1,
      limit: options.limit || 20,
      data: [],
      pagination: null,
      loading: false
    };
  }

  /**
   * Load data for current page
   */
  async loadPage(page = this.state.page) {
    this.state.loading = true;
    this.showLoading();

    try {
      const result = await fetchPaginated(this.endpoint, {
        page,
        limit: this.state.limit,
        sort: this.sort,
        select: this.select,
        filters: this.filters
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      this.state.page = page;
      this.state.data = result.data;
      this.state.pagination = result.pagination;
      this.state.summary = result.summary;

      this.render();
    } catch (error) {
      this.onError(error);
      this.showError(error.message);
    } finally {
      this.state.loading = false;
    }
  }

  /**
   * Change page
   */
  changePage(page) {
    if (page < 1 || (this.state.pagination && page > this.state.pagination.pages)) {
      return;
    }
    this.loadPage(page);
  }

  /**
   * Change items per page
   */
  changeLimit(limit) {
    this.state.limit = limit;
    this.loadPage(1); // Reset to first page
  }

  /**
   * Update filters and reload
   */
  updateFilters(filters) {
    this.filters = { ...this.filters, ...filters };
    this.loadPage(1);
  }

  /**
   * Update sort and reload
   */
  updateSort(sort) {
    this.sort = sort;
    this.loadPage(1);
  }

  /**
   * Render data and pagination controls
   */
  render() {
    // Render data items
    const container = typeof this.container === 'string'
      ? document.querySelector(this.container)
      : this.container;

    if (container) {
      if (this.state.data.length === 0) {
        container.innerHTML = '<div class="no-results">No results found</div>';
      } else {
        container.innerHTML = this.state.data.map(this.renderItem).join('');
      }
    }

    // Render pagination controls
    if (this.paginationContainer) {
      renderPaginationControls(
        this.paginationContainer,
        this.state.pagination,
        this.changePage.bind(this)
      );
    }

    // Render limit selector
    if (this.limitContainer) {
      const limitElement = typeof this.limitContainer === 'string'
        ? document.querySelector(this.limitContainer)
        : this.limitContainer;

      if (limitElement) {
        limitElement.innerHTML = createLimitSelector(
          this.state.limit,
          this.changeLimit.bind(this)
        );
      }
    }
  }

  /**
   * Show loading state
   */
  showLoading() {
    const container = typeof this.container === 'string'
      ? document.querySelector(this.container)
      : this.container;

    if (container) {
      container.innerHTML = `
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
      `;
    }
  }

  /**
   * Show error state
   */
  showError(message) {
    const container = typeof this.container === 'string'
      ? document.querySelector(this.container)
      : this.container;

    if (container) {
      container.innerHTML = `
        <div class="error-state">
          <p>Error: ${message}</p>
          <button onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }
}

// ============================================
// Infinite Scroll Manager
// ============================================

/**
 * Class to manage infinite scroll with cursor pagination
 */
class InfiniteScrollManager {
  constructor(options = {}) {
    this.endpoint = options.endpoint;
    this.container = options.container;
    this.renderItem = options.renderItem || ((item) => JSON.stringify(item));
    this.onError = options.onError || console.error;
    this.threshold = options.threshold || 200; // px from bottom to trigger load

    this.state = {
      data: [],
      loading: false,
      hasMore: true,
      nextCursor: null
    };

    this.setupScrollListener();
  }

  /**
   * Setup scroll listener
   */
  setupScrollListener() {
    const container = typeof this.container === 'string'
      ? document.querySelector(this.container)
      : this.container;

    if (!container) return;

    window.addEventListener('scroll', () => {
      if (this.state.loading || !this.state.hasMore) return;

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      if (documentHeight - (scrollTop + windowHeight) < this.threshold) {
        this.loadMore();
      }
    });
  }

  /**
   * Load initial data
   */
  async loadInitial() {
    this.state.data = [];
    this.state.nextCursor = null;
    await this.loadMore();
  }

  /**
   * Load more data
   */
  async loadMore() {
    if (this.state.loading || !this.state.hasMore) return;

    this.state.loading = true;
    this.showLoadingIndicator();

    try {
      const result = await fetchCursorPaginated(this.endpoint, {
        before: this.state.nextCursor
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      this.state.data.push(...result.data);
      this.state.hasMore = result.pagination.hasMore;
      this.state.nextCursor = result.pagination.nextCursor;

      this.render();
    } catch (error) {
      this.onError(error);
      this.showError(error.message);
    } finally {
      this.state.loading = false;
      this.hideLoadingIndicator();
    }
  }

  /**
   * Render data
   */
  render() {
    const container = typeof this.container === 'string'
      ? document.querySelector(this.container)
      : this.container;

    if (!container) return;

    // Don't replace existing content, append new items
    const existingItems = container.querySelectorAll('.scroll-item');
    if (existingItems.length === 0 && this.state.data.length > 0) {
      container.innerHTML = this.state.data.map(this.renderItem).join('');
    } else {
      const newItems = this.state.data.slice(existingItems.length);
      container.insertAdjacentHTML('beforeend', newItems.map(this.renderItem).join(''));
    }
  }

  /**
   * Show loading indicator
   */
  showLoadingIndicator() {
    const existing = document.getElementById('infinite-scroll-loader');
    if (existing) return;

    document.body.insertAdjacentHTML('beforeend', `
      <div id="infinite-scroll-loader" class="infinite-scroll-loader">
        <div class="spinner"></div>
        <p>Loading more...</p>
      </div>
    `);
  }

  /**
   * Hide loading indicator
   */
  hideLoadingIndicator() {
    const loader = document.getElementById('infinite-scroll-loader');
    if (loader) loader.remove();
  }

  /**
   * Show error
   */
  showError(message) {
    alert(`Error loading more items: ${message}`);
  }
}

// ============================================
// Export for use in other files
// ============================================

// Make available globally
if (typeof window !== 'undefined') {
  window.PaginationUtils = {
    fetchPaginated,
    fetchCursorPaginated,
    createPaginationControls,
    renderPaginationControls,
    createLimitSelector,
    PaginationManager,
    InfiniteScrollManager
  };
}
