# Pagination Guide - Nocturnal Healthcare Platform

## Overview

All list endpoints in the Nocturnal platform now support pagination to improve performance and user experience. This guide explains how to use pagination features across the API.

## Table of Contents

- [Quick Start](#quick-start)
- [Pagination Types](#pagination-types)
- [Query Parameters](#query-parameters)
- [Response Format](#response-format)
- [Implementation Examples](#implementation-examples)
- [Endpoints with Pagination](#endpoints-with-pagination)
- [Frontend Integration](#frontend-integration)
- [Best Practices](#best-practices)

---

## Quick Start

### Basic Pagination Request

```bash
GET /api/achievements?page=2&limit=20
```

### With Sorting

```bash
GET /api/earnings?page=1&limit=50&sort=-shiftDate
```

### With Filters and Search

```bash
GET /api/duties?status=OPEN&specialty=Emergency Medicine&search=night shift&page=1&limit=20
```

---

## Pagination Types

### 1. Offset Pagination (Default)

Used for most list endpoints. Uses page number and limit.

**When to use:** Standard lists, tables, search results

**Example:**
```bash
GET /api/certifications?page=2&limit=10
```

**Response includes:**
- `page`: Current page number
- `limit`: Items per page
- `total`: Total items
- `pages`: Total pages
- `hasNext`: Boolean if next page exists
- `hasPrev`: Boolean if previous page exists

### 2. Cursor Pagination

Used for real-time data like messages and notifications.

**When to use:** Infinite scroll, chat messages, real-time feeds

**Example:**
```bash
GET /api/messages/conversation/:id?limit=50&before=2024-01-15T10:30:00Z
```

**Response includes:**
- `hasMore`: Boolean if more data exists
- `nextCursor`: Cursor for next page

---

## Query Parameters

### Standard Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | Integer | 1 | - | Page number (1-indexed) |
| `limit` | Integer | 20 | 100 | Items per page |
| `sort` | String | varies | - | Sort order (see below) |
| `select` | String | all | - | Fields to return |

### Sorting

**Single field:**
```bash
sort=createdAt        # Ascending
sort=-createdAt       # Descending (prefix with -)
```

**Multiple fields:**
```bash
sort=-priority,createdAt
```

**Field Selection:**
```bash
select=title,date,hospital,hourlyRate
```

### Search and Filters

Endpoint-specific filters can be combined with pagination:

```bash
# Achievements with filters
GET /api/achievements?page=1&limit=20&visible=true

# Earnings with date range
GET /api/earnings?year=2024&month=11&status=PAID&page=1&limit=50

# Duties with search
GET /api/duties?status=OPEN&specialty=Cardiology&search=urgent&page=1
```

---

## Response Format

### Standard Paginated Response

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

### Cursor-based Response

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "hasMore": true,
    "nextCursor": "6543210abcdef123456789",
    "count": 50
  }
}
```

---

## Implementation Examples

### Backend - Adding Pagination to Routes

#### Using Middleware

```javascript
const { paginate, paginationMiddleware, sendPaginatedResponse } = require('../utils/pagination');

// Apply middleware
router.use(paginationMiddleware);

// Use in route
router.get('/', protect, async (req, res) => {
  try {
    const result = await paginate(
      Model,
      { status: 'ACTIVE' },
      {
        ...req.pagination,
        sort: req.pagination.sort || { createdAt: -1 },
        populate: 'user:name email'
      }
    );

    sendPaginatedResponse(res, result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

#### With Search

```javascript
const { paginateWithSearch } = require('../utils/pagination');

router.get('/', paginationMiddleware, protect, async (req, res) => {
  try {
    const result = await paginateWithSearch(
      Model,
      {
        filters: { status: req.query.status },
        search: req.query.search || '',
        searchFields: ['title', 'description', 'location']
      },
      req.pagination
    );

    sendPaginatedResponse(res, result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

#### Cursor Pagination for Chat

```javascript
const { paginateCursor } = require('../utils/pagination');

router.get('/messages/:conversationId', protect, async (req, res) => {
  try {
    const query = { conversation: req.params.conversationId };

    if (req.query.before) {
      query.createdAt = { $lt: new Date(req.query.before) };
    }

    const result = await paginateCursor(
      Message,
      query,
      {
        limit: parseInt(req.query.limit) || 50,
        sort: { createdAt: -1 },
        cursorField: '_id'
      }
    );

    res.json({
      success: true,
      data: result.data.reverse(),
      pagination: result.pagination
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## Endpoints with Pagination

### Achievements
```bash
GET /api/achievements?page=1&limit=20&sort=-earnedAt
GET /api/achievements/leaderboard?page=1&limit=50&category=earnings
```

### Applications
```bash
GET /api/applications?page=1&limit=20&sort=-appliedAt
GET /api/applications/duty/:dutyId?page=1&limit=20
```

### Bookings (B2C)
```bash
GET /api/bookings?page=1&limit=20&status=CONFIRMED
GET /api/bookings/provider/:providerId?page=1&limit=20
```

### Certifications
```bash
GET /api/certifications?page=1&limit=20&sort=expiryDate
GET /api/certifications/expiring?daysAhead=30&page=1
```

### Duties
```bash
GET /api/duties?page=1&limit=20&status=OPEN&specialty=Cardiology
GET /api/duties/available?page=1&limit=20&location=Mumbai
GET /api/duties/my-duties?page=1&limit=20
```

### Earnings
```bash
GET /api/earnings?page=1&limit=50&year=2024&month=11
GET /api/earnings?status=PENDING&page=1&limit=20
```

### Messaging
```bash
GET /api/messages/conversations?page=1&limit=20
GET /api/messages/conversation/:id?limit=50&before=2024-01-15T10:00:00Z
```

### Notifications
```bash
GET /api/notifications?page=1&limit=20&unreadOnly=true
```

### Payments
```bash
GET /api/payments?page=1&limit=20&status=SUCCESS
```

### Reviews
```bash
GET /api/reviews/user/:userId?page=1&limit=20
GET /api/reviews/my-reviews?page=1&limit=20
```

### Shift Series
```bash
GET /api/shift-series?page=1&limit=20&specialty=Emergency Medicine
GET /api/shift-series/my/posted?page=1&limit=20
```

---

## Frontend Integration

### React Example - Standard Pagination

```javascript
import { useState, useEffect } from 'react';

function AchievementsList() {
  const [achievements, setAchievements] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  });
  const [loading, setLoading] = useState(false);

  const fetchAchievements = async (page = 1) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/achievements?page=${page}&limit=${pagination.limit}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const data = await response.json();

      setAchievements(data.data);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAchievements(pagination.page);
  }, []);

  return (
    <div>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <>
          <div className="achievements-grid">
            {achievements.map(achievement => (
              <AchievementCard key={achievement._id} {...achievement} />
            ))}
          </div>

          <Pagination
            current={pagination.page}
            total={pagination.pages}
            onChange={(page) => fetchAchievements(page)}
            hasNext={pagination.hasNext}
            hasPrev={pagination.hasPrev}
          />
        </>
      )}
    </div>
  );
}
```

### React Example - Infinite Scroll

```javascript
import { useState, useEffect, useRef } from 'react';

function MessageList({ conversationId }) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const observerRef = useRef();

  const fetchMessages = async (cursor = null) => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const url = cursor
        ? `/api/messages/conversation/${conversationId}?limit=50&before=${cursor}`
        : `/api/messages/conversation/${conversationId}?limit=50`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      setMessages(prev => [...prev, ...data.data]);
      setHasMore(data.pagination.hasMore);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [conversationId]);

  // Intersection Observer for infinite scroll
  const lastMessageRef = useRef();
  useEffect(() => {
    if (loading) return;

    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        const lastMessage = messages[messages.length - 1];
        fetchMessages(lastMessage?.createdAt);
      }
    });

    if (lastMessageRef.current) {
      observer.observe(lastMessageRef.current);
    }

    return () => observer.disconnect();
  }, [loading, hasMore, messages]);

  return (
    <div className="messages-container">
      {messages.map((message, index) => (
        <div
          key={message._id}
          ref={index === messages.length - 1 ? lastMessageRef : null}
        >
          <MessageBubble {...message} />
        </div>
      ))}
      {loading && <div>Loading more...</div>}
    </div>
  );
}
```

### Vanilla JavaScript Example

```javascript
async function loadDuties(page = 1) {
  const params = new URLSearchParams({
    page: page,
    limit: 20,
    status: 'OPEN',
    sort: '-date'
  });

  try {
    const response = await fetch(`/api/duties?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    const { data, pagination } = await response.json();

    // Render duties
    renderDuties(data);

    // Render pagination controls
    renderPaginationControls(pagination);
  } catch (error) {
    console.error('Error loading duties:', error);
  }
}

function renderPaginationControls(pagination) {
  const container = document.getElementById('pagination');

  container.innerHTML = `
    <button
      ${!pagination.hasPrev ? 'disabled' : ''}
      onclick="loadDuties(${pagination.prevPage})"
    >
      Previous
    </button>

    <span>Page ${pagination.page} of ${pagination.pages}</span>

    <button
      ${!pagination.hasNext ? 'disabled' : ''}
      onclick="loadDuties(${pagination.nextPage})"
    >
      Next
    </button>
  `;
}
```

---

## Best Practices

### Performance

1. **Use appropriate page sizes:**
   - Lists/Tables: 20-50 items
   - Cards/Grid: 12-24 items
   - Infinite scroll: 20-30 items
   - Search results: 10-20 items

2. **Implement field selection:**
   ```bash
   GET /api/duties?select=title,date,hourlyRate&page=1&limit=20
   ```
   This reduces payload size significantly.

3. **Use cursor pagination for real-time data:**
   Better performance for chat, notifications, activity feeds.

4. **Index commonly sorted fields:**
   Ensure MongoDB indexes exist for fields used in `sort`.

### User Experience

1. **Show loading states:**
   ```javascript
   {loading ? <Spinner /> : <DataList items={data} />}
   ```

2. **Preserve page state:**
   ```javascript
   // Save to URL query params
   history.push(`/duties?page=${page}&limit=${limit}`);
   ```

3. **Show total counts:**
   ```javascript
   <p>Showing {pagination.count} of {pagination.total} results</p>
   ```

4. **Provide page size options:**
   ```javascript
   <select onChange={(e) => setLimit(e.target.value)}>
     <option value="20">20 per page</option>
     <option value="50">50 per page</option>
     <option value="100">100 per page</option>
   </select>
   ```

### API Usage

1. **Combine filters efficiently:**
   ```bash
   # Good
   GET /api/earnings?year=2024&month=11&status=PAID&page=1

   # Avoid multiple requests
   GET /api/earnings?year=2024
   GET /api/earnings?month=11
   ```

2. **Cache responses when appropriate:**
   ```javascript
   const cacheKey = `duties-page-${page}-limit-${limit}`;
   const cached = sessionStorage.getItem(cacheKey);
   if (cached) return JSON.parse(cached);
   ```

3. **Handle edge cases:**
   ```javascript
   if (pagination.page > pagination.pages) {
     // Redirect to last valid page
     fetchData(pagination.pages);
   }
   ```

### Security

1. **Enforce max limits:**
   Server automatically caps limit at 100 to prevent abuse.

2. **Validate page numbers:**
   ```javascript
   const page = Math.max(1, parseInt(req.query.page) || 1);
   ```

3. **Sanitize search inputs:**
   Use the existing `sanitizeInput` middleware for search queries.

---

## Troubleshooting

### Issue: Duplicate results across pages

**Cause:** Data changing between requests
**Solution:** Use cursor pagination for frequently updated data

### Issue: Slow pagination queries

**Cause:** Missing database indexes
**Solution:** Add indexes to MongoDB:
```javascript
dutySchema.index({ date: -1, status: 1 });
dutySchema.index({ specialty: 1, status: 1 });
```

### Issue: Page count incorrect

**Cause:** Concurrent updates to data
**Solution:** This is expected behavior. Refresh pagination info periodically.

---

## Testing Pagination

### Manual Testing

```bash
# Test first page
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/achievements?page=1&limit=5"

# Test last page
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/achievements?page=999&limit=5"

# Test with filters
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/duties?status=OPEN&page=1&limit=10&sort=-date"

# Test sorting
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/earnings?sort=-shiftDate,hourlyRate&page=1"
```

### Automated Tests

```javascript
describe('Pagination', () => {
  it('should return paginated results', async () => {
    const res = await request(app)
      .get('/api/achievements?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.pagination).toHaveProperty('page', 1);
    expect(res.body.pagination).toHaveProperty('limit', 10);
    expect(res.body.pagination).toHaveProperty('total');
  });

  it('should respect max limit', async () => {
    const res = await request(app)
      .get('/api/achievements?page=1&limit=500')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.pagination.limit).toBeLessThanOrEqual(100);
  });
});
```

---

## Migration from Old Endpoints

### Before (No Pagination)

```javascript
// Old code
router.get('/', async (req, res) => {
  const items = await Model.find({}).sort({ createdAt: -1 });
  res.json({ success: true, data: items });
});
```

### After (With Pagination)

```javascript
// New code
const { paginate, paginationMiddleware, sendPaginatedResponse } = require('../utils/pagination');

router.use(paginationMiddleware);

router.get('/', async (req, res) => {
  const result = await paginate(
    Model,
    {},
    {
      ...req.pagination,
      sort: req.pagination.sort || { createdAt: -1 }
    }
  );
  sendPaginatedResponse(res, result);
});
```

---

## Summary

- ✅ All major list endpoints now support pagination
- ✅ Default: 20 items per page, max 100
- ✅ Both offset and cursor pagination available
- ✅ Sorting, filtering, and field selection supported
- ✅ Consistent response format across all endpoints
- ✅ Frontend-friendly with hasNext/hasPrev flags
- ✅ Performance optimized with lean queries

For questions or issues, please refer to the main API documentation or contact the development team.

**Last Updated:** November 2024
