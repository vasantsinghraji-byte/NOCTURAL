const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Patient = require('../models/patient');
const User = require('../models/user');
const NurseBooking = require('../models/nurseBooking');
const RefreshSession = require('../models/refreshSession');
const BookingCompletionOutbox = require('../models/bookingCompletionOutbox');
const InvestigationReport = require('../models/investigationReport');
const storageConfig = require('../config/storage');
const reconciliationService = require('../services/bookingCompletionReconciliationService');

const write = process.argv.includes('--write');

const walkLocalFiles = async (directory) => {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkLocalFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
};

const findOrphanedUploads = async () => {
  const [users, patients, reports] = await Promise.all([
    User.find({}).select('profilePhoto documents').lean(),
    Patient.find({}).select('profilePhoto').lean(),
    InvestigationReport.find({}).select('files').lean()
  ]);
  const referenced = new Set();
  const add = value => { if (value) referenced.add(String(value).replace(/\\/g, '/')); };
  users.forEach(user => {
    add(user.profilePhoto?.publicId);
    add(user.documents?.mciCertificate?.publicId);
    add(user.documents?.mbbsDegree?.publicId);
    add(user.documents?.photoId?.publicId);
    (user.documents?.additionalCertificates || []).forEach(document => add(document.publicId));
  });
  patients.forEach(patient => add(patient.profilePhoto?.publicId));
  reports.forEach(report => (report.files || []).forEach(file => add(file.publicId)));

  let storedKeys;
  if (storageConfig.USE_GCS && storageConfig.gcsBucket) {
    const [files] = await storageConfig.gcsBucket.getFiles();
    storedKeys = files.map(file => file.name);
  } else {
    const root = path.resolve(__dirname, '../uploads');
    storedKeys = (await walkLocalFiles(root))
      .map(file => path.relative(root, file).replace(/\\/g, '/'));
  }
  return storedKeys.filter(key => !referenced.has(key));
};

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

  const now = new Date();
  const [staleSessions, pendingOutbox, completedWithoutOutbox, orphanedUploads] = await Promise.all([
    RefreshSession.countDocuments({ revokedAt: null, expiresAt: { $lte: now } }),
    BookingCompletionOutbox.countDocuments({ status: { $in: ['PENDING', 'RETRY_PENDING'] } }),
    NurseBooking.countDocuments({
      status: 'COMPLETED',
      'completionAccounting.appliedAt': { $exists: false }
    }),
    findOrphanedUploads()
  ]);

  console.log(JSON.stringify({
    mode: write ? 'write' : 'dry-run',
    staleSessions,
    pendingOutbox,
    completedWithoutAccountingMarker: completedWithoutOutbox,
    orphanedUploads: orphanedUploads.length,
    orphanedUploadSample: orphanedUploads.slice(0, 20)
  }, null, 2));

  if (!write) return;

  await RefreshSession.updateMany(
    { revokedAt: null, expiresAt: { $lte: now } },
    { $set: { revokedAt: now, revokedReason: 'STALE_SESSION_RECONCILIATION' } }
  );

  const totals = await NurseBooking.aggregate([
    { $match: { status: 'COMPLETED' } },
    {
      $group: {
        _id: '$patient',
        totalBookings: { $sum: 1 },
        totalSpent: { $sum: { $ifNull: ['$pricing.payableAmount', 0] } }
      }
    }
  ]);
  if (totals.length > 0) {
    await Patient.bulkWrite(totals.map(total => ({
      updateOne: {
        filter: { _id: total._id },
        update: { $set: { totalBookings: total.totalBookings, totalSpent: total.totalSpent } }
      }
    })));
  }

  const outboxResult = await reconciliationService.processPending({ limit: 500 });
  console.log(JSON.stringify({ patientTotalsRebuilt: totals.length, outboxResult }, null, 2));
}

run()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
