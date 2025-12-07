/**
 * Script to extract inline <style> blocks from HTML files
 * and save them as external CSS files
 */

const fs = require('fs');
const path = require('path');

function extractStyles(htmlFilePath) {
  const content = fs.readFileSync(htmlFilePath, 'utf8');
  const fileName = path.basename(htmlFilePath, '.html');

  // Extract style blocks
  const styleRegex = /<style>([\s\S]*?)<\/style>/g;
  let match;
  let styleContent = '';
  let modifiedHtml = content;

  while ((match = styleRegex.exec(content)) !== null) {
    styleContent += match[1] + '\n\n';
  }

  if (styleContent.trim()) {
    // Save to CSS file
    const cssPath = path.join(path.dirname(htmlFilePath), 'css', `${fileName}.css`);
    fs.mkdirSync(path.dirname(cssPath), { recursive: true });
    fs.writeFileSync(cssPath, styleContent.trim());

    // Replace inline style with link tag
    modifiedHtml = modifiedHtml.replace(
      /<style>[\s\S]*?<\/style>/g,
      `<link rel="stylesheet" href="css/${fileName}.css">`
    );

    // Save modified HTML
    const backupPath = htmlFilePath + '.original';
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(htmlFilePath, backupPath);
    }

    console.log(`✅ Extracted styles from ${fileName}.html`);
    console.log(`   CSS saved to: css/${fileName}.css`);
    console.log(`   Original backup: ${fileName}.html.original`);
    console.log(`   Style size: ${styleContent.length} characters\n`);

    return {
      original: htmlFilePath,
      css: cssPath,
      backup: backupPath,
      styleSize: styleContent.length,
      modified: modifiedHtml
    };
  }

  return null;
}

// Main execution
const targetFiles = process.argv.slice(2);

if (targetFiles.length === 0) {
  console.log('Usage: node extract-inline-styles.js <html-file1> [html-file2] ...');
  console.log('Example: node extract-inline-styles.js client/public/index.html');
  process.exit(1);
}

console.log('🔧 Extracting inline styles from HTML files...\n');

let totalExtracted = 0;
const results = [];

targetFiles.forEach(file => {
  if (fs.existsSync(file)) {
    const result = extractStyles(file);
    if (result) {
      results.push(result);
      totalExtracted++;
    } else {
      console.log(`⚠️  No inline styles found in ${file}`);
    }
  } else {
    console.log(`❌ File not found: ${file}`);
  }
});

console.log(`\n📊 Summary:`);
console.log(`   Files processed: ${targetFiles.length}`);
console.log(`   Styles extracted: ${totalExtracted}`);
console.log(`   Total style size: ${results.reduce((sum, r) => sum + r.styleSize, 0)} characters`);

if (results.length > 0) {
  console.log(`\n✨ Next steps:`);
  console.log(`   1. Review the extracted CSS files`);
  console.log(`   2. Test the HTML files with external CSS`);
  console.log(`   3. If everything works, apply changes:`);
  console.log(`      node scripts/apply-extracted-styles.js`);
}

// Save results for apply script
fs.writeFileSync('style-extraction-results.json', JSON.stringify(results, null, 2));
