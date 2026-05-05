const fs = require('fs').promises;
const path = require('path');

const DEFAULT_HTML_ROOT = path.resolve(__dirname, '..', 'client', 'public');

const CHECKS = [
  {
    name: 'inline script block',
    pattern: /<script\b(?![^>]*\bsrc\s*=)[^>]*>[\s\S]*?<\/script>/gi
  },
  {
    name: 'inline event handler',
    pattern: /\son[a-z]+\s*=/gi
  },
  {
    name: 'javascript URL',
    pattern: /javascript:/gi
  }
];

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

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function scanHtmlContent(content, filePath, rootDir) {
  const violations = [];
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');

  for (const check of CHECKS) {
    check.pattern.lastIndex = 0;

    let match = check.pattern.exec(content);
    while (match) {
      violations.push({
        file: relativePath,
        line: lineNumberForIndex(content, match.index),
        type: check.name,
        snippet: match[0].replace(/\s+/g, ' ').slice(0, 120)
      });
      match = check.pattern.exec(content);
    }
  }

  return violations;
}

async function scanHtmlCsp(rootDir = DEFAULT_HTML_ROOT) {
  const files = await collectHtmlFiles(rootDir);
  const violations = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    violations.push(...scanHtmlContent(content, file, rootDir));
  }

  return violations;
}

function formatViolation(violation) {
  return `${violation.file}:${violation.line} ${violation.type} (${violation.snippet})`;
}

async function main() {
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_HTML_ROOT;
  const violations = await scanHtmlCsp(rootDir);

  if (violations.length > 0) {
    process.stderr.write(`CSP HTML scan failed with ${violations.length} violation(s):\n`);
    process.stderr.write(`${violations.map(formatViolation).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write('CSP HTML scan passed: no inline scripts, inline handlers, or javascript: URLs found.\n');
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  scanHtmlCsp,
  scanHtmlContent,
  formatViolation
};
