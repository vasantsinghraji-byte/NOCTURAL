# Quick Reference: Environment & Pagination

## Environment Switching

```bash
# Development (default)
npm run dev

# Staging
NODE_ENV=staging npm start

# Production
NODE_ENV=production npm start

# Test
NODE_ENV=test npm test
```

## Pagination - Quick Setup

### 1. Import
```javascript
const { paginationMiddleware, paginate } = require('../utils/pagination');
```

### 2. Apply Middleware
```javascript
router.use(paginationMiddleware);
```

### 3. Use in Route
```javascript
router.get('/', async (req, res) => {
    const result = await paginate(Model, {}, req.pagination);
    res.json(result);
});
```

## API Usage

### Basic Pagination
```
GET /api/duties?page=1&limit=20
```

### With Sorting
```
GET /api/duties?sort=-date,title
```

### With Filters
```
GET /api/duties?status=OPEN&page=2
```

### With Search
```
GET /api/duties?search=emergency&page=1
```

## Response Format
```json
{
    "success": true,
    "data": [...],
    "pagination": {
        "total": 150,
        "page": 2,
        "limit": 20,
        "pages": 8,
        "hasNext": true,
        "hasPrev": true
    }
}
```

## Environment Config Access
```javascript
const config = require('./config/environments');

config.database.uri
config.jwt.secret
config.pagination.defaultLimit
config.isDevelopment()
config.isProduction()
```

## Files Created
- `config/environments.js` - Environment system
- `utils/pagination.js` - Pagination utilities
- `.env.staging` - Staging config
- `routes/duties-paginated-example.js` - Examples

## Full Documentation
See [ENVIRONMENT_AND_PAGINATION_GUIDE.md](ENVIRONMENT_AND_PAGINATION_GUIDE.md)
