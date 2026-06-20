const mongoose = require('mongoose');

const DIRECT_URI = process.env.MONGODB_REPLICA_TEST_DIRECT_URI ||
  'mongodb://localhost:27018/admin?directConnection=true';
const REPLICA_SET = process.env.MONGODB_REPLICA_TEST_SET || 'nocturnal-test-rs';
const MEMBER_HOST = process.env.MONGODB_REPLICA_TEST_HOST || 'localhost:27018';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function connectWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      return await mongoose.createConnection(DIRECT_URI, {
        serverSelectionTimeoutMS: 2000
      }).asPromise();
    } catch (error) {
      lastError = error;
      await sleep(1000);
    }
  }
  throw lastError;
}

async function run() {
  const connection = await connectWithRetry();
  try {
    try {
      await connection.db.admin().command({ replSetGetStatus: 1 });
    } catch (error) {
      if (error.codeName !== 'NotYetInitialized') throw error;
      await connection.db.admin().command({
        replSetInitiate: {
          _id: REPLICA_SET,
          members: [{ _id: 0, host: MEMBER_HOST }]
        }
      });
    }

    for (let attempt = 1; attempt <= 30; attempt++) {
      const status = await connection.db.admin().command({ replSetGetStatus: 1 });
      if (status.myState === 1) {
        console.log(`Replica set ${REPLICA_SET} is PRIMARY at ${MEMBER_HOST}`);
        return;
      }
      await sleep(1000);
    }
    throw new Error(`Replica set ${REPLICA_SET} did not elect a primary`);
  } finally {
    await connection.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
