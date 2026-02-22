// MongoDB initialization script
// This runs when MongoDB container is first created
//
// Required environment variables:
//   MONGO_APP_USER     - Application database username
//   MONGO_APP_PASSWORD - Application database password
//
// Pass these via docker-compose environment or --env flags.

const appUser = process.env.MONGO_APP_USER;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!appUser || !appPassword) {
  print('ERROR: MONGO_APP_USER and MONGO_APP_PASSWORD environment variables are required.');
  quit(1);
}

db = db.getSiblingDB('nocturnal');

// Create application user
db.createUser({
  user: appUser,
  pwd: appPassword,
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
