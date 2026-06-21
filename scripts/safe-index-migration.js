const { spawnSync } = require('child_process');
const mongoose = require('mongoose');
require('dotenv').config();

const args = process.argv.slice(2);
const rollbackIndex = args.indexOf('--rollback');
const skipBackup = args.includes('--skip-backup');
const isProduction = process.env.NODE_ENV === 'production';

function runNode(script, scriptArgs = []) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) throw new Error(`${script} failed with exit code ${result.status}`);
}

async function preflight() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const admin = mongoose.connection.db.admin();
  await admin.command({ ping: 1 });
  const hello = await admin.command({ hello: 1 });
  if (!hello.setName && isProduction) {
    throw new Error('Production index migration requires a replica set');
  }
  const duplicateApplications = await mongoose.connection.db.collection('applications').aggregate([
    { $group: { _id: { duty: '$duty', applicant: '$applicant' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 }
  ]).toArray();
  if (duplicateApplications.length) throw new Error('Duplicate applications must be repaired before migration');
}

async function verify() {
  const required = {
    applications: ['duty_applicant_unique_idx'],
    idempotencykeys: ['scope_unique_idx', 'idempotency_ttl_idx'],
    healthmetrics: ['booking_metric_type_unique_idx'],
    healthrecords: ['booking_health_record_unique_idx'],
    bookingcompletionoutboxes: ['booking_completion_outbox_unique_idx'],
    notifications: ['notification_outbox_dedupe_idx']
  };
  for (const [collection, names] of Object.entries(required)) {
    const indexes = await mongoose.connection.db.collection(collection).indexes();
    const present = new Set(indexes.map(index => index.name));
    names.forEach(name => {
      if (!present.has(name)) throw new Error(`Post-migration verification failed: ${collection}.${name}`);
    });
    if (collection === 'applications' && present.has('duty_user_unique_idx')) {
      throw new Error('Post-migration verification failed: obsolete applications.duty_user_unique_idx remains');
    }
    if (collection === 'applications' && present.has('user_status_idx')) {
      throw new Error('Post-migration verification failed: obsolete applications.user_status_idx remains');
    }
    if (
      collection === 'applications'
      && !indexes.some(index => index.key?.applicant === 1 && index.key?.status === 1)
    ) {
      throw new Error('Post-migration verification failed: applications applicant/status index is missing');
    }
  }

  const refreshIndexes = await mongoose.connection.db.collection('refreshsessions').indexes();
  const hasKey = expected => refreshIndexes.some(index =>
    Object.entries(expected).every(([key, value]) => index.key?.[key] === value)
  );
  const ttlIndex = refreshIndexes.find(index => index.key?.expiresAt === 1);
  if (!ttlIndex || ttlIndex.expireAfterSeconds !== 0) {
    throw new Error('Post-migration verification failed: refresh-session TTL index is missing');
  }
  if (!hasKey({ userId: 1, userType: 1, revokedAt: 1 })) {
    throw new Error('Post-migration verification failed: refresh-session user lookup index is missing');
  }
  if (!hasKey({ familyId: 1, revokedAt: 1 })) {
    throw new Error('Post-migration verification failed: refresh-session family lookup index is missing');
  }

  const securityOutboxIndexes = await mongoose.connection.db.collection('securitynotificationoutboxes').indexes();
  if (!securityOutboxIndexes.some(index => index.key?.status === 1 && index.key?.nextAttemptAt === 1)) {
    throw new Error('Post-migration verification failed: security notification outbox lookup index is missing');
  }
  const outboxTtl = securityOutboxIndexes.find(index => index.key?.purgeAfter === 1);
  if (!outboxTtl || outboxTtl.expireAfterSeconds !== 0) {
    throw new Error('Post-migration verification failed: security notification outbox retention TTL index is missing');
  }
  const webAuthnIndexes = await mongoose.connection.db.collection('webauthnchallenges').indexes();
  const webAuthnTtl = webAuthnIndexes.find(index => index.key?.expiresAt === 1);
  if (!webAuthnTtl || webAuthnTtl.expireAfterSeconds !== 0) {
    throw new Error('Post-migration verification failed: WebAuthn challenge TTL index is missing');
  }
  const recoveryCodeIndexes = await mongoose.connection.db.collection('webauthnrecoverycodes').indexes();
  const recoveryCodeTtl = recoveryCodeIndexes.find(index => index.key?.expiresAt === 1);
  if (!recoveryCodeTtl || recoveryCodeTtl.expireAfterSeconds !== 0) {
    throw new Error('Post-migration verification failed: WebAuthn recovery-code TTL index is missing');
  }
  if (!recoveryCodeIndexes.some(index => index.key?.identityId === 1 && index.key?.identityType === 1 && index.key?.usedAt === 1 && index.key?.replacedAt === 1)) {
    throw new Error('Post-migration verification failed: WebAuthn recovery-code lookup index is missing');
  }
}

async function main() {
  if (rollbackIndex !== -1) {
    const backupPath = args[rollbackIndex + 1];
    if (!backupPath || process.env.ALLOW_DATABASE_RESTORE !== 'true') {
      throw new Error('Rollback requires a backup path and ALLOW_DATABASE_RESTORE=true');
    }
    runNode('scripts/backup-database.js', ['restore', backupPath]);
    return;
  }
  if (isProduction && process.env.CONFIRM_PRODUCTION_MIGRATION !== 'yes') {
    throw new Error('Set CONFIRM_PRODUCTION_MIGRATION=yes for production migrations');
  }
  await preflight();
  await mongoose.disconnect();
  if (!skipBackup) runNode('scripts/backup-database.js', ['backup']);
  runNode('scripts/add-indexes.js');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await verify();
  console.log('Index migration post-verification passed');
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
