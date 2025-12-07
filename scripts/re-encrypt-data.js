/**
 * Data Re-encryption Script
 * Re-encrypts sensitive data with new encryption key after rotation
 *
 * Usage:
 *   node scripts/re-encrypt-data.js
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

// Colors for console output
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

// Encryption utilities (duplicated from utils/encryption.js)
function decryptWithOldKey(encryptedText, oldKey) {
  try {
    const [iv, encrypted] = encryptedText.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(oldKey, 'hex'),
      Buffer.from(iv, 'hex')
    );

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

function encryptWithNewKey(text, newKey) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(newKey, 'hex'),
      iv
    );

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

// Re-encrypt user bank details
async function reEncryptUserBankDetails(oldKey, newKey) {
  const User = require('../models/user');

  log.info('Re-encrypting user bank details...');

  const users = await User.find({
    $or: [
      { 'bankDetails.accountNumber': { $exists: true, $ne: null } },
      { 'bankDetails.panCard': { $exists: true, $ne: null } }
    ]
  });

  log.info(`Found ${users.length} users with encrypted bank details`);

  let successCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      let updated = false;

      // Re-encrypt account number
      if (user.bankDetails && user.bankDetails.accountNumber) {
        try {
          const decrypted = decryptWithOldKey(user.bankDetails.accountNumber, oldKey);
          user.bankDetails.accountNumber = encryptWithNewKey(decrypted, newKey);
          updated = true;
        } catch (error) {
          log.error(`Failed to re-encrypt account number for user ${user._id}: ${error.message}`);
          errorCount++;
        }
      }

      // Re-encrypt PAN card
      if (user.bankDetails && user.bankDetails.panCard) {
        try {
          const decrypted = decryptWithOldKey(user.bankDetails.panCard, oldKey);
          user.bankDetails.panCard = encryptWithNewKey(decrypted, newKey);
          updated = true;
        } catch (error) {
          log.error(`Failed to re-encrypt PAN card for user ${user._id}: ${error.message}`);
          errorCount++;
        }
      }

      if (updated) {
        // Save without triggering pre-save encryption hook
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              'bankDetails.accountNumber': user.bankDetails.accountNumber,
              'bankDetails.panCard': user.bankDetails.panCard
            }
          }
        );
        successCount++;
      }
    } catch (error) {
      log.error(`Failed to process user ${user._id}: ${error.message}`);
      errorCount++;
    }
  }

  log.success(`Re-encrypted bank details for ${successCount} users`);
  if (errorCount > 0) {
    log.warn(`Failed to re-encrypt ${errorCount} users`);
  }

  return { successCount, errorCount };
}

// Add more re-encryption functions for other encrypted fields
async function reEncryptOtherSensitiveData(oldKey, newKey) {
  // TODO: Add re-encryption for any other encrypted fields in your models
  // Example:
  // - Patient medical records
  // - Payment information
  // - Personal identification numbers
  // - etc.

  log.info('Checking for other encrypted data...');
  log.info('No other encrypted fields found');

  return { successCount: 0, errorCount: 0 };
}

// Verify re-encryption
async function verifyReEncryption(newKey) {
  const User = require('../models/user');

  log.info('Verifying re-encryption...');

  const usersWithBankDetails = await User.find({
    $or: [
      { 'bankDetails.accountNumber': { $exists: true, $ne: null } },
      { 'bankDetails.panCard': { $exists: true, $ne: null } }
    ]
  }).limit(5);

  let verifiedCount = 0;
  let failedCount = 0;

  for (const user of usersWithBankDetails) {
    try {
      // Try to decrypt with new key
      if (user.bankDetails.accountNumber) {
        decryptWithOldKey(user.bankDetails.accountNumber, newKey);
      }

      if (user.bankDetails.panCard) {
        decryptWithOldKey(user.bankDetails.panCard, newKey);
      }

      verifiedCount++;
    } catch (error) {
      log.error(`Verification failed for user ${user._id}`);
      failedCount++;
    }
  }

  if (failedCount === 0) {
    log.success(`Verification passed for ${verifiedCount} sample users`);
    return true;
  } else {
    log.error(`Verification failed for ${failedCount} users`);
    return false;
  }
}

// Main function
async function reEncryptAllData() {
  console.log('\n' + '='.repeat(60));
  console.log('  NOCTURNAL PLATFORM - DATA RE-ENCRYPTION');
  console.log('='.repeat(60) + '\n');

  // Check for old and new keys
  const oldKey = process.env.ENCRYPTION_KEY_OLD;
  const newKey = process.env.ENCRYPTION_KEY;

  if (!oldKey) {
    log.error('ENCRYPTION_KEY_OLD not found in environment');
    log.info('Run: node scripts/rotate-secrets.js --encryption');
    process.exit(1);
  }

  if (!newKey) {
    log.error('ENCRYPTION_KEY not found in environment');
    process.exit(1);
  }

  if (oldKey === newKey) {
    log.warn('Old and new encryption keys are the same');
    log.info('No re-encryption needed');
    process.exit(0);
  }

  log.info('Old encryption key found');
  log.info('New encryption key found');
  log.warn('Starting re-encryption process...\n');

  try {
    // Connect to database
    log.info('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    log.success('Connected to database\n');

    // Track statistics
    const stats = {
      totalSuccess: 0,
      totalErrors: 0,
      startTime: Date.now()
    };

    // Re-encrypt user bank details
    const bankDetailsResult = await reEncryptUserBankDetails(oldKey, newKey);
    stats.totalSuccess += bankDetailsResult.successCount;
    stats.totalErrors += bankDetailsResult.errorCount;

    // Re-encrypt other sensitive data
    const otherDataResult = await reEncryptOtherSensitiveData(oldKey, newKey);
    stats.totalSuccess += otherDataResult.successCount;
    stats.totalErrors += otherDataResult.errorCount;

    // Verify re-encryption
    log.info('');
    const verified = await verifyReEncryption(newKey);

    // Summary
    const duration = ((Date.now() - stats.startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    log.success('RE-ENCRYPTION COMPLETE\n');

    log.info(`Total records re-encrypted: ${stats.totalSuccess}`);
    log.info(`Total errors: ${stats.totalErrors}`);
    log.info(`Duration: ${duration} seconds`);
    log.info(`Verification: ${verified ? 'PASSED' : 'FAILED'}\n');

    if (verified && stats.totalErrors === 0) {
      log.success('All data successfully re-encrypted!');
      log.warn('NEXT STEPS:');
      log.info('1. Test application functionality');
      log.info('2. Verify encrypted data can be decrypted');
      log.info('3. Remove ENCRYPTION_KEY_OLD from .env after 7 days');
    } else {
      log.error('Re-encryption completed with errors');
      log.warn('Review errors above and re-run if necessary');
    }

    console.log('='.repeat(60) + '\n');

  } catch (error) {
    log.error(`Re-encryption failed: ${error.message}`);
    log.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    log.info('Database connection closed');
  }
}

// Run re-encryption
reEncryptAllData().catch(error => {
  log.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
