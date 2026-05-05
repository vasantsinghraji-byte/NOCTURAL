#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'client', 'public');

const patterns = [
  { type: 'html style attribute', extension: '.html', pattern: /\sstyle\s*=/gi },
  { type: 'html style block', extension: '.html', pattern: /<style\b[^>]*>[\s\S]*?<\/style>/gi },
  { type: 'js inline style markup', extension: '.js', pattern: /\sstyle\s*=/gi },
  { type: 'js style property mutation', extension: '.js', pattern: /\.style(?:\.|\.cssText|\[['"`])/g },
  { type: 'js injected style block', extension: '.js', pattern: /document\.createElement\(['"`]style['"`]\)|style\.textContent\s*=/g }
];

async function collectFiles(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(entryPath, files);
    } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.js'))) {
      files.push(entryPath);
    }
  }

  return files;
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function scanContent(filePath, content) {
  const results = [];
  const extension = path.extname(filePath);
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

  for (const check of patterns.filter((pattern) => pattern.extension === extension)) {
    check.pattern.lastIndex = 0;

    let match = check.pattern.exec(content);
    while (match) {
      results.push({
        file: relativePath,
        line: lineNumberForIndex(content, match.index),
        type: check.type
      });
      match = check.pattern.exec(content);
    }
  }

  return results;
}

async function main() {
  const strict = process.argv.includes('--strict');
  const files = await collectFiles(publicDir);
  const findings = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    findings.push(...scanContent(file, content));
  }

  const counts = findings.reduce((acc, finding) => ({
    ...acc,
    [finding.type]: (acc[finding.type] || 0) + 1
  }), {});

  console.log('Inline style audit');
  if (Object.keys(counts).length === 0) {
    console.log('No inline style findings.');
  } else {
    Object.keys(counts).sort().forEach((type) => {
      console.log(`${type}: ${counts[type]}`);
    });
  }

  const sample = findings.slice(0, 30);
  if (sample.length > 0) {
    console.log('\nFirst findings:');
    sample.forEach((finding) => {
      console.log(`${finding.file}:${finding.line} ${finding.type}`);
    });
  }

  if (strict && findings.length > 0) {
    console.error('\nStrict inline style scan failed. Remove findings before tightening style-src and style-src-attr.');
    process.exitCode = 1;
    return;
  }

  console.log(strict
    ? '\nStrict inline style scan passed.'
    : '\nThis audit is informational. Remove findings before tightening style-src and style-src-attr.');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
