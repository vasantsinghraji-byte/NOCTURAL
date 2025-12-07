#!/bin/bash
# MongoDB Replica Set Initialization Script
# This script initializes a MongoDB replica set for high availability

echo "Waiting for MongoDB to start..."
sleep 10

echo "Initializing MongoDB Replica Set..."

mongosh --host mongo1:27017 -u "${MONGO_INITDB_ROOT_USERNAME}" -p "${MONGO_INITDB_ROOT_PASSWORD}" --authenticationDatabase admin <<EOF
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "mongo1:27017", priority: 2 },
    { _id: 1, host: "mongo2:27017", priority: 1 },
    { _id: 2, host: "mongo3:27017", priority: 1, arbiterOnly: true }
  ]
});

// Wait for replica set to initialize
sleep(5000);

// Check status
rs.status();

// Create database and user
use nocturnal_prod;

db.createUser({
  user: "${MONGO_APP_USER}",
  pwd: "${MONGO_APP_PASSWORD}",
  roles: [
    { role: "readWrite", db: "nocturnal_prod" },
    { role: "dbAdmin", db: "nocturnal_prod" }
  ]
});

print("MongoDB Replica Set initialized successfully!");
EOF

echo "MongoDB Replica Set initialization complete!"
