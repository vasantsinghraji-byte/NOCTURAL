/**
 * Frontend Build Configuration
 * Handles minification, bundling, and optimization
 */

const fs = require('fs').promises;
const path = require('path');
const { minify: minifyHTML } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const terser = require('terser');
const crypto = require('crypto');

// Directories and files excluded from production builds
const BUILD_EXCLUDES = [
  path.join('test', path.sep),
  path.join('shared', 'auth-setup.html'),
  path.join('js', 'auth-setup.js')
];

function isExcludedFromBuild(filePath, sourceDir) {
  var relative = path.relative(sourceDir, filePath);
  if (relative.endsWith('.original')) {
    return true;
  }
  for (var i = 0; i < BUILD_EXCLUDES.length; i++) {
    if (relative.startsWith(BUILD_EXCLUDES[i]) || relative === BUILD_EXCLUDES[i]) {
      return true;
    }
  }
  return false;
}

const CONFIG = {
  sourceDir: path.join(__dirname, 'public'),
  buildDir: path.join(__dirname, 'dist'),

  // Asset versioning
  enableVersioning: true,
  versionLength: 8,

  // Minification options
  minifyHTML: {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
    minifyCSS: true,
    minifyJS: true
  },

  minifyCSS: {
    level: 2,
    compatibility: '*'
  },

  minifyJS: {
    compress: {
      drop_console: process.env.NODE_ENV === 'production',
      drop_debugger: true
    },
    mangle: true
  }
};

// Asset version manifest
let assetManifest = {};

function createBuildFailure(step, sourceFile, details) {
  const message = Array.isArray(details) ? details.join('; ') : details;
  return { step, sourceFile, message };
}

/**
 * Generate hash for asset versioning
 */
function generateHash(content) {
  return crypto
    .createHash('md5')
    .update(content)
    .digest('hex')
    .substring(0, CONFIG.versionLength);
}

/**
 * Get versioned filename
 */
function getVersionedFilename(filename, content) {
  if (!CONFIG.enableVersioning) {
    return filename;
  }

  const hash = generateHash(content);
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);

  return `${base}.${hash}${ext}`;
}

/**
 * Minify CSS files
 */
async function minifyCSS(sourceFile, destFile) {
  try {
    const content = await fs.readFile(sourceFile, 'utf8');
    const result = new CleanCSS(CONFIG.minifyCSS).minify(content);

    if (result.errors.length > 0) {
      return {
        success: false,
        failure: createBuildFailure('css-minify', sourceFile, result.errors)
      };
    }

    const versionedName = getVersionedFilename(path.basename(destFile), result.styles);
    const versionedPath = path.join(path.dirname(destFile), versionedName);

    await fs.writeFile(versionedPath, result.styles);

    // Update manifest
    const relativePath = path.relative(CONFIG.buildDir, destFile);
    const relativeVersioned = path.relative(CONFIG.buildDir, versionedPath);
    assetManifest[relativePath.replace(/\\/g, '/')] = relativeVersioned.replace(/\\/g, '/');

    console.log(`CSS minified: ${sourceFile} -> ${versionedPath}`);
    console.log(`  Original: ${content.length} bytes, Minified: ${result.styles.length} bytes (${Math.round((1 - result.styles.length / content.length) * 100)}% reduction)`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      failure: createBuildFailure('css-minify', sourceFile, error.message)
    };
  }
}

/**
 * Minify JavaScript files
 */
async function minifyJS(sourceFile, destFile) {
  try {
    const content = await fs.readFile(sourceFile, 'utf8');
    const result = await terser.minify(content, CONFIG.minifyJS);

    if (result.error) {
      return {
        success: false,
        failure: createBuildFailure('js-minify', sourceFile, result.error.message || result.error)
      };
    }

    const versionedName = getVersionedFilename(path.basename(destFile), result.code);
    const versionedPath = path.join(path.dirname(destFile), versionedName);

    await fs.writeFile(versionedPath, result.code);

    // Update manifest
    const relativePath = path.relative(CONFIG.buildDir, destFile);
    const relativeVersioned = path.relative(CONFIG.buildDir, versionedPath);
    assetManifest[relativePath.replace(/\\/g, '/')] = relativeVersioned.replace(/\\/g, '/');

    console.log(`JS minified: ${sourceFile} -> ${versionedPath}`);
    console.log(`  Original: ${content.length} bytes, Minified: ${result.code.length} bytes (${Math.round((1 - result.code.length / content.length) * 100)}% reduction)`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      failure: createBuildFailure('js-minify', sourceFile, error.message)
    };
  }
}

/**
 * Minify HTML files and update asset references
 */
async function minifyHTMLFile(sourceFile, destFile) {
  try {
    let content = await fs.readFile(sourceFile, 'utf8');

    // Replace asset references with versioned ones
    for (const [original, versioned] of Object.entries(assetManifest)) {
      const regex = new RegExp(original.replace(/\./g, '\\.'), 'g');
      content = content.replace(regex, versioned);
    }

    const result = await minifyHTML(content, CONFIG.minifyHTML);

    await fs.writeFile(destFile, result);

    console.log(`HTML minified: ${sourceFile} -> ${destFile}`);
    console.log(`  Original: ${content.length} bytes, Minified: ${result.length} bytes (${Math.round((1 - result.length / content.length) * 100)}% reduction)`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      failure: createBuildFailure('html-minify', sourceFile, error.message)
    };
  }
}

/**
 * Copy and optimize images
 */
async function processImage(sourceFile, destFile) {
  try {
    await fs.copyFile(sourceFile, destFile);
    console.log(`Image copied: ${sourceFile}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      failure: createBuildFailure('image-copy', sourceFile, error.message)
    };
  }
}

/**
 * Recursively copy directory structure
 */
async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Get all files in directory recursively
 */
async function getFiles(dir, fileList = []) {
  const files = await fs.readdir(dir, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dir, file.name);

    if (file.isDirectory()) {
      await getFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }

  return fileList;
}

/**
 * Main build function
 */
async function build() {
  console.log('Starting frontend build...\n');

  const startTime = Date.now();
  const failures = [];

  function trackFailure(result) {
    if (!result || result.success !== false || !result.failure) {
      return;
    }

    failures.push(result.failure);
    console.error(`Build step failed [${result.failure.step}] ${result.failure.sourceFile}: ${result.failure.message}`);
  }

  try {
    assetManifest = {};

    // Clean build directory
    await fs.rm(CONFIG.buildDir, { recursive: true, force: true });
    await ensureDir(CONFIG.buildDir);

    // Get all source files, excluding test/debug/auth-bypass pages
    const allFiles = await getFiles(CONFIG.sourceDir);
    const files = allFiles.filter(f => !isExcludedFromBuild(f, CONFIG.sourceDir));

    // Categorize files
    const cssFiles = files.filter(f => f.endsWith('.css'));
    const jsFiles = files.filter(f => f.endsWith('.js') && !f.includes('node_modules'));
    const htmlFiles = files.filter(f => f.endsWith('.html'));
    const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(f));
    const otherFiles = files.filter(f =>
      !cssFiles.includes(f) &&
      !jsFiles.includes(f) &&
      !htmlFiles.includes(f) &&
      !imageFiles.includes(f)
    );

    console.log(`Found ${files.length} files:`);
    console.log(`   - ${cssFiles.length} CSS files`);
    console.log(`   - ${jsFiles.length} JS files`);
    console.log(`   - ${htmlFiles.length} HTML files`);
    console.log(`   - ${imageFiles.length} images`);
    console.log(`   - ${otherFiles.length} other files\n`);

    console.log('Minifying CSS files...');
    for (const file of cssFiles) {
      const relativePath = path.relative(CONFIG.sourceDir, file);
      const destPath = path.join(CONFIG.buildDir, relativePath);
      await ensureDir(path.dirname(destPath));
      trackFailure(await minifyCSS(file, destPath));
    }

    console.log('\nMinifying JavaScript files...');
    for (const file of jsFiles) {
      const relativePath = path.relative(CONFIG.sourceDir, file);
      const destPath = path.join(CONFIG.buildDir, relativePath);
      await ensureDir(path.dirname(destPath));
      trackFailure(await minifyJS(file, destPath));
    }

    console.log('\nMinifying HTML files...');
    for (const file of htmlFiles) {
      const relativePath = path.relative(CONFIG.sourceDir, file);
      const destPath = path.join(CONFIG.buildDir, relativePath);
      await ensureDir(path.dirname(destPath));
      trackFailure(await minifyHTMLFile(file, destPath));
    }

    console.log('\nCopying images...');
    for (const file of imageFiles) {
      const relativePath = path.relative(CONFIG.sourceDir, file);
      const destPath = path.join(CONFIG.buildDir, relativePath);
      await ensureDir(path.dirname(destPath));
      trackFailure(await processImage(file, destPath));
    }

    console.log('\nCopying other files...');
    for (const file of otherFiles) {
      const relativePath = path.relative(CONFIG.sourceDir, file);
      const destPath = path.join(CONFIG.buildDir, relativePath);
      await ensureDir(path.dirname(destPath));
      try {
        await fs.copyFile(file, destPath);
        console.log(`File copied: ${file}`);
      } catch (error) {
        trackFailure({
          success: false,
          failure: createBuildFailure('file-copy', file, error.message)
        });
      }
    }

    if (failures.length > 0) {
      const error = new Error(`Frontend build failed with ${failures.length} asset processing error(s).`);
      error.failures = failures;
      throw error;
    }

    const manifestPath = path.join(CONFIG.buildDir, 'asset-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(assetManifest, null, 2));
    console.log(`\nAsset manifest saved: ${manifestPath}`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nBuild completed in ${duration}s`);
    console.log(`Output directory: ${CONFIG.buildDir}`);
  } catch (error) {
    console.error('\nBuild failed:', error);
    process.exit(1);
  }
}

// Run build
if (require.main === module) {
  build();
}

module.exports = { build, CONFIG, createBuildFailure };
