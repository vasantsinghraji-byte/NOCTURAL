/**
 * Verify and Fix MongoDB Authentication
 *
 * This script checks if users can authenticate and provides diagnostics
 */

const { MongoClient } = require('mongodb');

// Try without authentication first (admin connection)
const adminUri = 'mongodb://localhost:27017/admin';
const devUri = 'mongodb://nocturnaldev:DevPass2025!ChangeMe@localhost:27017/nocturnal_dev?authSource=admin';

console.log('=== MongoDB Authentication Diagnostics ===\n');

async function diagnose() {
    console.log('Test 1: Attempting connection without authentication...');
    const client = new MongoClient(adminUri);

    try {
        await client.connect();
        console.log('[ERROR] Connected WITHOUT authentication!');
        console.log('This means authentication is NOT properly enabled.\n');
        console.log('Checking MongoDB configuration...');
        await client.close();

        console.log('\nRECOMMENDATION:');
        console.log('1. Verify mongod.cfg has "authorization: enabled"');
        console.log('2. Restart MongoDB service again');
        console.log('3. Run this test again');
        return false;
    } catch (err) {
        if (err.message.includes('Authentication failed') || err.message.includes('auth')) {
            console.log('[OK] Authentication is required (as expected)\n');
        } else {
            console.log('[OK] Cannot connect without auth (good)\n');
        }
        await client.close();
    }

    console.log('Test 2: Attempting connection WITH authentication...');
    const authClient = new MongoClient(devUri);

    try {
        await authClient.connect();
        console.log('[OK] Successfully authenticated as nocturnaldev!\n');

        const db = authClient.db('nocturnal_dev');

        // Test operations
        console.log('Test 3: Testing database operations...');
        const testColl = db.collection('_auth_test');

        await testColl.insertOne({ test: true, timestamp: new Date() });
        console.log('[OK] Write permission verified');

        const doc = await testColl.findOne({ test: true });
        console.log('[OK] Read permission verified');

        await testColl.deleteOne({ test: true });
        console.log('[OK] Delete permission verified\n');

        console.log('=== ALL TESTS PASSED ===\n');
        console.log('MongoDB authentication is working correctly!');
        console.log('Your application should now work with: npm start\n');

        await authClient.close();
        return true;
    } catch (err) {
        console.log('[ERROR] Authentication failed:', err.message, '\n');

        if (err.message.includes('Authentication failed')) {
            console.log('DIAGNOSIS: User exists but password is wrong, or user needs to be recreated.\n');
            console.log('This can happen if users were created before authentication was enabled.\n');
            console.log('SOLUTION: Recreate users with authentication enabled.');
            console.log('Run: node recreate-users-with-auth.js\n');
        } else {
            console.log('Error details:', err);
        }

        await authClient.close();
        return false;
    }
}

diagnose().catch(console.error);
