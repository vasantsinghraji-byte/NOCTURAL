/**
 * MongoDB User Creation Script
 *
 * This script creates MongoDB users for authentication.
 * Run with: node create-mongo-users.js
 *
 * IMPORTANT: Run this BEFORE enabling authentication in MongoDB
 */

const { MongoClient } = require('mongodb');

// MongoDB connection (no auth - must run before enabling authentication)
const uri = 'mongodb://localhost:27017';

// User credentials - CHANGE THESE PASSWORDS!
const ADMIN_PASSWORD = 'NocturnalAdmin2025!Secure';  // Change this!
const DEV_PASSWORD = 'DevPass2025!ChangeMe';         // Change this!
const PROD_PASSWORD = 'ProdPass2025!VeryStrong';    // Change this!

async function createUsers() {
    const client = new MongoClient(uri);

    try {
        console.log('=== MongoDB Authentication Setup ===\n');

        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await client.connect();
        console.log('✓ Connected successfully\n');

        // Create admin user
        console.log('Step 1: Creating admin user...');
        const adminDb = client.db('admin');
        try {
            await adminDb.command({
                createUser: 'admin',
                pwd: ADMIN_PASSWORD,
                roles: [
                    { role: 'userAdminAnyDatabase', db: 'admin' },
                    { role: 'readWriteAnyDatabase', db: 'admin' },
                    { role: 'dbAdminAnyDatabase', db: 'admin' }
                ]
            });
            console.log('✓ Admin user created successfully');
        } catch (err) {
            if (err.code === 51003) {
                console.log('⚠ Admin user already exists');
            } else {
                console.log('✗ Error creating admin user:', err.message);
            }
        }

        // Create development user
        console.log('\nStep 2: Creating development database user...');
        const devDb = client.db('nocturnal_dev');
        try {
            await devDb.command({
                createUser: 'nocturnaldev',
                pwd: DEV_PASSWORD,
                roles: [
                    { role: 'readWrite', db: 'nocturnal_dev' },
                    { role: 'dbAdmin', db: 'nocturnal_dev' }
                ]
            });
            console.log('✓ Development user created successfully');
        } catch (err) {
            if (err.code === 51003) {
                console.log('⚠ Development user already exists');
            } else {
                console.log('✗ Error creating development user:', err.message);
            }
        }

        // Create production user
        console.log('\nStep 3: Creating production database user...');
        const prodDb = client.db('nocturnal_prod');
        try {
            await prodDb.command({
                createUser: 'nocturnalprod',
                pwd: PROD_PASSWORD,
                roles: [
                    { role: 'readWrite', db: 'nocturnal_prod' },
                    { role: 'dbAdmin', db: 'nocturnal_prod' }
                ]
            });
            console.log('✓ Production user created successfully');
        } catch (err) {
            if (err.code === 51003) {
                console.log('⚠ Production user already exists');
            } else {
                console.log('✗ Error creating production user:', err.message);
            }
        }

        console.log('\n=== User Creation Complete ===\n');
        console.log('Created users with these credentials:');
        console.log('─────────────────────────────────────');
        console.log('Admin user:');
        console.log(`  Username: admin`);
        console.log(`  Password: ${ADMIN_PASSWORD}`);
        console.log(`  Database: admin`);
        console.log('');
        console.log('Development user:');
        console.log(`  Username: nocturnaldev`);
        console.log(`  Password: ${DEV_PASSWORD}`);
        console.log(`  Database: nocturnal_dev`);
        console.log('');
        console.log('Production user:');
        console.log(`  Username: nocturnalprod`);
        console.log(`  Password: ${PROD_PASSWORD}`);
        console.log(`  Database: nocturnal_prod`);
        console.log('─────────────────────────────────────\n');

        console.log('Next steps:');
        console.log('1. Edit: C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.cfg');
        console.log('2. Add authentication config (see below)');
        console.log('3. Restart MongoDB service');
        console.log('4. Update .env files with these passwords\n');

        console.log('MongoDB Config to add:');
        console.log('─────────────────────────────────────');
        console.log('security:');
        console.log('  authorization: enabled');
        console.log('─────────────────────────────────────\n');

        console.log('Restart MongoDB commands:');
        console.log('  net stop MongoDB');
        console.log('  net start MongoDB\n');

        console.log('⚠ IMPORTANT: Change the default passwords in this script!');
        console.log('⚠ IMPORTANT: Store passwords securely (password manager)');

    } catch (err) {
        console.error('✗ Error:', err.message);
        process.exit(1);
    } finally {
        await client.close();
        console.log('\n✓ Disconnected from MongoDB');
    }
}

// Run the script
createUsers().catch(console.error);
