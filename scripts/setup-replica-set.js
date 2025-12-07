/**
 * MongoDB Replica Set Setup Script
 *
 * This script initializes a MongoDB replica set for production deployment.
 * Replica sets provide:
 * - High availability through automatic failover
 * - Data redundancy
 * - Read scaling capabilities
 * - Zero-downtime maintenance
 *
 * Prerequisites:
 * - Multiple MongoDB instances running on different servers/ports
 * - Network connectivity between all instances
 * - MongoDB authentication configured
 *
 * Usage:
 *   node scripts/setup-replica-set.js
 */

const mongoose = require('mongoose');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.blue}→${colors.reset} ${msg}`)
};

/**
 * Default replica set configuration
 * Customize this for your production environment
 */
const getReplicaSetConfig = () => {
  // Get configuration from environment variables or use defaults
  const replicaSetName = process.env.MONGODB_REPLICA_SET || 'noctural-rs0';

  const members = [
    {
      _id: 0,
      host: process.env.MONGODB_RS_HOST_1 || 'localhost:27017',
      priority: 2, // Primary preference
      tags: { datacenter: 'dc1', region: 'primary' }
    },
    {
      _id: 1,
      host: process.env.MONGODB_RS_HOST_2 || 'localhost:27018',
      priority: 1, // Secondary
      tags: { datacenter: 'dc1', region: 'secondary' }
    },
    {
      _id: 2,
      host: process.env.MONGODB_RS_HOST_3 || 'localhost:27019',
      priority: 1, // Secondary
      tags: { datacenter: 'dc2', region: 'dr' }
    }
  ];

  // Add arbiter if configured (lightweight instance for voting only)
  if (process.env.MONGODB_RS_ARBITER) {
    members.push({
      _id: members.length,
      host: process.env.MONGODB_RS_ARBITER,
      arbiterOnly: true
    });
  }

  return {
    _id: replicaSetName,
    members,
    settings: {
      // Election timeout (how long to wait before starting a new election)
      electionTimeoutMillis: 10000,

      // Heartbeat interval (how often to check member health)
      heartbeatIntervalMillis: 2000,

      // Write concern
      getLastErrorDefaults: {
        w: 'majority',
        wtimeout: 5000
      }
    }
  };
};

/**
 * Initialize replica set
 */
async function initializeReplicaSet(connection, config) {
  try {
    log.step('Initializing replica set...');

    const adminDb = connection.db('admin');
    const result = await adminDb.admin().command({
      replSetInitiate: config
    });

    if (result.ok === 1) {
      log.success('Replica set initialized successfully');
      return true;
    } else {
      log.error(`Initialization failed: ${result.errmsg || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    if (error.code === 23) {
      log.warn('Replica set already initialized');
      return false;
    }
    throw error;
  }
}

/**
 * Get replica set status
 */
async function getReplicaSetStatus(connection) {
  try {
    const adminDb = connection.db('admin');
    const status = await adminDb.admin().command({ replSetGetStatus: 1 });
    return status;
  } catch (error) {
    log.error(`Failed to get replica set status: ${error.message}`);
    return null;
  }
}

/**
 * Add member to replica set
 */
async function addMember(connection, memberConfig) {
  try {
    const adminDb = connection.db('admin');

    // Get current config
    const config = await adminDb.admin().command({ replSetGetConfig: 1 });
    const rsConfig = config.config;

    // Add new member
    rsConfig.version++;
    rsConfig.members.push(memberConfig);

    // Reconfigure
    await adminDb.admin().command({ replSetReconfig: rsConfig });

    log.success(`Added member: ${memberConfig.host}`);
    return true;
  } catch (error) {
    log.error(`Failed to add member: ${error.message}`);
    return false;
  }
}

/**
 * Display replica set status
 */
function displayReplicaSetStatus(status) {
  console.log('\n' + '='.repeat(70));
  console.log('  REPLICA SET STATUS');
  console.log('='.repeat(70) + '\n');

  console.log(`Replica Set: ${status.set}`);
  console.log(`Date: ${status.date}`);
  console.log(`My State: ${status.myState}\n`);

  console.log('Members:');
  status.members.forEach(member => {
    const state = member.stateStr;
    const health = member.health === 1 ? '✓' : '✗';
    const role = member.state === 1 ? ' (PRIMARY)' : member.state === 2 ? ' (SECONDARY)' : '';

    console.log(`  ${health} ${member.name} - ${state}${role}`);
    console.log(`     Uptime: ${member.uptime}s`);
    console.log(`     Ping: ${member.pingMs}ms`);

    if (member.optimeDate) {
      console.log(`     Last Heartbeat: ${member.optimeDate}`);
    }
    console.log('');
  });
}

/**
 * Main setup function
 */
async function setupReplicaSet() {
  console.log('\n' + '='.repeat(70));
  console.log('  MONGODB REPLICA SET SETUP');
  console.log('='.repeat(70) + '\n');

  let connection;

  try {
    // Get connection URI
    const primaryUri = process.env.MONGODB_PRIMARY_URI || 'mongodb://localhost:27017';

    log.step('Step 1: Connecting to primary MongoDB instance...');
    log.info(`Connection URI: ${primaryUri.replace(/\/\/(.+):(.+)@/, '//$1:****@')}`);

    connection = await mongoose.createConnection(primaryUri, {
      serverSelectionTimeoutMS: 5000,
      directConnection: true // Connect directly, not through replica set
    }).asPromise();

    log.success('Connected to MongoDB');

    // Get replica set configuration
    log.step('\nStep 2: Preparing replica set configuration...');
    const config = getReplicaSetConfig();

    console.log('\nReplica Set Configuration:');
    console.log(`  Name: ${config._id}`);
    console.log(`  Members: ${config.members.length}`);
    config.members.forEach(member => {
      const tags = member.arbiterOnly ? ' [ARBITER]' : ` [Priority: ${member.priority}]`;
      console.log(`    - ${member.host}${tags}`);
    });

    // Initialize replica set
    log.step('\nStep 3: Initializing replica set...');
    const initialized = await initializeReplicaSet(connection, config);

    if (initialized) {
      // Wait for replica set to stabilize
      log.info('Waiting for replica set to stabilize (30 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    // Get and display status
    log.step('\nStep 4: Checking replica set status...');
    const status = await getReplicaSetStatus(connection);

    if (status) {
      displayReplicaSetStatus(status);
    }

    // Close connection
    await connection.close();

    // Display summary
    console.log('='.repeat(70));
    console.log('  SETUP COMPLETE');
    console.log('='.repeat(70) + '\n');

    log.success('Replica set setup completed!\n');

    console.log('📝 NEXT STEPS:\n');
    console.log('1. Verify all members are healthy:');
    console.log('   mongosh --eval "rs.status()"\n');

    console.log('2. Update your connection string to use replica set:');
    console.log(`   mongodb://user:pass@host1:27017,host2:27018,host3:27019/${config._id}?replicaSet=${config._id}\n`);

    console.log('3. Update .env file:');
    console.log(`   MONGODB_URI=mongodb://user:pass@host1,host2,host3/noctural_prod?replicaSet=${config._id}&retryWrites=true&w=majority\n`);

    console.log('4. Test the application with replica set connection\n');

    console.log('5. Configure backups for all replica set members\n');

    log.warn('IMPORTANT:');
    log.warn('- Ensure all members can communicate with each other');
    log.warn('- Use odd number of voting members (3, 5, 7)');
    log.warn('- Place members in different data centers for redundancy');
    log.warn('- Monitor replica lag and member health\n');

  } catch (error) {
    log.error(`Setup failed: ${error.message}`);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        // Ignore close errors
      }
    }
  }
}

// Run setup
setupReplicaSet().catch(error => {
  log.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
