#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'client', 'public');
const jsDir = path.join(publicDir, 'js');
const cssOutputDir = path.join(publicDir, 'css', 'components');

async function collectJsFiles(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectJsFiles(entryPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

function cssNameFor(filePath, index) {
  const baseName = path.basename(filePath, '.js')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return index === 1 ? `${baseName}.css` : `${baseName}-${index}.css`;
}

function stylesheetLoader(href) {
  return `(function loadExtractedStylesheet() {
    var href = '${href}';
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  })();`;
}

async function extractFile(filePath) {
  const original = await fs.readFile(filePath, 'utf8');
  const injectionPattern = /const style = document\.createElement\(['"]style['"]\);\s*(?:style\.id = ['"][^'"]+['"];\s*)?style\.textContent = `([\s\S]*?)`;\s*document\.head\.appendChild\(style\);/g;
  const matches = [...original.matchAll(injectionPattern)];

  if (matches.length === 0) {
    return [];
  }

  let updated = original;
  const outputs = [];

  for (const [offset, match] of matches.entries()) {
    const cssFileName = cssNameFor(filePath, offset + 1);
    const cssPath = path.join(cssOutputDir, cssFileName);
    const href = `/css/components/${cssFileName}`;
    const cssContent = match[1]
      .replace(/\$\{CONFIG\.placeholderDataAttr\}/g, 'data-src')
      .trim();

    if (cssContent.includes('${')) {
      continue;
    }

    await fs.writeFile(cssPath, `${cssContent}\n`, 'utf8');
    updated = updated.replace(match[0], stylesheetLoader(href));
    outputs.push(path.relative(rootDir, cssPath).replace(/\\/g, '/'));
  }

  if (updated !== original) {
    await fs.writeFile(filePath, updated, 'utf8');
  }

  return outputs;
}

async function main() {
  await fs.mkdir(cssOutputDir, { recursive: true });
  const jsFiles = await collectJsFiles(jsDir);
  const written = [];

  for (const filePath of jsFiles) {
    written.push(...await extractFile(filePath));
  }

  if (written.length === 0) {
    console.log('No static JS style injections found.');
    return;
  }

  console.log(`Extracted ${written.length} JS style injection(s):`);
  written.forEach((filePath) => console.log(`- ${filePath}`));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
