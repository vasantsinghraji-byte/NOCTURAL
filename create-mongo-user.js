const { MongoClient } = require('mongodb');

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
        pwd: 'DevPass2025!ChangeMe',
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
          pwd: 'DevPass2025!ChangeMe'
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
