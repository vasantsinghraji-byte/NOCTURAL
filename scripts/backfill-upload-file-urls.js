require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/user');
const storageConfig = require('../config/storage');

const WRITE_MODE = process.argv.includes('--write');
const BATCH_SIZE = Number(process.env.UPLOAD_URL_BACKFILL_BATCH_SIZE || 200);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

const log = {
  info: (message) => console.log(`${colors.cyan}i${colors.reset} ${message}`),
  success: (message) => console.log(`${colors.green}ok${colors.reset} ${message}`),
  warn: (message) => console.log(`${colors.yellow}warn${colors.reset} ${message}`),
  error: (message) => console.error(`${colors.red}err${colors.reset} ${message}`)
};

function normalizeStoredKey(value, fallbackFolder) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  if (value.startsWith('/api/v1/uploads/file?') || value.startsWith('/api/v1/uploads/signed-url?')) {
    try {
      return new URLSearchParams(value.split('?')[1]).get('key');
    } catch (_error) {
      return null;
    }
  }

  if (value.startsWith('/uploads/')) {
    return value.replace(/^\/uploads\//, '');
  }

  if (value.startsWith('https://storage.googleapis.com/')) {
    try {
      const url = new URL(value);
      return decodeURIComponent(url.pathname.split('/').slice(2).join('/'));
    } catch (_error) {
      return null;
    }
  }

  if (value.includes('/')) {
    return value;
  }

  return fallbackFolder ? `${fallbackFolder}/${value}` : value;
}

function isSafeStorageKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  if (key.includes('\\') || key.startsWith('/') || key.includes('..')) {
    return false;
  }

  return key.split('/').every(Boolean);
}

function getBackfilledFileFields(file, fallbackFolder) {
  if (!file) {
    return null;
  }

  const key = normalizeStoredKey(file.publicId, fallbackFolder) ||
    normalizeStoredKey(file.url, fallbackFolder);

  if (!isSafeStorageKey(key)) {
    return null;
  }

  const nextUrl = storageConfig.getFileUrl(key);
  const storageProvider = storageConfig.USE_GCS ? 'gcs' : 'local';
  const next = {};

  if (file.publicId !== key) {
    next.publicId = key;
  }

  if (file.url !== nextUrl) {
    next.url = nextUrl;
  }

  if (file.storageProvider !== storageProvider) {
    next.storageProvider = storageProvider;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function addFileUpdates(updates, path, file, fallbackFolder) {
  const next = getBackfilledFileFields(file, fallbackFolder);
  if (!next) {
    return;
  }

  for (const [field, value] of Object.entries(next)) {
    updates[`${path}.${field}`] = value;
  }
}

function buildUserUploadUpdates(user) {
  const updates = {};

  addFileUpdates(updates, 'profilePhoto', user.profilePhoto, 'profile-photos');
  addFileUpdates(updates, 'documents.mciCertificate', user.documents?.mciCertificate, 'documents/mci');
  addFileUpdates(updates, 'documents.mbbsDegree', user.documents?.mbbsDegree, 'documents/degrees');
  addFileUpdates(updates, 'documents.photoId', user.documents?.photoId, 'documents/ids');

  (user.documents?.additionalCertificates || []).forEach((certificate, index) => {
    addFileUpdates(
      updates,
      `documents.additionalCertificates.${index}`,
      certificate,
      'documents/certificates'
    );
  });

  return updates;
}

async function connect() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 30000,
    retryWrites: true,
    writeConcern: { w: 'majority', j: true, wtimeout: 10000 }
  });
}

async function backfillUploadFileUrls() {
  await connect();

  log.info(`Scanning upload metadata (${WRITE_MODE ? 'write mode' : 'dry run'})...`);

  const cursor = User.find({
    $or: [
      { profilePhoto: { $exists: true, $ne: null } },
      { documents: { $exists: true, $ne: null } }
    ]
  }).cursor({ batchSize: BATCH_SIZE });

  let scanned = 0;
  let changed = 0;
  let updatedFields = 0;

  for await (const user of cursor) {
    scanned += 1;
    const updates = buildUserUploadUpdates(user);
    const updateKeys = Object.keys(updates);

    if (updateKeys.length === 0) {
      continue;
    }

    changed += 1;
    updatedFields += updateKeys.length;

    if (WRITE_MODE) {
      await User.updateOne(
        { _id: user._id },
        { $set: updates },
        { runValidators: false }
      );
    }
  }

  const summary = {
    scanned,
    usersWithChanges: changed,
    updatedFields,
    mode: WRITE_MODE ? 'write' : 'dry-run'
  };

  log.success(`Backfill complete: ${JSON.stringify(summary)}`);
  await mongoose.disconnect();
  return summary;
}

if (require.main === module) {
  backfillUploadFileUrls().catch(async (error) => {
    log.error(error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = {
  normalizeStoredKey,
  getBackfilledFileFields,
  buildUserUploadUpdates,
  backfillUploadFileUrls
};
