/**
 * Rename MongoDB database from noctural to nocturnal.
 *
 * Usage:
 *   MONGODB_ADMIN_URI=mongodb://localhost:27017 node scripts/rename-database.js
 *
 * Optional:
 *   OLD_DB_NAME=noctural_dev
 *   NEW_DB_NAME=nocturnal_dev
 *   NEW_DB_USER=<user>
 *   NEW_DB_PASSWORD=<password>
 */

const { MongoClient } = require('mongodb');

const MONGO_URL = process.env.MONGODB_ADMIN_URI || 'mongodb://localhost:27017';
const OLD_DB_NAME = process.env.OLD_DB_NAME || 'noctural_dev';
const NEW_DB_NAME = process.env.NEW_DB_NAME || 'nocturnal_dev';
const NEW_AUTH_DB = process.env.NEW_AUTH_DB || NEW_DB_NAME;
const NEW_DB_USER = process.env.NEW_DB_USER;
const NEW_DB_PASSWORD = process.env.NEW_DB_PASSWORD;

if (NEW_DB_USER && !NEW_DB_PASSWORD) {
  console.error('NEW_DB_PASSWORD is required when NEW_DB_USER is set.');
  process.exit(1);
}

async function copyCollection(oldDb, newDb, collection) {
  console.log(`  Copying collection: ${collection.name}...`);

  const oldCollection = oldDb.collection(collection.name);
  const newCollection = newDb.collection(collection.name);
  const documents = await oldCollection.find({}).toArray();

  if (documents.length > 0) {
    await newCollection.insertMany(documents);
    console.log(`  Copied ${documents.length} documents`);
  } else {
    console.log('  Collection is empty');
  }

  const indexes = await oldCollection.indexes();
  for (const index of indexes) {
    if (index.name === '_id_') {
      continue;
    }

    const { key, name: indexName, ...indexOptions } = index;
    try {
      await newCollection.createIndex(key, {
        ...indexOptions,
        name: indexName
      });
      console.log(`  Created index: ${indexName}`);
    } catch (error) {
      console.log(`  Index ${indexName} skipped: ${error.message}`);
    }
  }
}

async function maybeCreateDatabaseUser(newDb) {
  if (!NEW_DB_USER) {
    console.log('\nSkipping user creation. Set NEW_DB_USER and NEW_DB_PASSWORD to create a database user.');
    return;
  }

  console.log(`\nCreating database user for ${NEW_DB_NAME}...`);
  try {
    await newDb.command({
      createUser: NEW_DB_USER,
      pwd: NEW_DB_PASSWORD,
      roles: [
        { role: 'readWrite', db: NEW_DB_NAME }
      ]
    });
    console.log(`User '${NEW_DB_USER}' created successfully`);
  } catch (error) {
    if (error.code === 51003) {
      console.log(`User '${NEW_DB_USER}' already exists`);
      return;
    }

    throw error;
  }
}

function printNextSteps() {
  console.log('\n' + '='.repeat(80));
  console.log('DATABASE RENAME COMPLETE');
  console.log('='.repeat(80));
  console.log('\nNEXT STEPS:');
  console.log('1. Update your .env file with the new database name:');

  if (NEW_DB_USER) {
    console.log(`   MONGODB_URI=mongodb://${NEW_DB_USER}:<NEW_DB_PASSWORD>@localhost:27017/${NEW_DB_NAME}?authSource=${NEW_AUTH_DB}`);
  } else {
    console.log(`   MONGODB_URI=mongodb://<user>:<password>@localhost:27017/${NEW_DB_NAME}?authSource=${NEW_AUTH_DB}`);
  }

  console.log('\n2. Test the application with the new database');
  console.log('\n3. After verifying everything works, drop the old database manually if appropriate:');
  console.log(`   mongosh
   use ${OLD_DB_NAME}
   db.dropDatabase()`);
  console.log('\n4. Remove old database users manually if appropriate.');
  console.log('='.repeat(80));
}

async function renameDatabase() {
  const client = new MongoClient(MONGO_URL);

  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('Connected to MongoDB\n');

    console.log(`Listing collections in ${OLD_DB_NAME}...`);
    const oldDb = client.db(OLD_DB_NAME);
    const collections = await oldDb.listCollections().toArray();
    console.log(`Found ${collections.length} collections:\n`, collections.map((collection) => collection.name).join(', '));

    console.log(`\nCopying database ${OLD_DB_NAME} to ${NEW_DB_NAME}...`);
    const newDb = client.db(NEW_DB_NAME);

    for (const collection of collections) {
      await copyCollection(oldDb, newDb, collection);
    }

    console.log('\nVerifying data transfer...');
    for (const collection of collections) {
      const oldCount = await oldDb.collection(collection.name).countDocuments();
      const newCount = await newDb.collection(collection.name).countDocuments();

      if (oldCount === newCount) {
        console.log(`  ${collection.name}: ${oldCount} documents`);
      } else {
        console.log(`  ${collection.name}: mismatch. Old: ${oldCount}, New: ${newCount}`);
      }
    }

    await maybeCreateDatabaseUser(newDb);
    printNextSteps();
  } catch (error) {
    console.error('Error during database rename:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB');
  }
}

renameDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});
