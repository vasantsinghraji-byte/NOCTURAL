// MongoDB Authentication Setup Script
// Run with environment variables, for example:
//   MONGO_ADMIN_PASSWORD=... MONGO_DEV_PASSWORD=... MONGO_PROD_PASSWORD=... mongosh --file setup-mongodb-auth.js

function readEnv(name) {
  if (globalThis.process && globalThis.process.env && globalThis.process.env[name]) {
    return globalThis.process.env[name];
  }

  if (typeof globalThis._getEnv === 'function') {
    return globalThis._getEnv(name);
  }

  return '';
}

function requiredEnv(name) {
  const value = readEnv(name);

  if (!value) {
    print(`ERROR: ${name} environment variable is required.`);
    quit(1);
  }

  return value;
}

function createOrReportUser(database, userConfig) {
  try {
    database.createUser(userConfig);
    print(`User '${userConfig.user}' created successfully`);
  } catch (error) {
    if (error.code === 51003) {
      print(`User '${userConfig.user}' already exists`);
      return;
    }

    throw error;
  }
}

const adminPassword = requiredEnv('MONGO_ADMIN_PASSWORD');
const devPassword = requiredEnv('MONGO_DEV_PASSWORD');
const prodPassword = requiredEnv('MONGO_PROD_PASSWORD');

print('=== MongoDB Authentication Setup ===\n');

print('Step 1: Creating admin user...');
db = db.getSiblingDB('admin');
createOrReportUser(db, {
  user: 'admin',
  pwd: adminPassword,
  roles: [
    { role: 'userAdminAnyDatabase', db: 'admin' },
    { role: 'readWriteAnyDatabase', db: 'admin' },
    { role: 'dbAdminAnyDatabase', db: 'admin' }
  ]
});

print('\nStep 2: Creating development database user...');
db = db.getSiblingDB('nocturnal_dev');
createOrReportUser(db, {
  user: 'nocturnaldev',
  pwd: devPassword,
  roles: [
    { role: 'readWrite', db: 'nocturnal_dev' },
    { role: 'dbAdmin', db: 'nocturnal_dev' }
  ]
});

print('\nStep 3: Creating production database user...');
db = db.getSiblingDB('nocturnal_prod');
createOrReportUser(db, {
  user: 'nocturnalprod',
  pwd: prodPassword,
  roles: [
    { role: 'readWrite', db: 'nocturnal_prod' },
    { role: 'dbAdmin', db: 'nocturnal_prod' }
  ]
});

print('\n=== User Creation Complete ===');
print('\nNext steps:');
print('1. Enable authentication in mongod.cfg');
print('2. Restart MongoDB service');
print('3. Store passwords in your secret manager or local .env file');
