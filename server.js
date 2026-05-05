const dotenv = require('dotenv');

// Load environment variables before importing env-sensitive local modules.
dotenv.config();

const app = require('./app');
const logger = require('./utils/logger');
const monitoring = require('./utils/monitoring');
const metricsRouter = require('./routes/admin/metrics');
const { connectDB, disconnectDB } = require('./config/database');
const { cleanup: cleanupRateLimits } = require('./config/rateLimit');
const { validateEnvironment } = require('./config/validateEnv');

let server = null;
let processHandlersRegistered = false;

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
  cleanupRateLimits();
  monitoring.cleanup();
  metricsRouter.cleanup();

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

function startServer(options = {}) {
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
    connectDB();
  }

  server = app.listen(config.port, () => {
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
  });

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
  startServer();
}
