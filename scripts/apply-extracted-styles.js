/**
 * Apply extracted styles - replaces original HTML files with modularized versions
 */

const path = require('path');

const projectFs = require('./lib/projectFs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const results = JSON.parse(projectFs.readTextFileSync(PROJECT_ROOT, 'style-extraction-results.json'));

console.log('📝 Applying extracted styles to HTML files...\n');

results.forEach(result => {
  // Write the modified HTML
  projectFs.writeTextFileSync(PROJECT_ROOT, result.original, result.modified);
  console.log(`✅ Applied: ${result.original}`);
});

console.log(`\n✨ Complete! ${results.length} files updated.`);
console.log(`\nOriginal files backed up with .original extension`);
console.log(`To restore: cp file.html.original file.html`);
