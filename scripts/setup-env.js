#!/usr/bin/env node
/**
 * Environment Setup Script
 *
 * Generates cryptographically secure secrets for JWT_SECRET and ENCRYPTION_KEY
 * in the .env file. Replaces placeholder values or existing secrets.
 *
 * Usage: node scripts/setup-env.js
 *    or: npm run setup:env
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');
const ENV_EXAMPLE_PATH = path.join(__dirname, '..', '.env.example');

// Known compromised/default secrets that must be replaced
const KNOWN_BAD_SECRETS = [
  '98623d6147646fb5cbe3f9d2531d4b16d91af1ef765be8651411280f7f47355e',
  '5802b4cb0239f40dbb2a9032766869c0750ec961544f2ad5a3f8e388de169d4e'
];

const PLACEHOLDER_PATTERN = /^GENERATE_ME/;

function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function needsRegeneration(value) {
  if (!value) return true;
  if (PLACEHOLDER_PATTERN.test(value)) return true;
  if (KNOWN_BAD_SECRETS.includes(value)) return true;
  return false;
}

function main() {
  // If .env doesn't exist, copy from .env.example
  if (!fs.existsSync(ENV_PATH)) {
    if (fs.existsSync(ENV_EXAMPLE_PATH)) {
      fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
      console.log('Created .env from .env.example');
    } else {
      console.error('ERROR: Neither .env nor .env.example found');
      process.exit(1);
    }
  }

  let content = fs.readFileSync(ENV_PATH, 'utf-8');
  let changed = false;

  // Process JWT_SECRET
  const jwtMatch = content.match(/^JWT_SECRET=(.*)$/m);
  if (jwtMatch && needsRegeneration(jwtMatch[1])) {
    const newSecret = generateSecret();
    content = content.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${newSecret}`);
    console.log('Generated new JWT_SECRET');
    changed = true;
  } else {
    console.log('JWT_SECRET is already set (skipped)');
  }

  // Process ENCRYPTION_KEY
  const encMatch = content.match(/^ENCRYPTION_KEY=(.*)$/m);
  if (encMatch && needsRegeneration(encMatch[1])) {
    const newKey = generateSecret();
    content = content.replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${newKey}`);
    console.log('Generated new ENCRYPTION_KEY');
    changed = true;
  } else {
    console.log('ENCRYPTION_KEY is already set (skipped)');
  }

  // Ensure JWT_SECRET and ENCRYPTION_KEY are different
  const finalJwt = content.match(/^JWT_SECRET=(.*)$/m)?.[1];
  const finalEnc = content.match(/^ENCRYPTION_KEY=(.*)$/m)?.[1];
  if (finalJwt && finalEnc && finalJwt === finalEnc) {
    const newKey = generateSecret();
    content = content.replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${newKey}`);
    console.log('Regenerated ENCRYPTION_KEY (was same as JWT_SECRET)');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(ENV_PATH, content, 'utf-8');
    console.log('\n.env updated successfully.');
    console.log('IMPORTANT: Never commit the .env file to version control.');
  } else {
    console.log('\nNo changes needed.');
  }
}

main();
