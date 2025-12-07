/**
 * MongoDB Sharding Strategy Configuration
 *
 * This file defines the sharding strategy for the Nocturnal platform.
 * Sharding is used to horizontally partition data across multiple servers
 * for improved read/write performance and storage capacity.
 *
 * IMPORTANT: Sharding should only be implemented when:
 * 1. Database size exceeds 1TB
 * 2. Single server cannot handle write load
 * 3. Working set no longer fits in RAM
 */

const logger = require('../utils/logger');

/**
 * Sharding Configuration
 *
 * Collections to shard and their shard keys
 */
const SHARDING_CONFIG = {
  // Duties collection - High write volume, time-series data
  duties: {
    enabled: true,
    shardKey: { date: 1, _id: 1 }, // Range-based sharding by date
    explanation: 'Duties are sharded by date to distribute recent (hot) and old (cold) data across shards. Compound key with _id ensures uniqueness.',
    strategy: 'ranged', // 'ranged' or 'hashed'
    zones: [
      {
        name: 'recent',
        min: { date: new Date('2024-01-01'), _id: { $minKey: 1 } },
        max: { date: new Date('2025-12-31'), _id: { $maxKey: 1 } },
        shards: ['shard0', 'shard1'], // Hot data on faster shards
        description: 'Recent duties (current and upcoming)'
      },
      {
        name: 'archive',
        min: { date: new Date('2020-01-01'), _id: { $minKey: 1 } },
        max: { date: new Date('2023-12-31'), _id: { $maxKey: 1 } },
        shards: ['shard2', 'shard3'], // Cold data on archive shards
        description: 'Historical duties (completed/archived)'
      }
    ]
  },

  // Applications collection - High write volume
  applications: {
    enabled: true,
    shardKey: { applicant: 'hashed' }, // Hash-based sharding by applicant
    explanation: 'Applications are sharded by hashed applicant ID to evenly distribute load. Most queries filter by applicant or duty.',
    strategy: 'hashed',
    zones: [] // No zone sharding for hashed collections
  },

  // Payments collection - Medium write volume, financial data
  payments: {
    enabled: true,
    shardKey: { doctor: 1, shiftDate: 1 }, // Range-based by doctor and date
    explanation: 'Payments sharded by doctor ID and shift date. Queries typically filter by doctor for earnings reports.',
    strategy: 'ranged',
    zones: []
  },

  // Messages collection - High write volume, time-series
  messages: {
    enabled: true,
    shardKey: { conversation: 'hashed' }, // Hash-based by conversation
    explanation: 'Messages sharded by hashed conversation ID to distribute load evenly across conversations.',
    strategy: 'hashed',
    zones: []
  },

  // Notifications collection - Very high write volume
  notifications: {
    enabled: true,
    shardKey: { user: 1, createdAt: 1 }, // Range-based by user and time
    explanation: 'Notifications sharded by user and creation time. Queries always filter by user. TTL index auto-deletes old notifications.',
    strategy: 'ranged',
    zones: []
  },

  // Analytics collections - Large documents, infrequent updates
  doctoranalytics: {
    enabled: false, // Enable only when user count exceeds 100k
    shardKey: { user: 'hashed' },
    explanation: 'Analytics sharded by hashed user ID. Each document is large but queries are always by single user.',
    strategy: 'hashed',
    zones: []
  },

  hospitalanalytics: {
    enabled: false, // Enable only when hospital count exceeds 10k
    shardKey: { user: 'hashed' },
    explanation: 'Hospital analytics sharded by hashed user ID.',
    strategy: 'hashed',
    zones: []
  },

  // Users collection - Low write volume, critical data
  users: {
    enabled: false, // Do NOT shard unless absolutely necessary
    shardKey: { email: 'hashed' },
    explanation: 'Users should NOT be sharded unless user count exceeds 10 million. Authentication queries are always by email.',
    strategy: 'hashed',
    zones: []
  },

  // Reviews collection - Medium write volume
  reviews: {
    enabled: true,
    shardKey: { reviewedUser: 'hashed' },
    explanation: 'Reviews sharded by hashed reviewedUser ID to evenly distribute. Most queries are by reviewedUser.',
    strategy: 'hashed',
    zones: []
  }
};

/**
 * Shard Cluster Configuration
 */
const CLUSTER_CONFIG = {
  configServers: [
    'config1.nocturnal.com:27019',
    'config2.nocturnal.com:27019',
    'config3.nocturnal.com:27019'
  ],

  shards: [
    {
      id: 'shard0',
      replicas: [
        'shard0-primary.nocturnal.com:27018',
        'shard0-secondary1.nocturnal.com:27018',
        'shard0-secondary2.nocturnal.com:27018'
      ],
      zone: 'recent',
      description: 'Hot data shard - Recent duties, active users'
    },
    {
      id: 'shard1',
      replicas: [
        'shard1-primary.nocturnal.com:27018',
        'shard1-secondary1.nocturnal.com:27018',
        'shard1-secondary2.nocturnal.com:27018'
      ],
      zone: 'recent',
      description: 'Hot data shard - Recent duties, active users'
    },
    {
      id: 'shard2',
      replicas: [
        'shard2-primary.nocturnal.com:27018',
        'shard2-secondary1.nocturnal.com:27018',
        'shard2-secondary2.nocturnal.com:27018'
      ],
      zone: 'archive',
      description: 'Cold data shard - Historical duties, archived data'
    },
    {
      id: 'shard3',
      replicas: [
        'shard3-primary.nocturnal.com:27018',
        'shard3-secondary1.nocturnal.com:27018',
        'shard3-secondary2.nocturnal.com:27018'
      ],
      zone: 'archive',
      description: 'Cold data shard - Historical duties, archived data'
    }
  ],

  mongosRouters: [
    'mongos1.nocturnal.com:27017',
    'mongos2.nocturnal.com:27017',
    'mongos3.nocturnal.com:27017'
  ]
};

/**
 * Generate MongoDB shell commands to enable sharding
 */
const generateShardingCommands = () => {
  const commands = [];

  commands.push('// Enable sharding on database');
  commands.push('sh.enableSharding("nocturnal");');
  commands.push('');

  // Generate shard commands for each collection
  Object.entries(SHARDING_CONFIG).forEach(([collection, config]) => {
    if (config.enabled) {
      commands.push(`// Shard ${collection} collection`);
      commands.push(`// Strategy: ${config.strategy}`);
      commands.push(`// Explanation: ${config.explanation}`);

      // Shard collection command
      const shardKeyStr = JSON.stringify(config.shardKey).replace(/"/g, '');
      commands.push(`sh.shardCollection("nocturnal.${collection}", ${shardKeyStr});`);

      // Add zone sharding if defined
      if (config.zones && config.zones.length > 0) {
        commands.push(`// Configure zone sharding for ${collection}`);

        config.zones.forEach(zone => {
          // Add shards to zone
          zone.shards.forEach(shard => {
            commands.push(`sh.addShardToZone("${shard}", "${zone.name}");`);
          });

          // Define zone range
          const minStr = JSON.stringify(zone.min);
          const maxStr = JSON.stringify(zone.max);
          commands.push(`sh.updateZoneKeyRange("nocturnal.${collection}", ${minStr}, ${maxStr}, "${zone.name}");`);
        });
      }

      commands.push('');
    }
  });

  return commands.join('\n');
};

/**
 * Check if sharding is needed based on current metrics
 */
const assessShardingNeed = async (metrics) => {
  const recommendations = [];

  // Check database size
  if (metrics.dbSize > 1024 * 1024 * 1024 * 1024) { // > 1TB
    recommendations.push({
      priority: 'HIGH',
      reason: 'Database size exceeds 1TB',
      action: 'Enable sharding for duties, applications, and payments collections'
    });
  }

  // Check write throughput
  if (metrics.writeOpsPerSecond > 10000) {
    recommendations.push({
      priority: 'HIGH',
      reason: 'Write throughput exceeds 10,000 ops/sec',
      action: 'Enable sharding to distribute write load'
    });
  }

  // Check working set size vs RAM
  if (metrics.workingSetSize > metrics.availableRAM * 0.8) {
    recommendations.push({
      priority: 'MEDIUM',
      reason: 'Working set size exceeds 80% of available RAM',
      action: 'Consider sharding to distribute data across multiple servers'
    });
  }

  // Check individual collection sizes
  if (metrics.collections) {
    Object.entries(metrics.collections).forEach(([name, size]) => {
      if (size > 100 * 1024 * 1024 * 1024) { // > 100GB
        const config = SHARDING_CONFIG[name];
        if (config && !config.enabled) {
          recommendations.push({
            priority: 'MEDIUM',
            reason: `${name} collection exceeds 100GB`,
            action: `Enable sharding for ${name} collection`
          });
        }
      }
    });
  }

  return {
    needsSharding: recommendations.length > 0,
    recommendations
  };
};

/**
 * Best Practices for Sharding
 */
const BEST_PRACTICES = {
  shardKey: [
    'Choose shard key that appears in most queries',
    'Ensure shard key has high cardinality',
    'Avoid monotonically increasing shard keys (like timestamps alone)',
    'Compound shard keys should put high-cardinality field first',
    'Consider query patterns when choosing hashed vs ranged'
  ],

  operations: [
    'Use targeted queries that include shard key',
    'Avoid broadcast queries that hit all shards',
    'Use write concern "majority" for important writes',
    'Monitor shard distribution with sh.status()',
    'Balance chunks during low-traffic periods'
  ],

  monitoring: [
    'Track chunk distribution across shards',
    'Monitor balancer activity',
    'Watch for jumbo chunks that cannot be split',
    'Monitor network traffic between shards',
    'Check for hot shards receiving disproportionate load'
  ],

  maintenance: [
    'Backup config servers separately',
    'Test failover procedures regularly',
    'Plan for shard addition/removal',
    'Monitor disk space on each shard',
    'Keep MongoDB versions consistent across cluster'
  ]
};

/**
 * Initialize sharding (run only once during setup)
 */
const initializeSharding = async () => {
  try {
    logger.info('Generating sharding commands...');
    const commands = generateShardingCommands();

    logger.info('Sharding commands generated. Execute these in MongoDB shell:');
    logger.info(commands);

    return {
      success: true,
      commands,
      config: SHARDING_CONFIG,
      cluster: CLUSTER_CONFIG
    };
  } catch (error) {
    logger.error('Error initializing sharding:', error);
    throw error;
  }
};

module.exports = {
  SHARDING_CONFIG,
  CLUSTER_CONFIG,
  BEST_PRACTICES,
  generateShardingCommands,
  assessShardingNeed,
  initializeSharding
};
