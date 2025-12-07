/**
 * Recreate Development and Production Users
 * Using Admin Credentials
 */

const { MongoClient } = require('mongodb');

const ADMIN_PASSWORD = 'NocturnalAdmin2025!Secure';
const DEV_PASSWORD = 'DevPass2025!ChangeMe';
const PROD_PASSWORD = 'ProdPass2025!VeryStrong';

const adminUri = `mongodb://admin:${ADMIN_PASSWORD}@localhost:27017/admin?authSource=admin`;

console.log('=== Recreating Development and Production Users ===\n');

async function recreateUsers() {
    const client = new MongoClient(adminUri);

    try {
        console.log('Connecting as admin...');
        await client.connect();
        console.log('[OK] Connected as admin\n');

        // Recreate development user
        console.log('Step 1: Recreating development user...');
        const devDb = client.db('nocturnal_dev');

        try {
            await devDb.command({ dropUser: 'nocturnaldev' });
            console.log('[OK] Dropped existing dev user');
        } catch (err) {
            console.log('[INFO] Dev user did not exist');
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
            console.log('[SUCCESS] Development user created!\n');
        } catch (err) {
            console.log('[ERROR] Failed to create dev user:', err.message, '\n');
        }

        // Recreate production user
        console.log('Step 2: Recreating production user...');
        const prodDb = client.db('nocturnal_prod');

        try {
            await prodDb.command({ dropUser: 'nocturnalprod' });
            console.log('[OK] Dropped existing prod user');
        } catch (err) {
            console.log('[INFO] Prod user did not exist');
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
            console.log('[SUCCESS] Production user created!\n');
        } catch (err) {
            console.log('[ERROR] Failed to create prod user:', err.message, '\n');
        }

        // Verify users were created
        console.log('Step 3: Verifying users...\n');

        const adminDb = client.db('admin');

        console.log('Users in nocturnal_dev:');
        try {
            const devUsers = await devDb.command({ usersInfo: 1 });
            devUsers.users.forEach(u => {
                console.log(`  - ${u.user}`);
                console.log(`    Roles:`, u.roles.map(r => `${r.role}@${r.db}`).join(', '));
            });
        } catch (err) {
            console.log('  Could not list users:', err.message);
        }

        console.log('\nUsers in nocturnal_prod:');
        try {
            const prodUsers = await prodDb.command({ usersInfo: 1 });
            prodUsers.users.forEach(u => {
                console.log(`  - ${u.user}`);
                console.log(`    Roles:`, u.roles.map(r => `${r.role}@${r.db}`).join(', '));
            });
        } catch (err) {
            console.log('  Could not list users:', err.message);
        }

        console.log('\n=== Users Recreated Successfully ===\n');
        console.log('Credentials:');
        console.log('─────────────────────────────────────');
        console.log('Development:');
        console.log(`  User: nocturnaldev`);
        console.log(`  Pass: ${DEV_PASSWORD}`);
        console.log(`  DB:   nocturnal_dev`);
        console.log('');
        console.log('Production:');
        console.log(`  User: nocturnalprod`);
        console.log(`  Pass: ${PROD_PASSWORD}`);
        console.log(`  DB:   nocturnal_prod`);
        console.log('─────────────────────────────────────\n');
        console.log('Now test the connection:');
        console.log('  node test-mongo-connection.js\n');

        await client.close();

    } catch (err) {
        console.log('[ERROR]', err.message);
        await client.close();
        process.exit(1);
    }
}

recreateUsers().catch(console.error);
