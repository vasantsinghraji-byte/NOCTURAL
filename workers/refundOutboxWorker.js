require('dotenv').config();

const paymentService = require('../services/paymentService');
const { connectDB, disconnectDB } = require('../config/database');
const logger = require('../utils/logger');

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('Refund outbox worker shutdown requested', { signal });

  paymentService.stopRefundOutboxWorker();
  await disconnectDB();
  process.exit(0);
}

async function start() {
  process.env.REFUND_OUTBOX_WORKER_ENABLED = process.env.REFUND_OUTBOX_WORKER_ENABLED || 'true';

  await connectDB();
  paymentService.startRefundOutboxWorker();

  logger.info('Refund outbox background worker started', {
    intervalMs: process.env.REFUND_OUTBOX_WORKER_INTERVAL_MS || undefined
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch(async (error) => {
  logger.error('Refund outbox background worker failed to start', {
    error: error.message,
    stack: error.stack
  });
  await disconnectDB();
  process.exit(1);
});
