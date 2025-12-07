/**
 * MongoDB Security Setup Script
 *
 * This script sets up MongoDB authentication with:
 * - Admin user for database administration
 * - Application user with minimal required permissions
 * - Development and production database configurations
 *
 * IMPORTANT: Run this script ONCE to set up authentication
 * After running, MongoDB will require authentication for all connections
 *
 * Usage:
 *   node scripts/setup-mongodb-security.js
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.blue}→${colors.reset} ${msg}`)
};

/**
 * Generate strong password
 */
function generatePassword(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }

  return password;
}

/**
 * Create admin user in admin database
 */
async function createAdminUser(connection, username, password) {
  try {
    const adminDb = connection.db('admin');

    // Check if user already exists
    const existingUser = await adminDb.admin().listUsers({ user: username });
    if (existingUser && existingUser.users && existingUser.users.length > 0) {
      log.warn(`Admin user '${username}' already exists`);
      return false;
    }

    // Create admin user
    await adminDb.admin().command({
      createUser: username,
      pwd: password,
      roles: [
        { role: 'userAdminAnyDatabase', db: 'admin' },
        { role: 'readWriteAnyDatabase', db: 'admin' },
        { role: 'dbAdminAnyDatabase', db: 'admin' },
        { role: 'clusterAdmin', db: 'admin' }
      ]
    });

    log.success(`Created admin user: ${username}`);
    return true;
  } catch (error) {
    if (error.code === 13) {
      log.error('Authorization failed. Admin user may already exist or MongoDB may already have auth enabled.');
      return false;
    }
    throw error;
  }
}

/**
 * Create application user with minimal permissions
 */
async function createAppUser(connection, database, username, password) {
  try {
    const targetDb = connection.db(database);

    // Check if user already exists
    try {
      const users = await targetDb.admin().command({ usersInfo: { user: username, db: database } });
      if (users && users.users && users.users.length > 0) {
        log.warn(`Application user '${username}' already exists in database '${database}'`);
        return false;
      }
    } catch (err) {
      // User doesn't exist, continue with creation
    }

    // Create application user with minimal permissions
    await targetDb.admin().command({
      createUser: username,
      pwd: password,
      roles: [
        { role: 'readWrite', db: database }
      ]
    });

    log.success(`Created application user: ${username} for database: ${database}`);
    return true;
  } catch (error) {
    if (error.code === 13) {
      log.error('Authorization failed. User may already exist.');
      return false;
    }
    throw error;
  }
}

/**
 * Test database connection
 */
async function testConnection(uri, dbName) {
  try {
    const testConnection = await mongoose.createConnection(uri, {
      dbName,
      serverSelectionTimeoutMS: 5000
    }).asPromise();

    await testConnection.db.admin().ping();
    await testConnection.close();

    log.success(`Connection test successful for database: ${dbName}`);
    return true;
  } catch (error) {
    log.error(`Connection test failed: ${error.message}`);
    return false;
  }
}

/**
 * Save credentials to secure file
 */
function saveCredentials(credentials) {
  const credentialsPath = path.join(__dirname, '..', 'mongodb-credentials.json');
  const envExamplePath = path.join(__dirname, '..', '.env.example');

  // Save to JSON file (should be added to .gitignore)
  fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  log.success(`Credentials saved to: ${credentialsPath}`);
  log.warn('IMPORTANT: Add mongodb-credentials.json to .gitignore');

  // Update .env.example with connection string format
  const envExample = `
# MongoDB Configuration (after running setup-mongodb-security.js)
MONGODB_URI=mongodb://${credentials.dev.username}:${credentials.dev.password}@localhost:27017/noctural_dev?authSource=noctural_dev
MONGODB_URI_TEST=mongodb://${credentials.test.username}:${credentials.test.password}@localhost:27017/noctural_test?authSource=noctural_test

# Production MongoDB (replace with your credentials)
# MONGODB_URI=mongodb://${credentials.prod.username}:YOUR_PROD_PASSWORD@your-mongo-server:27017/noctural_prod?authSource=noctural_prod&replicaSet=rs0&retryWrites=true&w=majority
`;

  const currentEnvExample = fs.existsSync(envExamplePath) ? fs.readFileSync(envExamplePath, 'utf8') : '';

  if (!currentEnvExample.includes('setup-mongodb-security.js')) {
    fs.appendFileSync(envExamplePath, envExample);
    log.success('Updated .env.example with MongoDB configuration');
  }
}

/**
 * Main setup function
 */
async function setupMongoDBSecurity() {
  console.log('\n' + '='.repeat(70));
  console.log('  MONGODB SECURITY SETUP');
  console.log('='.repeat(70) + '\n');

  let connection;
  const credentials = {
    admin: {},
    dev: {},
    test: {},
    prod: {}
  };

  try {
    // Step 1: Connect to MongoDB without authentication
    log.step('Step 1: Connecting to MongoDB...');

    try {
      connection = await mongoose.createConnection('mongodb://localhost:27017', {
        serverSelectionTimeoutMS: 5000
      }).asPromise();

      log.success('Connected to MongoDB (no authentication)');
    } catch (error) {
      log.error('Failed to connect to MongoDB');
      log.info('Make sure MongoDB is running without authentication');
      log.info('If MongoDB already has auth enabled, use setup-mongodb-security-with-admin.js instead');
      throw error;
    }

    // Step 2: Create admin user
    log.step('\nStep 2: Creating admin user...');
    credentials.admin.username = 'nocturnal_admin';
    credentials.admin.password = generatePassword(32);

    await createAdminUser(connection, credentials.admin.username, credentials.admin.password);

    // Step 3: Create application users
    log.step('\nStep 3: Creating application users...');

    // Development database user
    credentials.dev.database = 'noctural_dev';
    credentials.dev.username = 'noctural_app_dev';
    credentials.dev.password = generatePassword(32);

    await createAppUser(connection, credentials.dev.database, credentials.dev.username, credentials.dev.password);

    // Test database user
    credentials.test.database = 'noctural_test';
    credentials.test.username = 'noctural_app_test';
    credentials.test.password = generatePassword(32);

    await createAppUser(connection, credentials.test.database, credentials.test.username, credentials.test.password);

    // Production database user (template)
    credentials.prod.database = 'noctural_prod';
    credentials.prod.username = 'noctural_app_prod';
    credentials.prod.password = generatePassword(32);

    log.info('Production credentials generated (not created yet - requires production database)');

    // Close initial connection
    await connection.close();
    log.info('\nClosed non-authenticated connection');

    // Step 4: Save credentials
    log.step('\nStep 4: Saving credentials...');
    saveCredentials(credentials);

    // Step 5: Test connections
    log.step('\nStep 5: Testing authenticated connections...');
    log.warn('MongoDB authentication may need to be enabled in mongod.conf');
    log.warn('Add security.authorization: enabled to mongod.conf and restart MongoDB');

    const devUri = `mongodb://${credentials.dev.username}:${credentials.dev.password}@localhost:27017`;
    await testConnection(devUri, credentials.dev.database);

    const testUri = `mongodb://${credentials.test.username}:${credentials.test.password}@localhost:27017`;
    await testConnection(testUri, credentials.test.database);

    // Step 6: Display summary
    console.log('\n' + '='.repeat(70));
    console.log('  SETUP COMPLETE');
    console.log('='.repeat(70) + '\n');

    log.success('MongoDB security setup completed successfully!\n');

    console.log('📋 CREDENTIALS SUMMARY:\n');
    console.log(`Admin User:`);
    console.log(`  Username: ${credentials.admin.username}`);
    console.log(`  Password: ${credentials.admin.password}`);
    console.log(`  Database: admin\n`);

    console.log(`Development User:`);
    console.log(`  Username: ${credentials.dev.username}`);
    console.log(`  Password: ${credentials.dev.password}`);
    console.log(`  Database: ${credentials.dev.database}\n`);

    console.log(`Test User:`);
    console.log(`  Username: ${credentials.test.username}`);
    console.log(`  Password: ${credentials.test.password}`);
    console.log(`  Database: ${credentials.test.database}\n`);

    console.log('📝 NEXT STEPS:\n');
    console.log('1. Add mongodb-credentials.json to .gitignore');
    console.log('2. Enable authentication in MongoDB:');
    console.log('   - Edit mongod.conf');
    console.log('   - Add: security.authorization: enabled');
    console.log('   - Restart MongoDB service\n');
    console.log('3. Update your .env file with the connection string:');
    console.log(`   MONGODB_URI=mongodb://${credentials.dev.username}:${credentials.dev.password}@localhost:27017/${credentials.dev.database}?authSource=${credentials.dev.database}\n`);
    console.log('4. Test the application:');
    console.log('   npm start\n');
    console.log('5. For production, use the generated production credentials');
    console.log('   and create the user on your production MongoDB instance.\n');

    log.warn('SECURITY REMINDER:');
    log.warn('- Never commit mongodb-credentials.json to version control');
    log.warn('- Store production credentials in a secure secret manager');
    log.warn('- Rotate passwords regularly (every 90 days)');
    log.warn('- Use different credentials for each environment\n');

  } catch (error) {
    log.error(`Setup failed: ${error.message}`);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        // Ignore close errors
      }
    }
  }
}

// Run setup
setupMongoDBSecurity().catch(error => {
  log.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
