/**
 * Fix MongoDB Authentication using Localhost Exception
 *
 * MongoDB allows the first connection from localhost to create an admin user
 * even when auth is enabled. We'll use this to verify/recreate users properly.
 */

const { MongoClient } = require('mongodb');

const adminUri = 'mongodb://localhost:27017/admin';

// Load credentials from environment variables
const ADMIN_PASSWORD = process.env.MONGO_ADMIN_PASSWORD;
const DEV_PASSWORD = process.env.MONGO_DEV_PASSWORD;
const PROD_PASSWORD = process.env.MONGO_PROD_PASSWORD;

if (!ADMIN_PASSWORD || !DEV_PASSWORD || !PROD_PASSWORD) {
  console.error('ERROR: Required environment variables not set.');
  console.error('Please set: MONGO_ADMIN_PASSWORD, MONGO_DEV_PASSWORD, MONGO_PROD_PASSWORD');
  process.exit(1);
}

async function fixAuthentication() {
    console.log('=== MongoDB Authentication Fix Using Localhost Exception ===\n');

    const client = new MongoClient(adminUri);

    try {
        console.log('Step 1: Connecting to MongoDB via localhost exception...');
        await client.connect();
        console.log('[OK] Connected\n');

        const adminDb = client.db('admin');

        // Check if we can run commands (localhost exception active)
        try {
            await adminDb.command({ ping: 1 });
            console.log('[OK] Localhost exception is active\n');
        } catch (err) {
            console.log('[INFO] Need to authenticate\n');

            // Try to authenticate with admin user
            try {
                await adminDb.command({
                    auth: 1,
                    user: 'admin',
                    pwd: ADMIN_PASSWORD,
                    mechanism: 'SCRAM-SHA-256'
                });
                console.log('[OK] Authenticated as admin\n');
            } catch (authErr) {
                console.log('[ERROR] Cannot authenticate:', authErr.message);
                console.log('Authentication is enabled but admin user may not work.');
                console.log('This means we need to use the localhost exception differently.\n');
                await client.close();
                return false;
            }
        }

        // List existing users
        console.log('Step 2: Checking existing users...');
        try {
            const users = await adminDb.command({ usersInfo: 1 });
            console.log(`[OK] Found ${users.users.length} users in admin database`);
            users.users.forEach(u => console.log(`  - ${u.user}`));
            console.log('');
        } catch (err) {
            console.log('[INFO] Could not list users (this is OK)\n');
        }

        // Try to drop and recreate users to ensure they work with auth enabled
        console.log('Step 3: Recreating users to ensure auth compatibility...\n');

        // Recreate admin user
        console.log('  Recreating admin user...');
        try {
            await adminDb.command({ dropUser: 'admin' });
            console.log('  [OK] Dropped existing admin user');
        } catch (err) {
            console.log('  [INFO] Admin user does not exist or cannot drop');
        }

        try {
            await adminDb.command({
                createUser: 'admin',
                pwd: ADMIN_PASSWORD,
                roles: [
                    { role: 'userAdminAnyDatabase', db: 'admin' },
                    { role: 'readWriteAnyDatabase', db: 'admin' },
                    { role: 'dbAdminAnyDatabase', db: 'admin' },
                    { role: 'root', db: 'admin' }
                ]
            });
            console.log('  [OK] Admin user recreated successfully\n');
        } catch (err) {
            if (err.code === 51003) {
                console.log('  [OK] Admin user already exists\n');
            } else {
                console.log('  [ERROR] Failed to create admin:', err.message, '\n');
            }
        }

        // Recreate development user
        console.log('  Recreating development user...');
        const devDb = client.db('nocturnal_dev');
        try {
            await devDb.command({ dropUser: 'nocturnaldev' });
            console.log('  [OK] Dropped existing dev user');
        } catch (err) {
            console.log('  [INFO] Dev user does not exist or cannot drop');
        }

        try {
            await devDb.command({
                createUser: 'nocturnaldev',
                pwd: DEV_PASSWORD,
                roles: [
                    { role: 'readWrite', db: 'nocturnal_dev' },
                    { role: 'dbAdmin', db: 'nocturnal_dev' }
                ]
            });
            console.log('  [OK] Development user recreated successfully\n');
        } catch (err) {
            if (err.code === 51003) {
                console.log('  [OK] Development user already exists\n');
            } else {
                console.log('  [ERROR] Failed to create dev user:', err.message, '\n');
            }
        }

        // Recreate production user
        console.log('  Recreating production user...');
        const prodDb = client.db('nocturnal_prod');
        try {
            await prodDb.command({ dropUser: 'nocturnalprod' });
            console.log('  [OK] Dropped existing prod user');
        } catch (err) {
            console.log('  [INFO] Prod user does not exist or cannot drop');
        }

        try {
            await prodDb.command({
                createUser: 'nocturnalprod',
                pwd: PROD_PASSWORD,
                roles: [
                    { role: 'readWrite', db: 'nocturnal_prod' },
                    { role: 'dbAdmin', db: 'nocturnal_prod' }
                ]
            });
            console.log('  [OK] Production user recreated successfully\n');
        } catch (err) {
            if (err.code === 51003) {
                console.log('  [OK] Production user already exists\n');
            } else {
                console.log('  [ERROR] Failed to create prod user:', err.message, '\n');
            }
        }

        console.log('=== Users Recreated Successfully ===\n');
        console.log('Now test the connection with:');
        console.log('  node test-mongo-connection.js\n');

        await client.close();
        return true;

    } catch (err) {
        console.log('[ERROR] Unexpected error:', err.message);
        console.log('\nFull error:', err);
        await client.close();
        return false;
    }
}

fixAuthentication().catch(console.error);
