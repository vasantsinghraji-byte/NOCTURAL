const fs = require('fs');
const path = require('path');
const Patient = require('../models/patient');
const User = require('../models/user');
const InvestigationReport = require('../models/investigationReport');
const storageConfig = require('../config/storage');

const walk = async directory => {
  // Directory is rooted under the configured upload storage location.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
  return (await Promise.all(entries.map(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  }))).flat();
};

async function findOrphanedUploads() {
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
    (user.documents?.additionalCertificates || []).forEach(item => add(item.publicId));
  });
  patients.forEach(patient => add(patient.profilePhoto?.publicId));
  reports.forEach(report => (report.files || []).forEach(file => add(file.publicId)));

  if (storageConfig.USE_GCS && storageConfig.gcsBucket) {
    const [files] = await storageConfig.gcsBucket.getFiles();
    return files.map(file => file.name).filter(key => !referenced.has(key));
  }
  const root = path.resolve(__dirname, '../uploads');
  const keys = (await walk(root)).map(file => path.relative(root, file).replace(/\\/g, '/'));
  return keys.filter(key => !referenced.has(key));
}

module.exports = { findOrphanedUploads };
