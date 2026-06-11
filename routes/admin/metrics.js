const express = require('express');
const router = express.Router();
const { getRateLimitMetrics } = require('../../config/rateLimit');
const { protect, authorize } = require('../../middleware/auth');

function recordRequest() {
    // Compatibility hook for app-level response instrumentation.
    // Detailed request history now belongs in structured observability, not this route module.
}

function cleanup() {
    // No local timers/resources remain after retiring the legacy dashboard history store.
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
            }
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

module.exports = {
    router,
    recordRequest,
    cleanup
};
