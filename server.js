const dotenv = require('dotenv');

// Load environment variables before importing env-sensitive local modules.
dotenv.config({ quiet: process.env.NODE_ENV === 'test' });

const app = require('./app');
const logger = require('./utils/logger');
const monitoring = require('./utils/monitoring');
const metricsRouter = require('./routes/admin/metrics');
const paymentService = require('./services/paymentService');
const { connectDB, disconnectDB } = require('./config/database');
const { cleanup: cleanupRateLimits } = require('./config/rateLimit');
const { validateEnvironment } = require('./config/validateEnv');
const securityNotificationOutboxService = require('./services/securityNotificationOutboxService');
const auditExportCleanupScheduler = require('./services/auditExportCleanupScheduler');
const auditLifecycleReportCleanupScheduler = require('./services/auditLifecycleReportCleanupScheduler');
const reconciliationScheduler = require('./services/reconciliationScheduler');

let server = null;
let processHandlersRegistered = false;

const SERVER_HEADERS_TIMEOUT_MS = 10_000;
const SERVER_REQUEST_TIMEOUT_MS = 30_000;
const SERVER_KEEP_ALIVE_TIMEOUT_MS = 5_000;

function validateStartupEnvironment() {
  try {
    validateEnvironment({ throwOnError: true });
  } catch (error) {
    console.error('\nSTARTUP FAILED - Environment validation error:\n');
    console.error(error.message);
    console.error('\nFix the above issues and restart the server.\n');
    throw error;
  }
}

async function stopServer() {
  paymentService.stopRefundOutboxWorker();
  cleanupRateLimits();
  monitoring.cleanup();
  metricsRouter.cleanup();
  securityNotificationOutboxService.stop();
  auditExportCleanupScheduler.stop();
  auditLifecycleReportCleanupScheduler.stop();
  reconciliationScheduler.stop();

  if (!server) {
    await disconnectDB();
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  server = null;
  await disconnectDB();
}

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  logger.info(`${signal} received - starting graceful shutdown`);

  const forceShutdownTimer = setTimeout(() => {
    console.error('Forced shutdown - timeout exceeded');
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);

  try {
    await stopServer();
    clearTimeout(forceShutdownTimer);
    console.log('Graceful shutdown completed');
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    clearTimeout(forceShutdownTimer);
    console.error('Error during shutdown:', error);
    logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
}

function registerProcessHandlers() {
  if (processHandlersRegistered) {
    return;
  }

  processHandlersRegistered = true;

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      console.log('Received shutdown message from PM2');
      gracefulShutdown('PM2_SHUTDOWN');
    }
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack
    });
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    logger.error('Unhandled Promise Rejection', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined
    });
    gracefulShutdown('UNHANDLED_REJECTION');
  });
}

async function startServer(options = {}) {
  const config = Object.assign({
    port: process.env.PORT || 5000,
    registerProcessHandlers: true,
    connectDatabase: true
  }, options || {});

  if (server) {
    return server;
  }

  validateStartupEnvironment();

  if (config.connectDatabase) {
    await connectDB({ failFast: true });
  }

  server = await new Promise((resolve, reject) => {
    const listeningServer = app.listen(config.port, () => {
      logger.info('Server Started Successfully', {
        port: config.port,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        processId: process.pid
      });
      console.log(`Server running on port ${config.port} - Logs: ./logs/`);
      console.log(`Process ID: ${process.pid}`);

      if (process.send) {
        process.send('ready');
        console.log('PM2 ready signal sent');
      }

      resolve(listeningServer);
    });

    listeningServer.once('error', reject);
  });

  server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
  server.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;
  server.keepAliveTimeout = SERVER_KEEP_ALIVE_TIMEOUT_MS;

  if (config.connectDatabase) {
    paymentService.startRefundOutboxWorker();
    securityNotificationOutboxService.start();
    auditExportCleanupScheduler.start();
    auditLifecycleReportCleanupScheduler.start();
    reconciliationScheduler.start();
  }

  server.on('close', () => {
    server = null;
  });

  if (config.registerProcessHandlers) {
    registerProcessHandlers();
  }

  return server;
}

module.exports = {
  app,
  startServer,
  stopServer,
  gracefulShutdown
};

if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Server startup failed', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });
}
