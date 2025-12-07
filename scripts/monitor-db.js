const { getConnectionStatus, checkDatabaseHealth } = require('../config/database');
const logger = require('../utils/logger');
const monitoring = require('../utils/monitoring');

const ALERT_THRESHOLDS = {
  highConnectionUsage: 0.9, // 90% of pool in use
  highReconnectAttempts: 5,
  healthCheckFailures: 3
};

let healthCheckFailures = 0;

async function monitorDatabaseHealth() {
  try {
    const status = getConnectionStatus();
    const isHealthy = await checkDatabaseHealth();

    // Calculate connection pool usage
    const { activeConnections, totalConnections } = status.metrics;
    const poolUsage = activeConnections / totalConnections;

    // Track metrics
    monitoring.trackMetric('database.connections.active', activeConnections);
    monitoring.trackMetric('database.connections.total', totalConnections);
    monitoring.trackMetric('database.connections.usage', poolUsage);

    // Check for concerning conditions
    if (poolUsage > ALERT_THRESHOLDS.highConnectionUsage) {
      monitoring.triggerAlert('high_connection_usage', {
        usage: poolUsage,
        activeConnections,
        totalConnections
      });
    }

    if (status.reconnectAttempts > ALERT_THRESHOLDS.highReconnectAttempts) {
      monitoring.triggerAlert('high_reconnect_attempts', {
        attempts: status.reconnectAttempts,
        lastAttempt: status.lastReconnectAttempt
      });
    }

    if (!isHealthy) {
      healthCheckFailures++;
      if (healthCheckFailures >= ALERT_THRESHOLDS.healthCheckFailures) {
        monitoring.triggerAlert('repeated_health_check_failures', {
          failures: healthCheckFailures,
          status
        });
      }
    } else {
      healthCheckFailures = 0;
    }

    // Log detailed status periodically
    logger.info('Database Health Check', {
      healthy: isHealthy,
      poolUsage: `${(poolUsage * 100).toFixed(1)}%`,
      activeConnections,
      totalConnections,
      reconnectAttempts: status.reconnectAttempts,
      recentErrors: status.healthStatus.recentErrors
    });

  } catch (error) {
    logger.error('Database monitoring error', {
      error: error.message,
      stack: error.stack
    });
    monitoring.trackError('monitoring', error);
  }
}

// Export for use in automated monitoring
module.exports = {
  monitorDatabaseHealth,
  ALERT_THRESHOLDS
};

// If run directly, start monitoring
if (require.main === module) {
  const MONITOR_INTERVAL = 60000; // 1 minute
  console.log('Starting database monitoring...');
  setInterval(monitorDatabaseHealth, MONITOR_INTERVAL);
  monitorDatabaseHealth(); // Run initial check
}