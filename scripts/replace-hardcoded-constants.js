/**
 * Script to replace hardcoded constants with centralized constant imports
 */

const fs = require('fs');
const path = require('path');

// Patterns to find and replace
const replacements = {
  // Role replacements
  "role === 'doctor'": "role === ROLES.DOCTOR",
  "role === 'nurse'": "role === ROLES.NURSE",
  "role === 'admin'": "role === ROLES.ADMIN",
  "role !== 'doctor'": "role !== ROLES.DOCTOR",
  "role !== 'nurse'": "role !== ROLES.NURSE",
  "role !== 'admin'": "role !== ROLES.ADMIN",
  "'doctor'": "ROLES.DOCTOR  /* was 'doctor' */",
  "'nurse'": "ROLES.NURSE  /* was 'nurse' */",
  "'admin'": "ROLES.ADMIN  /* was 'admin' */",
  '"doctor"': 'ROLES.DOCTOR  /* was "doctor" */',
  '"nurse"': 'ROLES.NURSE  /* was "nurse" */',
  '"admin"': 'ROLES.ADMIN  /* was "admin" */',

  // Status replacements - Duty Status
  "status === 'OPEN'": "status === DUTY_STATUS.OPEN",
  "status === 'FILLED'": "status === DUTY_STATUS.FILLED",
  "status === 'COMPLETED'": "status === DUTY_STATUS.COMPLETED",
  "status === 'CANCELLED'": "status === DUTY_STATUS.CANCELLED",
  "'OPEN'": "DUTY_STATUS.OPEN  /* was 'OPEN' */",
  "'FILLED'": "DUTY_STATUS.FILLED  /* was 'FILLED' */",

  // Application Status
  "status === 'PENDING'": "status === APPLICATION_STATUS.PENDING",
  "status === 'ACCEPTED'": "status === APPLICATION_STATUS.ACCEPTED",
  "status === 'REJECTED'": "status === APPLICATION_STATUS.REJECTED",
  "'PENDING'": "APPLICATION_STATUS.PENDING  /* was 'PENDING' */",
  "'ACCEPTED'": "APPLICATION_STATUS.ACCEPTED  /* was 'ACCEPTED' */",
  "'REJECTED'": "APPLICATION_STATUS.REJECTED  /* was 'REJECTED' */",
};

// Import statement to add
const IMPORT_STATEMENT = "const { ROLES, DUTY_STATUS, APPLICATION_STATUS, PAYMENT_STATUS, ERROR_MESSAGES } = require('../constants');\n";

// Files to process
const filesToProcess = [
  'routes/payments.js',
  'routes/analytics.js',
  'routes/duties-paginated-example.js',
  'routes/earnings.js',
  'routes/shiftSeries.js',
  'models/user.js',
  'middleware/validation.js',
  'controllers/dutyController.js'
];

function addImportIfMissing(content, filePath) {
  // Check if constants are already imported
  if (content.includes("require('../constants')") || content.includes("require('./constants')")) {
    console.log(`  ⏭  Constants already imported`);
    return content;
  }

  // Find the last require statement
  const lines = content.split('\n');
  let lastRequireIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('require(') && !lines[i].trim().startsWith('//')) {
      lastRequireIndex = i;
    }
  }

  if (lastRequireIndex === -1) {
    // No requires found, add at top after initial comments
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim().startsWith('//') && !lines[i].trim().startsWith('/*') && !lines[i].trim().startsWith('*') && lines[i].trim() !== '') {
        insertIndex = i;
        break;
      }
    }
    lines.splice(insertIndex, 0, IMPORT_STATEMENT);
  } else {
    // Add after last require
    lines.splice(lastRequireIndex + 1, 0, IMPORT_STATEMENT);
  }

  console.log(`  ✅ Added constants import`);
  return lines.join('\n');
}

function replaceConstants(content) {
  let modified = content;
  let changeCount = 0;

  // Be careful with replacements - only replace in code context
  for (const [pattern, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = modified.match(regex);
    if (matches) {
      modified = modified.replace(regex, replacement);
      changeCount += matches.length;
    }
  }

  return { content: modified, changes: changeCount };
}

function processFile(filePath) {
  console.log(`\n📝 Processing: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.log(`  ❌ File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Add import
  content = addImportIfMissing(content, filePath);

  // Replace constants
  const { content: newContent, changes } = replaceConstants(content);

  if (newContent !== original) {
    // Create backup
    const backupPath = filePath + '.before-constants';
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, original);
      console.log(`  💾 Created backup: ${path.basename(backupPath)}`);
    }

    // Write modified file
    fs.writeFileSync(filePath, newContent);
    console.log(`  ✨ Replaced ${changes} hardcoded constants`);
    return true;
  } else {
    console.log(`  ✓  No changes needed`);
    return false;
  }
}

// Main execution
console.log('🔧 Replacing hardcoded constants with centralized imports...\n');
console.log('This will:');
console.log('  1. Add constants import to each file');
console.log('  2. Replace hardcoded strings with CONSTANTS');
console.log('  3. Create .before-constants backups\n');

let processedCount = 0;
let modifiedCount = 0;

filesToProcess.forEach(file => {
  processedCount++;
  if (processFile(file)) {
    modifiedCount++;
  }
});

console.log(`\n\n📊 Summary:`);
console.log(`  Files processed: ${processedCount}`);
console.log(`  Files modified: ${modifiedCount}`);
console.log(`  Files unchanged: ${processedCount - modifiedCount}`);

if (modifiedCount > 0) {
  console.log(`\n✨ Next steps:`);
  console.log(`  1. Review the changes in each file`);
  console.log(`  2. Test the application: npm start`);
  console.log(`  3. If issues occur, restore: cp file.before-constants file.js`);
  console.log(`  4. Run tests if available: npm test`);
}

console.log(`\n✅ Constants centralization complete!`);
