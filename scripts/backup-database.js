/**
 * MongoDB Database Backup Script
 *
 * Usage:
 *   node scripts/backup-database.js
 *
 * Requirements:
 *   - mongodump must be installed (part of MongoDB Database Tools)
 *   - MONGODB_URI environment variable must be set
 *
 * For MongoDB Atlas (Recommended):
 *   - Enable automatic backups in Atlas dashboard
 *   - Atlas M10+ clusters include automated backups
 *   - Go to Atlas > Cluster > Backup > Enable Cloud Backup
 */

require('dotenv').config();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 7; // Keep last 7 backups

async function createBackup() {
  console.log('🔄 Starting database backup...\n');

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Generate backup filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup-${timestamp}`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  // Build mongodump command
  const command = `mongodump --uri="${mongoUri}" --out="${backupPath}" --gzip`;

  console.log(`📁 Backup location: ${backupPath}`);
  console.log('⏳ Running mongodump...\n');

  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Backup failed:', error.message);
        console.error('Stderr:', stderr);
        reject(error);
        return;
      }

      console.log(stdout);
      console.log(`\n✅ Backup completed successfully!`);
      console.log(`📁 Saved to: ${backupPath}`);

      // Clean up old backups
      cleanupOldBackups();

      resolve(backupPath);
    });
  });
}

function cleanupOldBackups() {
  console.log('\n🧹 Cleaning up old backups...');

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-'))
    .map(f => ({
      name: f,
      path: path.join(BACKUP_DIR, f),
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    toDelete.forEach(backup => {
      console.log(`  Deleting: ${backup.name}`);
      fs.rmSync(backup.path, { recursive: true, force: true });
    });
    console.log(`  Removed ${toDelete.length} old backup(s)`);
  } else {
    console.log(`  No cleanup needed (${backups.length}/${MAX_BACKUPS} backups)`);
  }
}

async function restoreBackup(backupPath) {
  console.log(`🔄 Restoring from: ${backupPath}\n`);

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  // Build mongorestore command
  const command = `mongorestore --uri="${mongoUri}" --gzip --drop "${backupPath}"`;

  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Restore failed:', error.message);
        reject(error);
        return;
      }

      console.log(stdout);
      console.log(`\n✅ Restore completed successfully!`);
      resolve();
    });
  });
}

function listBackups() {
  console.log('\n📋 Available Backups:\n');

  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('  No backups found');
    return [];
  }

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        name: f,
        size: `${(stat.size / 1024 / 1024).toFixed(2)} MB`,
        created: stat.mtime.toLocaleString()
      };
    })
    .sort((a, b) => b.created - a.created);

  if (backups.length === 0) {
    console.log('  No backups found');
  } else {
    backups.forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.name}`);
      console.log(`     Size: ${b.size} | Created: ${b.created}\n`);
    });
  }

  return backups;
}

// Main execution
const args = process.argv.slice(2);
const command = args[0] || 'backup';

switch (command) {
  case 'backup':
    createBackup().catch(() => process.exit(1));
    break;
  case 'restore':
    const backupPath = args[1];
    if (!backupPath) {
      console.error('❌ Please specify backup path: node backup-database.js restore <path>');
      listBackups();
      process.exit(1);
    }
    restoreBackup(backupPath).catch(() => process.exit(1));
    break;
  case 'list':
    listBackups();
    break;
  default:
    console.log(`
MongoDB Backup Utility

Usage:
  node scripts/backup-database.js backup    - Create a new backup
  node scripts/backup-database.js restore <path> - Restore from backup
  node scripts/backup-database.js list      - List available backups

Note: For MongoDB Atlas, enable Cloud Backup in the Atlas dashboard
      for automated daily backups with point-in-time recovery.
    `);
}
