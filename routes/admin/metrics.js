const express = require('express');
const router = express.Router();
const { getRateLimitMetrics } = require('../../config/rateLimit');
const { protect, authorize } = require('../../middleware/auth');
const geoip = require('geoip-lite');
const moment = require('moment');

// Maintain a history of block rates and detailed analytics
const blockRateHistory = [];
const analyticsStore = {
    requests: [],
    blockEvents: [],
    endpointStats: new Map(),
    anomalies: []
};
const MAX_HISTORY_POINTS = 30;

// Helper function to calculate percentiles
function percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * p;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
        return sorted[base];
    }
}

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
    const geo = geoip.lookup(ip) || {};
    const endpoint = req.originalUrl;
    
    // Store request data
    analyticsStore.requests.push({
        timestamp,
        ip,
        endpoint,
        method: req.method,
        blocked,
        country: geo.country,
        region: geo.region,
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
setInterval(() => {
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

// Get detailed analytics metrics
router.get('/rate-limits/detailed', protect, authorize('admin'), async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '24h';
        const rangeInHours = {
            '24h': 24,
            '7d': 168,
            '30d': 720
        }[timeRange] || 24;

        const cutoff = Date.now() - (rangeInHours * 60 * 60 * 1000);
        const recentRequests = analyticsStore.requests.filter(r => r.timestamp > cutoff);

        // Calculate basic metrics
        const totalRequests = recentRequests.length;
        const blockedRequests = recentRequests.filter(r => r.blocked).length;
        const uniqueIPs = new Set(recentRequests.map(r => r.ip)).size;
        const uniqueBlockedIPs = new Set(recentRequests.filter(r => r.blocked).map(r => r.ip)).size;

        // Calculate endpoint statistics
        const endpointStats = {};
        analyticsStore.endpointStats.forEach((stats, endpoint) => {
            const recentEndpointRequests = recentRequests.filter(r => r.endpoint === endpoint);
            endpointStats[endpoint] = {
                total: recentEndpointRequests.length,
                blocked: recentEndpointRequests.filter(r => r.blocked).length,
                avgResponseTime: stats.responseTimes.length ? 
                    stats.responseTimes.reduce((a, b) => a + b) / stats.responseTimes.length : 0,
                p95ResponseTime: percentile(stats.responseTimes, 0.95)
            };
        });

        // Calculate geographic distribution
        const geoDistribution = {};
        recentRequests.forEach(req => {
            if (req.country) {
                if (!geoDistribution[req.country]) {
                    geoDistribution[req.country] = { total: 0, blocked: 0 };
                }
                geoDistribution[req.country].total++;
                if (req.blocked) geoDistribution[req.country].blocked++;
            }
        });

        // Calculate hourly trends
        const hourlyData = Array(rangeInHours).fill().map(() => ({ total: 0, blocked: 0 }));
        recentRequests.forEach(req => {
            const hourIndex = Math.floor((Date.now() - req.timestamp) / (60 * 60 * 1000));
            if (hourIndex < rangeInHours) {
                hourlyData[hourIndex].total++;
                if (req.blocked) hourlyData[hourIndex].blocked++;
            }
        });

        // Get recent anomalies
        const recentAnomalies = analyticsStore.anomalies
            .filter(a => a.timestamp > cutoff)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 10);

        res.json({
            metrics: {
                totalRequests,
                blockedRequests,
                uniqueIPs,
                uniqueBlockedIPs,
                avgBlockRate: blockedRequests / totalRequests || 0,
            },
            trends: {
                hourly: hourlyData,
                blockRateHistory: blockRateHistory.filter(h => new Date(h.time).getTime() > cutoff),
                anomalies: recentAnomalies
            },
            endpoints: endpointStats,
            geographic: geoDistribution,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching detailed analytics',
            error: error.message
        });
    }
});

// Serve dashboard pages - protected admin routes
router.get('/dashboard/rate-limits', protect, authorize('admin'), (req, res) => {
    res.sendFile('rate-limits.html', { root: './views/dashboard' });
});

router.get('/dashboard/analytics', protect, authorize('admin'), (req, res) => {
    res.sendFile('rate-limits-analytics.html', { root: './views/dashboard' });
});

module.exports = {
    router,
    recordRequest
};