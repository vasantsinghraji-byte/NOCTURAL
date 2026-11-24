/**
 * react-native-reanimated must stay out of this app while it is on RN 0.76 with
 * the new architecture: it made every Modal (payment sheet, dialogs, cart, address
 * picker) open collapsed in the top-left corner. See lib/motion.tsx.
 * Run: npm test (in frontends/mobile)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');
const sources = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return sources(p);
  return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
});

test('reanimated is not a dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['react-native-reanimated'], undefined);
});

test('no screen or component imports reanimated', () => {
  const bad = [...sources(path.join(root, 'app')), ...sources(path.join(root, 'lib'))]
    .filter((f) => /from 'react-native-reanimated/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(root, f));
  assert.deepEqual(bad, []);
});
