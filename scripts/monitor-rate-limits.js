const { getRateLimitMetrics } = require('../config/rateLimit');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');

const ALERT_THRESHOLDS = {
  blockRate: 0.2, // Alert if 20% of requests are blocked
  suspiciousIPs: 5, // Alert if 5 IPs are blocked in window
  endpointAbuse: 50 // Alert if endpoint hit 50 times in window
};

async function monitorRateLimits() {
  try {
    const { metrics, blocked, thresholds } = getRateLimitMetrics();

    // Monitor auth rate limits
    const authBlockRate = metrics.auth.blocked / (metrics.auth.total || 1);
    if (authBlockRate > ALERT_THRESHOLDS.blockRate) {
      monitoring.triggerAlert('high_auth_block_rate', {
        rate: authBlockRate,
        blocked: metrics.auth.blocked,
        total: metrics.auth.total
      });
    }

    // Monitor suspicious IPs
    const suspiciousIPs = Array.from(metrics.api.ips.entries())
      .filter(([_, count]) => count >= thresholds.api.blockThreshold);

    if (suspiciousIPs.length >= ALERT_THRESHOLDS.suspiciousIPs) {
      monitoring.triggerAlert('suspicious_ips_detected', {
        count: suspiciousIPs.length,
        ips: suspiciousIPs.map(([ip]) => ip)
      });
    }

    // Monitor endpoint abuse
    metrics.api.endpoints.forEach((count, endpoint) => {
      if (count >= ALERT_THRESHOLDS.endpointAbuse) {
        monitoring.triggerAlert('endpoint_abuse_detected', {
          endpoint,
          count,
          threshold: ALERT_THRESHOLDS.endpointAbuse
        });
      }
    });

    // Log current status
    logger.info('Rate Limit Status', {
      auth: {
        total: metrics.auth.total,
        blocked: metrics.auth.blocked,
        blockRate: authBlockRate
      },
      api: {
        total: metrics.api.total,
        blocked: metrics.api.blocked,
        suspiciousIPs: suspiciousIPs.length
      },
      upload: {
        total: metrics.upload.total,
        blocked: metrics.upload.blocked
      },
      currentlyBlocked: blocked.length
    });

    // Track metrics
    monitoring.trackMetric('rate_limits.auth.block_rate', authBlockRate);
    monitoring.trackMetric('rate_limits.suspicious_ips', suspiciousIPs.length);
    monitoring.trackMetric('rate_limits.blocked_entities', blocked.length);

  } catch (error) {
    logger.error('Rate limit monitoring error', {
      error: error.message,
      stack: error.stack
    });
    monitoring.trackError('monitoring', error);
  }
}

// Export for use in automated monitoring
module.exports = {
  monitorRateLimits,
  ALERT_THRESHOLDS
};

// If run directly, start monitoring
if (require.main === module) {
  const MONITOR_INTERVAL = 5 * 60 * 1000; // 5 minutes
  console.log('Starting rate limit monitoring...');
  setInterval(monitorRateLimits, MONITOR_INTERVAL);
  monitorRateLimits(); // Run initial check
}