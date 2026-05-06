const express = require('express');
const router = express.Router();
const { getRateLimitMetrics } = require('../../config/rateLimit');
const { protect, authorize } = require('../../middleware/auth');

// Maintain a history of block rates and detailed analytics
const blockRateHistory = [];
const analyticsStore = {
    requests: [],
    blockEvents: [],
    endpointStats: new Map(),
    anomalies: []
};
const MAX_HISTORY_POINTS = 30;

// Helper function to detect anomalies using Z-score
function detectAnomalies(data, sensitivity = 2) {
    if (data.length < 2) return [];
    const mean = data.reduce((a, b) => a + b) / data.length;
    const stdDev = Math.sqrt(
        data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / (data.length - 1)
    );
    return data.map((value, index) => {
        const zScore = Math.abs((value - mean) / stdDev);
        return zScore > sensitivity ? index : -1;
    }).filter(index => index !== -1);
}

// Record a request event
function recordRequest(req, blocked = false) {
    const timestamp = Date.now();
    const ip = req.ip || req.connection.remoteAddress;
    const endpoint = req.originalUrl;
    
    // Store request data
    analyticsStore.requests.push({
        timestamp,
        ip,
        endpoint,
        method: req.method,
        blocked,
        responseTime: req.responseTime,
    });

    // Update endpoint stats
    if (!analyticsStore.endpointStats.has(endpoint)) {
        analyticsStore.endpointStats.set(endpoint, {
            total: 0,
            blocked: 0,
            responseTimes: []
        });
    }
    const stats = analyticsStore.endpointStats.get(endpoint);
    stats.total++;
    if (blocked) stats.blocked++;
    if (req.responseTime) stats.responseTimes.push(req.responseTime);

    // Cleanup old data (keep last 30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    analyticsStore.requests = analyticsStore.requests.filter(r => r.timestamp > thirtyDaysAgo);
}

// Update block rate history every minute
let blockRateInterval = setInterval(() => {
    const metrics = getRateLimitMetrics();
    const currentTime = new Date();
    
    blockRateHistory.push({
        time: currentTime.toISOString(),
        rate: metrics.metrics.auth.blocked / (metrics.metrics.auth.total || 1),
        timestamp: currentTime.getTime()
    });

    // Keep only last 30 points
    if (blockRateHistory.length > MAX_HISTORY_POINTS) {
        blockRateHistory.shift();
    }

    // Detect and record anomalies
    const recentRates = blockRateHistory.map(h => h.rate);
    const anomalyIndices = detectAnomalies(recentRates);
    
    anomalyIndices.forEach(index => {
        analyticsStore.anomalies.push({
            timestamp: blockRateHistory[index].timestamp,
            type: 'Unusual Block Rate',
            value: recentRates[index],
            severity: recentRates[index] > 0.5 ? 'High' : 'Medium'
        });
    });
}, 60000);

if (typeof blockRateInterval.unref === 'function') {
    blockRateInterval.unref();
}

function cleanup() {
    if (blockRateInterval) {
        clearInterval(blockRateInterval);
        blockRateInterval = null;
    }
}

// Get rate limit metrics - protected admin route
router.get('/rate-limits', protect, authorize('admin'), async (req, res) => {
    try {
        const metrics = getRateLimitMetrics();
        
        // Calculate block rates
        const authTotal = metrics.metrics.auth.total || 1;
        const apiTotal = metrics.metrics.api.total || 1;
        
        // Enhanced metrics with calculated values
        const enhancedMetrics = {
            auth: {
                ...metrics.metrics.auth,
                blockRate: metrics.metrics.auth.blocked / authTotal
            },
            api: {
                ...metrics.metrics.api,
                blockRate: metrics.metrics.api.blocked / apiTotal,
                // Convert endpoints Map to array with additional stats
                endpoints: Array.from(metrics.metrics.api.endpoints.entries())
                    .map(([path, hits]) => ({
                        path,
                        hits,
                        blockRate: metrics.metrics.api.blocked / apiTotal,
                        status: hits > 100 ? 'high' : hits > 50 ? 'medium' : 'normal'
                    }))
            },
            upload: {
                ...metrics.metrics.upload,
                blockRate: metrics.metrics.upload.blocked / (metrics.metrics.upload.total || 1)
            },
            blockRateHistory
        };

        res.json({
            success: true,
            metrics: enhancedMetrics,
            blocked: metrics.blocked,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching rate limit metrics',
            error: error.message
        });
    }
});

// Serve dashboard pages - protected admin routes
router.get('/dashboard/rate-limits', protect, authorize('admin'), (req, res) => {
    res.sendFile('rate-limits.html', { root: './views/dashboard' });
});

module.exports = {
    router,
    recordRequest,
    cleanup
};
