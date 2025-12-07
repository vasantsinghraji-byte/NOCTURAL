/**
 * MongoDB Connection Test Script
 *
 * Tests MongoDB connection with authentication
 * Run with: node test-mongo-connection.js
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

console.log('=== MongoDB Connection Test ===\n');
console.log('Testing connection to MongoDB with authentication...\n');
console.log('Connection string:', uri.replace(/:[^:@]+@/, ':****@'), '\n');

async function testConnection() {
    const client = new MongoClient(uri);

    try {
        // Connect to MongoDB
        console.log('Attempting to connect...');
        await client.connect();
        console.log('✓ Successfully connected to MongoDB!\n');

        // Get database
        const dbName = new URL(uri).pathname.substring(1).split('?')[0];
        const db = client.db(dbName);

        console.log(`Database: ${dbName}`);

        // Test database operations
        console.log('\nTesting database operations...');

        // List collections
        const collections = await db.listCollections().toArray();
        console.log(`✓ Found ${collections.length} collections`);
        if (collections.length > 0) {
            console.log('  Collections:', collections.map(c => c.name).join(', '));
        }

        // Test write permission
        console.log('\n✓ Testing write permission...');
        const testCollection = db.collection('_connection_test');
        await testCollection.insertOne({ test: true, timestamp: new Date() });
        console.log('  ✓ Write successful');

        // Test read permission
        console.log('\n✓ Testing read permission...');
        const doc = await testCollection.findOne({ test: true });
        console.log('  ✓ Read successful');

        // Clean up test document
        await testCollection.deleteOne({ test: true });
        console.log('  ✓ Cleanup successful');

        console.log('\n=== All Tests Passed ===\n');
        console.log('MongoDB authentication is working correctly!');
        console.log('You can now start your application with: npm start\n');

    } catch (err) {
        console.error('\n✗ Connection failed!\n');
        console.error('Error:', err.message);
        console.error('\nCommon issues:');
        console.error('1. MongoDB authentication not enabled yet');
        console.error('   → Run: powershell -File enable-mongodb-auth.ps1 (as Admin)');
        console.error('   → Or follow: enable-mongodb-auth-manual.txt');
        console.error('2. Wrong username or password');
        console.error('   → Check .env file credentials match created users');
        console.error('3. MongoDB service not running');
        console.error('   → Run: net start MongoDB');
        console.error('4. Wrong database name or authSource');
        console.error('   → Check connection string format\n');
        process.exit(1);
    } finally {
        await client.close();
        console.log('Disconnected from MongoDB');
    }
}

testConnection().catch(console.error);
