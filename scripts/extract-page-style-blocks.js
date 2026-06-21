#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'client', 'public');
const cssOutputDir = path.join(publicDir, 'css', 'pages');

async function collectHtmlFiles(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectHtmlFiles(entryPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(entryPath);
    }
  }

  return files;
}

function normalizeCssName(filePath, index) {
  const relativePath = path.relative(publicDir, filePath).replace(/\\/g, '/');
  const baseName = relativePath
    .replace(/\.html$/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return index === 1 ? `${baseName}.css` : `${baseName}-${index}.css`;
}

function extractMediaAttribute(styleTag) {
  const mediaMatch = /\smedia=(["'])(.*?)\1/i.exec(styleTag);
  return mediaMatch ? ` media="${mediaMatch[2]}"` : '';
}

async function extractFile(filePath) {
  const original = await fs.readFile(filePath, 'utf8');
  const stylePattern = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  const matches = [...original.matchAll(stylePattern)];

  if (matches.length === 0) {
    return [];
  }

  let updated = original;
  const outputs = [];

  for (const [offset, match] of matches.entries()) {
    const styleTag = match[0].split('>')[0];
    const mediaAttribute = extractMediaAttribute(styleTag);
    const blockIndex = offset + 1;
    const cssFileName = normalizeCssName(filePath, blockIndex);
    const cssPath = path.join(cssOutputDir, cssFileName);
    const cssHref = `/css/pages/${cssFileName}`;
    const cssContent = `${match[2].trim()}\n`;
    const linkTag = `<link rel="stylesheet" href="${cssHref}"${mediaAttribute}>`;

    await fs.writeFile(cssPath, cssContent, 'utf8');
    updated = updated.replace(match[0], linkTag);
    outputs.push(path.relative(rootDir, cssPath).replace(/\\/g, '/'));
  }

  await fs.writeFile(filePath, updated, 'utf8');
  return outputs;
}

async function main() {
  await fs.mkdir(cssOutputDir, { recursive: true });
  const htmlFiles = await collectHtmlFiles(publicDir);
  const written = [];

  for (const filePath of htmlFiles) {
    written.push(...await extractFile(filePath));
  }

  if (written.length === 0) {
    console.log('No page-level style blocks found.');
    return;
  }

  console.log(`Extracted ${written.length} page-level style block(s):`);
  written.forEach((filePath) => console.log(`- ${filePath}`));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
