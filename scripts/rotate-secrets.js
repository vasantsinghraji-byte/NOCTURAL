/**
 * Secret Rotation Script
 * Rotates JWT secrets, encryption keys, and database passwords
 *
 * Usage:
 *   node scripts/rotate-secrets.js --all
 *   node scripts/rotate-secrets.js --jwt
 *   node scripts/rotate-secrets.js --encryption
 *   node scripts/rotate-secrets.js --database
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.blue}→${colors.reset} ${msg}`)
};

// Generate secure random strings
function generateJWTSecret(length = 128) {
  return crypto.randomBytes(length).toString('hex');
}

function generateEncryptionKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

function generatePassword(length = 24) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }

  return password;
}

// Read current .env file
function readEnvFile(envPath) {
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const env = {};

    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...values] = trimmed.split('=');
        env[key] = values.join('=');
      }
    });

    return env;
  } catch (error) {
    log.error(`Failed to read ${envPath}: ${error.message}`);
    return null;
  }
}

// Write updated .env file
function writeEnvFile(envPath, env, comments = {}) {
  try {
    let content = '# Environment Configuration\n';
    content += `# Last rotated: ${new Date().toISOString()}\n\n`;

    for (const [key, value] of Object.entries(env)) {
      if (comments[key]) {
        content += `# ${comments[key]}\n`;
      }
      content += `${key}=${value}\n`;
    }

    fs.writeFileSync(envPath, content, 'utf8');
    return true;
  } catch (error) {
    log.error(`Failed to write ${envPath}: ${error.message}`);
    return false;
  }
}

// Backup current .env file
function backupEnvFile(envPath) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${envPath}.backup.${timestamp}`;
    fs.copyFileSync(envPath, backupPath);
    log.success(`Backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    log.error(`Failed to create backup: ${error.message}`);
    return null;
  }
}

// Rotate JWT secret
function rotateJWTSecret(env) {
  const oldSecret = env.JWT_SECRET;
  const newSecret = generateJWTSecret();

  env.JWT_SECRET = newSecret;
  env.JWT_SECRET_OLD = oldSecret; // Keep old secret for grace period

  log.success('JWT secret rotated');
  log.warn('Old secret stored in JWT_SECRET_OLD for 7-day grace period');
  log.warn('Update all active tokens or invalidate user sessions');

  return env;
}

// Rotate encryption key
function rotateEncryptionKey(env) {
  const oldKey = env.ENCRYPTION_KEY;
  const newKey = generateEncryptionKey();

  env.ENCRYPTION_KEY = newKey;
  env.ENCRYPTION_KEY_OLD = oldKey; // Keep old key for data migration

  log.success('Encryption key rotated');
  log.warn('Old key stored in ENCRYPTION_KEY_OLD');
  log.error('CRITICAL: Re-encrypt all encrypted data with new key!');
  log.info('Run: node scripts/re-encrypt-data.js');

  return env;
}

// Rotate database password
function rotateDatabasePassword(env) {
  const newPassword = generatePassword();

  // Parse MongoDB URI
  const uriMatch = env.MONGODB_URI.match(/mongodb:\/\/([^:]+):([^@]+)@(.+)/);
  if (!uriMatch) {
    log.error('Could not parse MONGODB_URI');
    return env;
  }

  const [, username, oldPassword, rest] = uriMatch;

  env.MONGODB_URI = `mongodb://${username}:${newPassword}@${rest}`;
  env.MONGODB_PASSWORD_OLD = oldPassword; // Keep for rollback

  log.success('Database password rotated in .env');
  log.error('CRITICAL: Update password in MongoDB!');
  log.info('Run the following in mongosh:');
  log.info(`  use admin`);
  log.info(`  db.updateUser("${username}", { pwd: "${newPassword}" })`);

  return env;
}

// Rotate Firebase credentials
function rotateFirebaseCredentials(env) {
  log.warn('Firebase credential rotation must be done manually:');
  log.info('1. Go to Firebase Console');
  log.info('2. Project Settings → Service Accounts');
  log.info('3. Generate new private key');
  log.info('4. Update FIREBASE_* environment variables');
  log.info('5. Delete old service account key');

  return env;
}

// Rotate Razorpay credentials
function rotateRazorpayCredentials(env) {
  log.warn('Razorpay credential rotation must be done manually:');
  log.info('1. Go to Razorpay Dashboard');
  log.info('2. Settings → API Keys');
  log.info('3. Generate new key');
  log.info('4. Update RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
  log.info('5. Deactivate old key after grace period');

  return env;
}

// Ask for confirmation
async function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${question} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

// Main rotation function
async function rotateSecrets(options) {
  console.log('\n' + '='.repeat(60));
  console.log('  NOCTURNAL PLATFORM - SECRET ROTATION');
  console.log('='.repeat(60) + '\n');

  const envPath = path.join(__dirname, '..', '.env');

  // Check if .env exists
  if (!fs.existsSync(envPath)) {
    log.error('.env file not found!');
    process.exit(1);
  }

  // Read current environment
  log.step('Reading current environment...');
  const env = readEnvFile(envPath);
  if (!env) {
    process.exit(1);
  }

  // Show warning
  log.warn('SECRET ROTATION WARNING:');
  log.warn('- This will invalidate existing tokens and encrypted data');
  log.warn('- Users may need to re-login');
  log.warn('- Backup will be created automatically');
  log.warn('- Database passwords must be updated manually\n');

  const confirmed = await askConfirmation('Do you want to continue?');
  if (!confirmed) {
    log.info('Secret rotation cancelled');
    process.exit(0);
  }

  // Create backup
  log.step('Creating backup...');
  const backupPath = backupEnvFile(envPath);
  if (!backupPath) {
    log.error('Failed to create backup. Aborting.');
    process.exit(1);
  }

  // Perform rotations
  log.step('Rotating secrets...\n');

  let changes = false;

  if (options.jwt || options.all) {
    env = rotateJWTSecret(env);
    changes = true;
  }

  if (options.encryption || options.all) {
    env = rotateEncryptionKey(env);
    changes = true;
  }

  if (options.database || options.all) {
    env = rotateDatabasePassword(env);
    changes = true;
  }

  if (options.firebase || options.all) {
    rotateFirebaseCredentials(env);
  }

  if (options.razorpay || options.all) {
    rotateRazorpayCredentials(env);
  }

  if (!changes) {
    log.warn('No secrets were rotated. Use --jwt, --encryption, --database, or --all');
    process.exit(0);
  }

  // Write updated .env
  log.step('Writing updated environment...');
  const comments = {
    JWT_SECRET: 'Rotated JWT secret',
    JWT_SECRET_OLD: 'Old JWT secret (grace period: 7 days)',
    ENCRYPTION_KEY: 'Rotated encryption key',
    ENCRYPTION_KEY_OLD: 'Old encryption key (for data migration)',
    MONGODB_URI: 'MongoDB connection URI with rotated password',
    MONGODB_PASSWORD_OLD: 'Old MongoDB password (for rollback)'
  };

  if (writeEnvFile(envPath, env, comments)) {
    log.success('Environment file updated successfully\n');
  } else {
    log.error('Failed to write environment file');
    log.info(`Restore from backup: ${backupPath}`);
    process.exit(1);
  }

  // Show next steps
  console.log('='.repeat(60));
  log.success('SECRET ROTATION COMPLETE\n');

  log.warn('NEXT STEPS:');
  if (options.jwt || options.all) {
    log.info('1. Restart application servers');
    log.info('2. Consider invalidating all user sessions');
    log.info('3. After 7 days, remove JWT_SECRET_OLD from .env');
  }

  if (options.encryption || options.all) {
    log.info('4. Run re-encryption script: node scripts/re-encrypt-data.js');
    log.info('5. After migration, remove ENCRYPTION_KEY_OLD from .env');
  }

  if (options.database || options.all) {
    log.info('6. Update MongoDB password (see instructions above)');
    log.info('7. Test database connectivity');
    log.info('8. After verification, remove MONGODB_PASSWORD_OLD from .env');
  }

  log.info('\n9. Update secrets in deployment environments (staging, production)');
  log.info('10. Update CI/CD secrets');
  log.info('11. Notify team of rotation\n');

  console.log('='.repeat(60) + '\n');
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  all: args.includes('--all'),
  jwt: args.includes('--jwt'),
  encryption: args.includes('--encryption'),
  database: args.includes('--database'),
  firebase: args.includes('--firebase'),
  razorpay: args.includes('--razorpay')
};

// Show help if no options
if (!Object.values(options).some(v => v)) {
  console.log('\nUsage: node scripts/rotate-secrets.js [options]\n');
  console.log('Options:');
  console.log('  --all         Rotate all secrets');
  console.log('  --jwt         Rotate JWT secret only');
  console.log('  --encryption  Rotate encryption key only');
  console.log('  --database    Rotate database password only');
  console.log('  --firebase    Show Firebase rotation instructions');
  console.log('  --razorpay    Show Razorpay rotation instructions\n');
  process.exit(0);
}

// Run rotation
rotateSecrets(options).catch(error => {
  log.error(`Rotation failed: ${error.message}`);
  process.exit(1);
});
