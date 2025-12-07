/**
 * Script to rename MongoDB database from noctural to nocturnal
 * This script will:
 * 1. Copy all collections from old database to new database
 * 2. Create new users for the new database
 * 3. Verify the data transfer
 *
 * Run: node scripts/rename-database.js
 */

const { MongoClient } = require('mongodb');

// Configuration
const MONGO_URL = 'mongodb://localhost:27017';
const OLD_DB_NAME = 'noctural_dev';
const NEW_DB_NAME = 'nocturnal_dev';
const OLD_AUTH_DB = 'noctural_dev';
const NEW_AUTH_DB = 'nocturnal_dev';

// User credentials
const ADMIN_USER = 'nocturnaldev';
const ADMIN_PASS = 'DevPass2025!ChangeMe';

async function renameDatabase() {
  const client = new MongoClient(MONGO_URL);

  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const adminDb = client.db('admin');

    // Step 1: List all collections in old database
    console.log(`📋 Listing collections in ${OLD_DB_NAME}...`);
    const oldDb = client.db(OLD_DB_NAME);
    const collections = await oldDb.listCollections().toArray();
    console.log(`Found ${collections.length} collections:\n`, collections.map(c => c.name).join(', '));

    // Step 2: Copy database using copyDatabase (MongoDB < 4.2) or copydb command
    console.log(`\n📦 Copying database ${OLD_DB_NAME} to ${NEW_DB_NAME}...`);

    const newDb = client.db(NEW_DB_NAME);

    // Copy each collection
    for (const collection of collections) {
      console.log(`  Copying collection: ${collection.name}...`);

      const oldCollection = oldDb.collection(collection.name);
      const newCollection = newDb.collection(collection.name);

      // Get all documents
      const documents = await oldCollection.find({}).toArray();

      if (documents.length > 0) {
        await newCollection.insertMany(documents);
        console.log(`  ✅ Copied ${documents.length} documents`);
      } else {
        console.log(`  ℹ️  Collection is empty`);
      }

      // Copy indexes
      const indexes = await oldCollection.indexes();
      for (const index of indexes) {
        if (index.name !== '_id_') {
          const { name, ...indexSpec } = index;
          try {
            await newCollection.createIndex(indexSpec.key, {
              name: indexSpec.name,
              ...indexSpec
            });
            console.log(`  ✅ Created index: ${indexSpec.name}`);
          } catch (err) {
            console.log(`  ⚠️  Index ${indexSpec.name} already exists`);
          }
        }
      }
    }

    // Step 3: Verify data
    console.log(`\n🔍 Verifying data transfer...`);
    for (const collection of collections) {
      const oldCount = await oldDb.collection(collection.name).countDocuments();
      const newCount = await newDb.collection(collection.name).countDocuments();

      if (oldCount === newCount) {
        console.log(`  ✅ ${collection.name}: ${oldCount} documents`);
      } else {
        console.log(`  ❌ ${collection.name}: Mismatch! Old: ${oldCount}, New: ${newCount}`);
      }
    }

    // Step 4: Create new database user
    console.log(`\n👤 Creating database user for ${NEW_DB_NAME}...`);
    try {
      await newDb.command({
        createUser: ADMIN_USER,
        pwd: ADMIN_PASS,
        roles: [
          { role: 'readWrite', db: NEW_DB_NAME }
        ]
      });
      console.log(`✅ User '${ADMIN_USER}' created successfully`);
    } catch (err) {
      if (err.code === 51003) {
        console.log(`⚠️  User '${ADMIN_USER}' already exists`);
      } else {
        throw err;
      }
    }

    // Step 5: Instructions
    console.log('\n' + '='.repeat(80));
    console.log('✅ DATABASE RENAME COMPLETE!');
    console.log('='.repeat(80));
    console.log('\n📝 NEXT STEPS:');
    console.log('1. Update your .env file with the new database name:');
    console.log(`   MONGODB_URI=mongodb://${ADMIN_USER}:${ADMIN_PASS}@localhost:27017/${NEW_DB_NAME}?authSource=${NEW_AUTH_DB}`);
    console.log('\n2. Test the application with the new database');
    console.log('\n3. After verifying everything works, you can drop the old database:');
    console.log(`   mongosh
   use ${OLD_DB_NAME}
   db.dropDatabase()`);
    console.log('\n4. Remove old database user (if exists):');
    console.log(`   mongosh
   use admin
   db.dropUser("nocturaldev")`);
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error during database rename:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
renameDatabase().catch(console.error);
