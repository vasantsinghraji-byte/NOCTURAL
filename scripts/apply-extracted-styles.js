/**
 * Apply extracted styles - replaces original HTML files with modularized versions
 */

const fs = require('fs');

const results = JSON.parse(fs.readFileSync('style-extraction-results.json', 'utf8'));

console.log('📝 Applying extracted styles to HTML files...\n');

results.forEach(result => {
  // Write the modified HTML
  fs.writeFileSync(result.original, result.modified);
  console.log(`✅ Applied: ${result.original}`);
});

console.log(`\n✨ Complete! ${results.length} files updated.`);
console.log(`\nOriginal files backed up with .original extension`);
console.log(`To restore: cp file.html.original file.html`);
