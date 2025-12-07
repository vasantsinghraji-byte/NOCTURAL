/**
 * Analyze file naming patterns and identify inconsistencies
 */

const fs = require('fs');
const path = require('path');

// Naming conventions
const CONVENTIONS = {
  camelCase: /^[a-z][a-zA-Z0-9]*\.(js|html|css)$/,
  kebabCase: /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.(js|html|css)$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*\.(js|html|css)$/,
  mixedCase: /^[a-z][a-zA-Z0-9]*-[a-z0-9]+[a-zA-Z0-9]*\.(js|html|css)$/  // Has both camel and kebab
};

function detectNamingStyle(filename) {
  const basename = path.basename(filename);

  if (CONVENTIONS.PascalCase.test(basename)) return 'PascalCase';
  if (CONVENTIONS.mixedCase.test(basename)) return 'mixed';
  if (CONVENTIONS.kebabCase.test(basename)) return 'kebab-case';
  if (CONVENTIONS.camelCase.test(basename)) return 'camelCase';
  return 'other';
}

function analyzeDirectory(dir, results = {}) {
  if (!fs.existsSync(dir)) return results;

  const files = fs.readdirSync(dir, { withFileTypes: true });

  files.forEach(file => {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
      analyzeDirectory(fullPath, results);
    } else if (file.isFile() && /\.(js|html|css)$/.test(file.name)) {
      const style = detectNamingStyle(file.name);
      const dirName = path.relative('.', dir);

      if (!results[dirName]) {
        results[dirName] = {
          camelCase: [],
          'kebab-case': [],
          PascalCase: [],
          mixed: [],
          other: []
        };
      }

      results[dirName][style].push(file.name);
    }
  });

  return results;
}

function suggestRename(filename) {
  const ext = path.extname(filename);
  const basename = path.basename(filename, ext);

  // Convert to kebab-case (recommended for frontend files)
  const kebab = basename
    .replace(/([A-Z])/g, '-$1')  // PascalCase to kebab
    .replace(/([a-z])([A-Z])/g, '$1-$2')  // camelCase to kebab
    .toLowerCase()
    .replace(/^-/, '');  // Remove leading dash

  // Convert to camelCase (recommended for backend files)
  const camel = basename
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())  // kebab to camel
    .replace(/^([A-Z])/, (letter) => letter.toLowerCase());  // PascalCase to camel

  return { kebab: kebab + ext, camel: camel + ext };
}

// Analyze project
console.log('🔍 Analyzing file naming patterns...\n');

const dirs = [
  'routes',
  'models',
  'middleware',
  'controllers',
  'client/public',
  'config',
  'utils'
];

const allResults = {};
dirs.forEach(dir => {
  const results = analyzeDirectory(dir);
  Object.assign(allResults, results);
});

// Print results
console.log('📊 File Naming Analysis\n');
console.log('='.repeat(70));

let totalFiles = 0;
let inconsistentDirs = [];

Object.entries(allResults).forEach(([dir, styles]) => {
  const counts = {
    camelCase: styles.camelCase.length,
    'kebab-case': styles['kebab-case'].length,
    PascalCase: styles.PascalCase.length,
    mixed: styles.mixed.length,
    other: styles.other.length
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  totalFiles += total;

  if (total > 0) {
    console.log(`\n📁 ${dir}/`);
    console.log(`   Total files: ${total}`);

    Object.entries(counts).forEach(([style, count]) => {
      if (count > 0) {
        const percentage = ((count / total) * 100).toFixed(1);
        console.log(`   ${style}: ${count} (${percentage}%)`);
      }
    });

    // Check for inconsistency
    const stylesUsed = Object.entries(counts).filter(([_, count]) => count > 0).length;
    if (stylesUsed > 1) {
      inconsistentDirs.push(dir);
      console.log(`   ⚠️  INCONSISTENT - Multiple naming styles detected`);

      // Show examples
      Object.entries(styles).forEach(([style, files]) => {
        if (files.length > 0 && files.length <= 3) {
          console.log(`      ${style}: ${files.join(', ')}`);
        } else if (files.length > 3) {
          console.log(`      ${style}: ${files.slice(0, 3).join(', ')}... (+${files.length - 3} more)`);
        }
      });
    }
  }
});

console.log('\n' + '='.repeat(70));
console.log(`\n📈 Summary:`);
console.log(`   Total files analyzed: ${totalFiles}`);
console.log(`   Directories with inconsistent naming: ${inconsistentDirs.length}`);

if (inconsistentDirs.length > 0) {
  console.log(`\n⚠️  Inconsistent directories:`);
  inconsistentDirs.forEach(dir => console.log(`   - ${dir}`));
}

// Recommendations
console.log(`\n💡 Recommendations:`);
console.log(`   Backend (routes/, models/, middleware/, controllers/):`);
console.log(`      ✅ Use camelCase (e.g., userController.js, authService.js)`);
console.log(`\n   Frontend (client/public/):`);
console.log(`      ✅ Use kebab-case (e.g., admin-dashboard.html, user-profile.css)`);
console.log(`\n   Config/Utils:`);
console.log(`      ✅ Use camelCase for consistency with backend`);

// Generate rename suggestions
console.log(`\n📝 Files needing rename:\n`);

const renameSuggestions = [];

Object.entries(allResults).forEach(([dir, styles]) => {
  const isBackend = ['routes', 'models', 'middleware', 'controllers', 'config', 'utils'].some(d => dir.startsWith(d));
  const isFrontend = dir.startsWith('client');

  // Backend should be camelCase
  if (isBackend) {
    [...styles['kebab-case'], ...styles.mixed, ...styles.PascalCase].forEach(file => {
      const suggestions = suggestRename(file);
      renameSuggestions.push({
        dir,
        old: file,
        new: suggestions.camel,
        reason: 'Backend files should use camelCase'
      });
    });
  }

  // Frontend should be kebab-case
  if (isFrontend) {
    [...styles.camelCase, ...styles.mixed, ...styles.PascalCase].forEach(file => {
      // Skip if already reasonable
      if (file === 'api.js' || file === 'app.js' || file.startsWith('firebase-')) return;

      const suggestions = suggestRename(file);
      if (suggestions.kebab !== file) {
        renameSuggestions.push({
          dir,
          old: file,
          new: suggestions.kebab,
          reason: 'Frontend files should use kebab-case'
        });
      }
    });
  }
});

if (renameSuggestions.length > 0) {
  console.log(`Found ${renameSuggestions.length} files to rename:\n`);

  renameSuggestions.slice(0, 20).forEach(({ dir, old, new: newName, reason }) => {
    console.log(`   ${dir}/${old}`);
    console.log(`   → ${dir}/${newName}`);
    console.log(`      ${reason}\n`);
  });

  if (renameSuggestions.length > 20) {
    console.log(`   ... and ${renameSuggestions.length - 20} more\n`);
  }

  // Save to JSON for rename script
  fs.writeFileSync(
    'file-rename-suggestions.json',
    JSON.stringify(renameSuggestions, null, 2)
  );
  console.log(`✅ Saved rename suggestions to: file-rename-suggestions.json`);
} else {
  console.log(`✅ All files follow naming conventions!`);
}

console.log(`\n✨ Analysis complete!`);
