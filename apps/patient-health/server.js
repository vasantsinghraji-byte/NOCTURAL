/**
 * Patient-health boot script (restructure Phase 3 — DEV/VALIDATION ONLY).
 *
 * Boots the isolated patient-health app for import/boot validation.
 * Connects through the monolith's existing config/database.js — no
 * schema changes, no separate database. Not wired into any deploy
 * tooling; run manually: node apps/patient-health/server.js
 */

const path = require('path');
const dotenv = require('dotenv');

// Load the repo-root .env (same environment as the monolith)
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: process.env.NODE_ENV === 'test' });

const app = require('./app');
const { logger } = require('@nocturnal/shared');
const { connectDB, disconnectDB } = require('../../config/database');

const PORT = process.env.PATIENT_HEALTH_PORT || 5001;

let server = null;

async function startServer() {
  await connectDB();
  server = app.listen(PORT, () => {
    logger.info(`patient-health dev/validation server listening on :${PORT}`);
  });
  return server;
}

async function stopServer() {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    server = null;
  }
  await disconnectDB();
}

if (require.main === module) {
  startServer().catch((error) => {
    logger.error('patient-health server failed to start', { error: error.message });
    process.exitCode = 1;
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stopServer()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });
  }
}

module.exports = { app, startServer, stopServer };
