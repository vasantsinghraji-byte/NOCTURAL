/**
 * Vault Initialization Script
 * Migrates secrets from .env to HashiCorp Vault
 *
 * Usage:
 *   node scripts/init-vault.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`)
};

async function initializeVault() {
  console.log('\n' + '='.repeat(60));
  console.log('  NOCTURNAL PLATFORM - VAULT INITIALIZATION');
  console.log('='.repeat(60) + '\n');

  // Check if Vault is configured
  if (!process.env.VAULT_TOKEN || !process.env.VAULT_ADDR) {
    log.error('Vault not configured!');
    log.info('Set VAULT_ADDR and VAULT_TOKEN environment variables');
    log.info('Example:');
    log.info('  export VAULT_ADDR=http://127.0.0.1:8200');
    log.info('  export VAULT_TOKEN=your-token-here');
    process.exit(1);
  }

  try {
    // Import Vault manager
    const { vaultManager } = require('../config/vault');

    // Enable Vault
    vaultManager.enabled = true;

    // Initialize connection
    log.info('Connecting to Vault...');
    await vaultManager.initialize();
    log.success('Connected to Vault\n');

    // Define secrets to migrate
    const secretsToMigrate = {
      'auth': {
        'JWT_SECRET': process.env.JWT_SECRET,
        'JWT_EXPIRE': process.env.JWT_EXPIRE || '7d'
      },
      'encryption': {
        'ENCRYPTION_KEY': process.env.ENCRYPTION_KEY
      },
      'database': {
        'MONGODB_URI': process.env.MONGODB_URI,
        'MONGODB_PASSWORD': extractPasswordFromURI(process.env.MONGODB_URI)
      },
      'firebase': {
        'API_KEY': process.env.FIREBASE_API_KEY,
        'AUTH_DOMAIN': process.env.FIREBASE_AUTH_DOMAIN,
        'PROJECT_ID': process.env.FIREBASE_PROJECT_ID,
        'STORAGE_BUCKET': process.env.FIREBASE_STORAGE_BUCKET,
        'MESSAGING_SENDER_ID': process.env.FIREBASE_MESSAGING_SENDER_ID,
        'APP_ID': process.env.FIREBASE_APP_ID
      },
      'razorpay': {
        'KEY_ID': process.env.RAZORPAY_KEY_ID,
        'KEY_SECRET': process.env.RAZORPAY_KEY_SECRET
      },
      'aws': {
        'ACCESS_KEY_ID': process.env.AWS_ACCESS_KEY_ID,
        'SECRET_ACCESS_KEY': process.env.AWS_SECRET_ACCESS_KEY,
        'REGION': process.env.AWS_REGION || 'us-east-1',
        'S3_BUCKET': process.env.AWS_S3_BUCKET
      }
    };

    // Migrate secrets
    log.info('Migrating secrets to Vault...\n');

    let successCount = 0;
    let skipCount = 0;

    for (const [path, secrets] of Object.entries(secretsToMigrate)) {
      log.info(`Processing ${path}...`);

      for (const [key, value] of Object.entries(secrets)) {
        if (!value || value === '' || value === 'undefined') {
          log.warn(`  Skipping ${key} (not set)`);
          skipCount++;
          continue;
        }

        try {
          await vaultManager.setSecret(path, key, value);
          log.success(`  ${key} migrated`);
          successCount++;
        } catch (error) {
          log.error(`  Failed to migrate ${key}: ${error.message}`);
        }
      }

      console.log('');
    }

    // Summary
    console.log('='.repeat(60));
    log.success('VAULT INITIALIZATION COMPLETE\n');
    log.info(`Secrets migrated: ${successCount}`);
    log.info(`Secrets skipped: ${skipCount}\n`);

    // Verify secrets
    log.info('Verifying secrets...');
    const jwtSecret = await vaultManager.getSecret('auth', 'JWT_SECRET');
    if (jwtSecret) {
      log.success('Verification passed - secrets readable from Vault\n');
    } else {
      log.error('Verification failed - cannot read secrets from Vault\n');
    }

    // Next steps
    log.warn('NEXT STEPS:');
    log.info('1. Enable Vault in .env:');
    log.info('   VAULT_ENABLED=true');
    log.info('   VAULT_ADDR=http://127.0.0.1:8200');
    log.info('   VAULT_TOKEN=your-token');
    log.info('');
    log.info('2. Test application startup');
    log.info('');
    log.info('3. Remove secrets from .env (keep non-sensitive config)');
    log.info('');
    log.info('4. Set up Vault in production with proper authentication');
    log.info('');

    console.log('='.repeat(60) + '\n');

  } catch (error) {
    log.error(`Initialization failed: ${error.message}`);
    log.error(error.stack);
    process.exit(1);
  }
}

// Helper function to extract password from MongoDB URI
function extractPasswordFromURI(uri) {
  if (!uri) return null;

  const match = uri.match(/mongodb:\/\/[^:]+:([^@]+)@/);
  return match ? match[1] : null;
}

// Run initialization
initializeVault().catch(error => {
  log.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
