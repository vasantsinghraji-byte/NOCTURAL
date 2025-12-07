// MongoDB initialization script
// This runs when MongoDB container is first created

db = db.getSiblingDB('nocturnal');

// Create application user
db.createUser({
  user: process.env.MONGO_APP_USER || 'nocturnalapp',
  pwd: process.env.MONGO_APP_PASSWORD || 'changeme',
  roles: [
    {
      role: 'readWrite',
      db: 'nocturnal'
    }
  ]
});

// Create indexes for better performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ verified: 1 });

db.duties.createIndex({ date: 1 });
db.duties.createIndex({ status: 1 });
db.duties.createIndex({ postedBy: 1 });
db.duties.createIndex({ 'requirements.specialization': 1 });

db.applications.createIndex({ duty: 1 });
db.applications.createIndex({ applicant: 1 });
db.applications.createIndex({ status: 1 });
db.applications.createIndex({ duty: 1, applicant: 1 }, { unique: true });

print('MongoDB initialization completed successfully');
