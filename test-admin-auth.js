/**
 * Test Admin Authentication
 */

const { MongoClient } = require('mongodb');

const ADMIN_PASSWORD = 'NocturnalAdmin2025!Secure';
const adminAuthUri = `mongodb://admin:${ADMIN_PASSWORD}@localhost:27017/admin?authSource=admin`;
const adminNoAuthUri = 'mongodb://localhost:27017/admin';

console.log('=== Testing Admin Authentication ===\n');

async function testAdminAuth() {
    console.log('Test 1: Connect WITH admin credentials...');
    const authClient = new MongoClient(adminAuthUri);

    try {
        await authClient.connect();
        const adminDb = authClient.db('admin');

        // Try a command
        await adminDb.command({ ping: 1 });
        console.log('[SUCCESS] Admin authentication works!\n');

        // List users
        try {
            const users = await adminDb.command({ usersInfo: 1 });
            console.log(`Found ${users.users.length} users:`);
            users.users.forEach(u => {
                console.log(`  - ${u.user} in database: ${u.db}`);
                console.log(`    Roles:`, u.roles.map(r => `${r.role}@${r.db}`).join(', '));
            });
        } catch (err) {
            console.log('Could not list users:', err.message);
        }

        console.log('\n[CONCLUSION] Authentication IS enabled and working!');
        console.log('The issue is likely with the DEV user credentials.\n');

        await authClient.close();
        return true;

    } catch (err) {
        console.log('[FAILED] Admin auth failed:', err.message, '\n');
        await authClient.close();
    }

    console.log('Test 2: Connect WITHOUT credentials...');
    const noAuthClient = new MongoClient(adminNoAuthUri);

    try {
        await noAuthClient.connect();
        const adminDb = noAuthClient.db('admin');

        // Try a command that requires auth
        try {
            await adminDb.command({ listDatabases: 1 });
            console.log('[PROBLEM] No authentication required - auth is NOT working!\n');
            await noAuthClient.close();
            return false;
        } catch (err) {
            if (err.message.includes('auth') || err.message.includes('unauthorized')) {
                console.log('[GOOD] Authentication required (as expected)\n');
            }
        }

        await noAuthClient.close();
    } catch (err) {
        console.log('Connection without auth failed (good):', err.message, '\n');
    }
}

testAdminAuth().catch(console.error);
