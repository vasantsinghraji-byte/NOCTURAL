# Frontend Pagination Integration Guide

## Overview

This guide shows how to integrate pagination into existing Nocturnal frontend pages using the new pagination utilities and components.

## Files Created

1. **`public/js/pagination.js`** - Core pagination utilities and managers
2. **`public/css/pagination.css`** - Pagination styles and components

## Quick Start

### 1. Include Required Files

Add these to your HTML `<head>`:

```html
<!-- Pagination Styles -->
<link rel="stylesheet" href="css/pagination.css">

<!-- Pagination JavaScript (before your page scripts) -->
<script src="js/pagination.js"></script>
```

### 2. Add Pagination Containers

Add these containers to your HTML where you want pagination:

```html
<!-- Items per page selector (optional) -->
<div id="limit-selector"></div>

<!-- Data container -->
<div id="data-container"></div>

<!-- Pagination controls -->
<div id="pagination-controls"></div>
```

### 3. Initialize Pagination

In your JavaScript:

```javascript
// Using PaginationManager (recommended)
const manager = new PaginationUtils.PaginationManager({
  endpoint: '/api/duties',
  container: '#data-container',
  paginationContainer: '#pagination-controls',
  limitContainer: '#limit-selector',
  renderItem: (duty) => createDutyCard(duty), // Your render function
  filters: {
    status: 'OPEN',
    specialty: 'Cardiology'
  },
  sort: '-date',
  limit: 20
});

// Load first page
manager.loadPage(1);
```

---

## Integration Examples

### Example 1: Browse Duties Page

**Before (No Pagination):**

```javascript
async function fetchDuties() {
  const response = await fetch(`${API_URL}/duties`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await response.json();
  displayDuties(data);
}

function displayDuties(duties) {
  const grid = document.getElementById('dutiesGrid');
  grid.innerHTML = duties.map(duty => createDutyCard(duty)).join('');
}
```

**After (With Pagination):**

```html
<!-- Add pagination containers -->
<div class="results-section">
  <div class="results-header">
    <h2>Available Duties</h2>
    <div id="limit-selector"></div>
  </div>

  <div class="duties-grid" id="dutiesGrid"></div>

  <div id="pagination-controls"></div>
</div>
```

```javascript
// Initialize pagination manager
let dutiesManager;

async function initDutiesPage() {
  dutiesManager = new PaginationUtils.PaginationManager({
    endpoint: '/api/duties',
    container: '#dutiesGrid',
    paginationContainer: '#pagination-controls',
    limitContainer: '#limit-selector',
    renderItem: createDutyCard,
    filters: {
      status: 'OPEN'
    },
    sort: '-date',
    limit: 20
  });

  // Load first page
  await dutiesManager.loadPage(1);
}

// Apply filters
function applyFilters() {
  const filters = {
    status: 'OPEN',
    specialty: document.getElementById('specialtyFilter').value,
    shiftType: document.getElementById('shiftFilter').value,
    date: document.getElementById('dateFilter').value,
    location: document.getElementById('locationFilter').value
  };

  // Remove empty filters
  Object.keys(filters).forEach(key => {
    if (!filters[key]) delete filters[key];
  });

  dutiesManager.updateFilters(filters);
}

// Search
function searchDuties() {
  const search = document.getElementById('searchInput').value;
  dutiesManager.updateFilters({ search });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initDutiesPage);
```

---

### Example 2: My Applications Page

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Applications - Nocturnal</title>
  <link rel="stylesheet" href="css/pagination.css">
  <script src="js/pagination.js"></script>
</head>
<body>
  <div class="container">
    <div class="page-header">
      <h1>My Applications</h1>
      <div id="limit-selector"></div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <select id="statusFilter" onchange="filterApplications()">
        <option value="">All Status</option>
        <option value="PENDING">Pending</option>
        <option value="ACCEPTED">Accepted</option>
        <option value="REJECTED">Rejected</option>
      </select>
    </div>

    <!-- Applications List -->
    <div id="applications-list"></div>

    <!-- Pagination -->
    <div id="pagination-controls"></div>
  </div>

  <script>
    let applicationsManager;

    function createApplicationCard(application) {
      return `
        <div class="application-card">
          <div class="application-header">
            <h3>${application.duty?.title || 'Duty'}</h3>
            <span class="status-badge status-${application.status.toLowerCase()}">
              ${application.status}
            </span>
          </div>
          <div class="application-details">
            <p><strong>Hospital:</strong> ${application.duty?.hospital || 'N/A'}</p>
            <p><strong>Date:</strong> ${new Date(application.duty?.date).toLocaleDateString()}</p>
            <p><strong>Applied:</strong> ${new Date(application.appliedAt).toLocaleDateString()}</p>
          </div>
        </div>
      `;
    }

    function initApplicationsPage() {
      applicationsManager = new PaginationUtils.PaginationManager({
        endpoint: '/api/applications',
        container: '#applications-list',
        paginationContainer: '#pagination-controls',
        limitContainer: '#limit-selector',
        renderItem: createApplicationCard,
        sort: '-appliedAt',
        limit: 20
      });

      applicationsManager.loadPage(1);
    }

    function filterApplications() {
      const status = document.getElementById('statusFilter').value;
      const filters = status ? { status } : {};
      applicationsManager.updateFilters(filters);
    }

    document.addEventListener('DOMContentLoaded', initApplicationsPage);
  </script>
</body>
</html>
```

---

### Example 3: Earnings Page with Date Filters

```javascript
let earningsManager;

function createEarningRow(earning) {
  return `
    <tr class="earning-row">
      <td>${new Date(earning.shiftDate).toLocaleDateString()}</td>
      <td>${earning.duty?.title || 'N/A'}</td>
      <td>${earning.hoursWorked}h</td>
      <td>₹${earning.hourlyRate}</td>
      <td>₹${earning.totalAmount}</td>
      <td>
        <span class="status-badge status-${earning.paymentStatus.toLowerCase()}">
          ${earning.paymentStatus}
        </span>
      </td>
    </tr>
  `;
}

function initEarningsPage() {
  earningsManager = new PaginationUtils.PaginationManager({
    endpoint: '/api/earnings',
    container: '#earnings-table tbody',
    paginationContainer: '#pagination-controls',
    limitContainer: '#limit-selector',
    renderItem: createEarningRow,
    sort: '-shiftDate',
    limit: 50,
    filters: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1
    }
  });

  earningsManager.loadPage(1);
}

function filterEarnings() {
  const year = document.getElementById('yearFilter').value;
  const month = document.getElementById('monthFilter').value;
  const status = document.getElementById('statusFilter').value;

  const filters = {};
  if (year) filters.year = year;
  if (month) filters.month = month;
  if (status) filters.status = status;

  earningsManager.updateFilters(filters);
}

document.addEventListener('DOMContentLoaded', initEarningsPage);
```

---

### Example 4: Achievements with Leaderboard

```javascript
let achievementsManager;
let leaderboardManager;

function createAchievementCard(achievement) {
  return `
    <div class="achievement-card ${achievement.rewardClaimed ? 'claimed' : ''}">
      <div class="achievement-icon">${achievement.icon}</div>
      <h3>${achievement.title}</h3>
      <p>${achievement.description}</p>
      <div class="achievement-meta">
        <span>Earned: ${new Date(achievement.earnedAt).toLocaleDateString()}</span>
        ${!achievement.rewardClaimed ?
          `<button onclick="claimReward('${achievement._id}')">Claim Reward</button>` :
          '<span class="claimed-badge">Claimed</span>'
        }
      </div>
    </div>
  `;
}

function createLeaderboardRow(entry, index) {
  return `
    <tr>
      <td>${entry.rank}</td>
      <td>${entry.user.name}</td>
      <td>${entry.shifts}</td>
      <td>₹${entry.earnings.toLocaleString()}</td>
      <td>⭐ ${entry.rating.toFixed(1)}</td>
      <td>${entry.badges}</td>
    </tr>
  `;
}

function initAchievementsPage() {
  // User's achievements
  achievementsManager = new PaginationUtils.PaginationManager({
    endpoint: '/api/achievements',
    container: '#achievements-grid',
    paginationContainer: '#achievements-pagination',
    renderItem: createAchievementCard,
    sort: '-earnedAt',
    limit: 12
  });

  // Leaderboard
  leaderboardManager = new PaginationUtils.PaginationManager({
    endpoint: '/api/achievements/leaderboard',
    container: '#leaderboard-table tbody',
    paginationContainer: '#leaderboard-pagination',
    renderItem: createLeaderboardRow,
    filters: { category: 'shifts', period: 'month' },
    limit: 50
  });

  achievementsManager.loadPage(1);
  leaderboardManager.loadPage(1);
}

function changeLeaderboardCategory(category) {
  leaderboardManager.updateFilters({ category, period: 'month' });
}

document.addEventListener('DOMContentLoaded', initAchievementsPage);
```

---

## Manual Implementation (Without Manager Class)

If you prefer manual control:

### HTML

```html
<div id="results-container"></div>
<div id="pagination-controls"></div>
```

### JavaScript

```javascript
let currentPage = 1;
let currentLimit = 20;
let paginationData = null;

async function loadData(page = 1) {
  try {
    const result = await PaginationUtils.fetchPaginated('/api/duties', {
      page,
      limit: currentLimit,
      sort: '-date',
      filters: { status: 'OPEN' }
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    currentPage = page;
    paginationData = result.pagination;

    // Render data
    renderData(result.data);

    // Render pagination
    PaginationUtils.renderPaginationControls(
      '#pagination-controls',
      result.pagination,
      loadData
    );
  } catch (error) {
    console.error('Error:', error);
    showError(error.message);
  }
}

function renderData(data) {
  const container = document.getElementById('results-container');
  container.innerHTML = data.map(item => createCard(item)).join('');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadData(1);
});
```

---

## Infinite Scroll Implementation

For chat messages or activity feeds:

```html
<div id="messages-container"></div>
```

```javascript
let messagesScroll;

function createMessageBubble(message) {
  return `
    <div class="message scroll-item" data-id="${message._id}">
      <div class="message-sender">${message.sender.name}</div>
      <div class="message-content">${message.content}</div>
      <div class="message-time">${new Date(message.createdAt).toLocaleTimeString()}</div>
    </div>
  `;
}

function initMessagesPage(conversationId) {
  messagesScroll = new PaginationUtils.InfiniteScrollManager({
    endpoint: `/api/messages/conversation/${conversationId}`,
    container: '#messages-container',
    renderItem: createMessageBubble,
    threshold: 200
  });

  messagesScroll.loadInitial();
}

document.addEventListener('DOMContentLoaded', () => {
  const conversationId = getConversationIdFromURL();
  initMessagesPage(conversationId);
});
```

---

## Styling Customization

### Custom Colors

```css
/* Override in your page styles */
.pagination-btn {
  border-color: #your-color;
}

.pagination-btn.active {
  background: #your-color;
}
```

### Compact Variant

```html
<div class="pagination-container compact" id="pagination-controls"></div>
```

### Pills Variant

```html
<div class="pagination-container pills" id="pagination-controls"></div>
```

### Minimal Variant

```html
<div class="pagination-container minimal" id="pagination-controls"></div>
```

---

## Common Patterns

### Pattern 1: Filter + Sort + Pagination

```javascript
const manager = new PaginationUtils.PaginationManager({
  endpoint: '/api/duties',
  container: '#data',
  paginationContainer: '#pagination',
  renderItem: createCard,
  filters: {},
  sort: null,
  limit: 20
});

// Update filters
function onFilterChange() {
  manager.updateFilters({
    specialty: $('#specialtyFilter').val(),
    status: $('#statusFilter').val()
  });
}

// Update sort
function onSortChange() {
  manager.updateSort($('#sortSelect').val());
}

// Update limit
function onLimitChange() {
  manager.changeLimit(parseInt($('#limitSelect').val()));
}
```

### Pattern 2: URL State Persistence

```javascript
// Save pagination state to URL
function updateURL() {
  const params = new URLSearchParams({
    page: manager.state.page,
    limit: manager.state.limit,
    sort: manager.sort || '',
    ...manager.filters
  });
  history.pushState(null, '', `?${params}`);
}

// Load from URL on page load
function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  manager.state.page = parseInt(params.get('page')) || 1;
  manager.state.limit = parseInt(params.get('limit')) || 20;
  manager.sort = params.get('sort') || null;

  // Load filters
  params.forEach((value, key) => {
    if (!['page', 'limit', 'sort'].includes(key)) {
      manager.filters[key] = value;
    }
  });

  manager.loadPage(manager.state.page);
}

// Update URL after each page change
manager.onPageChange = (page) => {
  manager.loadPage(page);
  updateURL();
};
```

### Pattern 3: Search with Debounce

```javascript
let searchTimeout;

function setupSearch() {
  const searchInput = document.getElementById('searchInput');

  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      manager.updateFilters({ search: e.target.value });
    }, 500); // Wait 500ms after user stops typing
  });
}
```

---

## API Response Format

All paginated endpoints return:

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 150,
    "count": 20,
    "page": 2,
    "limit": 20,
    "pages": 8,
    "hasNext": true,
    "hasPrev": true,
    "nextPage": 3,
    "prevPage": 1
  }
}
```

---

## Troubleshooting

### Issue: Pagination not showing

**Solution:** Check that your container IDs match and pagination data exists:

```javascript
console.log('Pagination data:', manager.state.pagination);
```

### Issue: Filters not working

**Solution:** Verify filter parameter names match backend expectations:

```javascript
// Check what filters are being sent
console.log('Filters:', manager.filters);
```

### Issue: Duplicate items on page change

**Solution:** Ensure container is cleared before rendering:

```javascript
container.innerHTML = ''; // Clear before rendering
```

---

## Migration Checklist

- [ ] Include `pagination.js` and `pagination.css` in HTML
- [ ] Add pagination containers to HTML
- [ ] Replace fetch calls with `fetchPaginated()`
- [ ] Initialize `PaginationManager`
- [ ] Update filter functions to use `updateFilters()`
- [ ] Test page navigation
- [ ] Test filtering and sorting
- [ ] Test on mobile devices
- [ ] Update URL state if needed

---

## Performance Tips

1. **Use field selection:** Reduce payload by selecting only needed fields

```javascript
manager.select = 'title,date,hospital,hourlyRate';
```

2. **Optimize render functions:** Use template strings instead of DOM manipulation

3. **Implement virtual scrolling:** For very large lists

4. **Cache pages:** Store previously loaded pages in memory

5. **Lazy load images:** Use `loading="lazy"` on images in cards

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## Additional Resources

- [Backend Pagination Guide](../PAGINATION_GUIDE.md)
- [API Documentation](../API_DOCUMENTATION.md)
- [Example Implementation](browse-duties-paginated-example.html)

---

**Last Updated:** November 2024

