const { MongoClient } = require('mongodb');

// Load password from environment variable
const DEV_PASSWORD = process.env.MONGO_DEV_PASSWORD;
if (!DEV_PASSWORD) {
  console.error('ERROR: MONGO_DEV_PASSWORD environment variable is required.');
  console.error('Usage: MONGO_DEV_PASSWORD=<password> node create-mongo-user.js');
  process.exit(1);
}

async function createUser() {
  // Connect without auth first (to admin database)
  const client = new MongoClient('mongodb://localhost:27017', {
    directConnection: true
  });

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const adminDb = client.db('admin');

    // Try to create user
    try {
      await adminDb.command({
        createUser: 'nocturnaldev',
        pwd: DEV_PASSWORD,
        roles: [
          { role: 'readWrite', db: 'nocturnal_dev' },
          { role: 'dbAdmin', db: 'nocturnal_dev' }
        ]
      });
      console.log('✅ User created successfully!');
    } catch (err) {
      if (err.codeName === 'UserAlreadyExists') {
        console.log('User already exists. Trying to update password...');
        await adminDb.command({
          updateUser: 'nocturnaldev',
          pwd: DEV_PASSWORD
        });
        console.log('✅ Password updated successfully!');
      } else {
        throw err;
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nMongoDB might require authentication to be disabled first.');
    console.log('Try running MongoDB without auth: mongod --noauth');
  } finally {
    await client.close();
  }
}

createUser();
