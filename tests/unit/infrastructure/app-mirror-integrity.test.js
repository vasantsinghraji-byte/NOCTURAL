'use strict';

/**
 * Mirror-integrity guards for the restructure's copy phases
 * (docs/PHASE1_SPLIT_RECONCILED.md).
 *
 * - apps/duty-shift is a PARKED copy-only mirror (Phase 4): every file must
 *   stay byte-identical to its root original until an approved cutover.
 * - apps/patient-health is a temporary mirrored copy (Phase 3): files may
 *   differ from their root originals ONLY on lines rewritten to import
 *   @nocturnal/shared; app-local wiring files are exempt.
 *
 * If one of these tests fails, someone edited a mirror (or its original)
 * unilaterally — fix the drift or take the change through the blueprint's
 * approval process; do not weaken this test.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');

const normalize = (content) => content.replace(/\r\n/g, '\n');

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function relToApp(appDir, file) {
  return path.relative(appDir, file).split(path.sep).join('/');
}

describe('apps/duty-shift parked mirror (Phase 4 invariant)', () => {
  const appDir = path.join(repoRoot, 'apps/duty-shift');
  // App-local files that intentionally have no root counterpart.
  const appLocal = new Set(['README.md']);

  const mirroredFiles = walkFiles(appDir).filter(
    (file) => !appLocal.has(relToApp(appDir, file))
  );

  test('mirror contains files', () => {
    expect(mirroredFiles.length).toBeGreaterThan(0);
  });

  test.each(mirroredFiles.map((file) => [relToApp(appDir, file), file]))(
    '%s is byte-identical to its root original',
    (rel, file) => {
      const original = path.join(repoRoot, rel);
      expect(fs.existsSync(original)).toBe(true);
      expect(normalize(fs.readFileSync(file, 'utf8'))).toBe(
        normalize(fs.readFileSync(original, 'utf8'))
      );
    }
  );
});

describe('apps/patient-health mirrored copy (Phase 3 invariant)', () => {
  const appDir = path.join(repoRoot, 'apps/patient-health');
  // App-local wiring created in Phase 3 — allowed to diverge freely.
  const appLocal = new Set(['app.js', 'server.js', 'routes/index.js']);
  // Approved divergence beyond import rewrites: the Phase 3 CodeQL fix was
  // deliberately scoped to the patient-health copies (commit 2e28cb5,
  // Decision Log 2026-07-03 in docs/PHASE1_SPLIT_RECONCILED.md). These files
  // only assert that a root counterpart still exists. Do NOT add files here
  // without a corresponding Decision Log entry.
  const approvedDivergence = new Set([
    'controllers/patientController.js',
    'controllers/paymentController.js',
    'middleware/healthDataAccess.js',
    'routes/patient.js',
  ]);

  const mirroredFiles = walkFiles(appDir).filter(
    (file) => !appLocal.has(relToApp(appDir, file))
  );

  test('mirror contains files', () => {
    expect(mirroredFiles.length).toBeGreaterThan(0);
  });

  test.each(mirroredFiles.map((file) => [relToApp(appDir, file), file]))(
    '%s differs from its root original only in @nocturnal/shared imports',
    (rel, file) => {
      const original = path.join(repoRoot, rel);
      expect(fs.existsSync(original)).toBe(true);

      if (approvedDivergence.has(rel)) {
        return; // divergence approved via Decision Log — existence check only
      }

      const copyLines = normalize(fs.readFileSync(file, 'utf8')).split('\n');
      const originalLines = normalize(fs.readFileSync(original, 'utf8')).split('\n');

      expect(copyLines.length).toBe(originalLines.length);

      const disallowedDrift = [];
      for (let i = 0; i < copyLines.length; i += 1) {
        if (copyLines[i] === originalLines[i]) continue;
        const isApprovedRewrite =
          copyLines[i].includes("require('@nocturnal/shared')") &&
          originalLines[i].includes('require(');
        if (!isApprovedRewrite) {
          disallowedDrift.push(
            `line ${i + 1}:\n  copy:     ${copyLines[i]}\n  original: ${originalLines[i]}`
          );
        }
      }

      expect(disallowedDrift).toEqual([]);
    }
  );
});
