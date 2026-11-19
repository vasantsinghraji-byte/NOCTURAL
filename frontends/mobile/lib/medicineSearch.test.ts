/**
 * In-store medicine search (lib/medicineSearch.ts): word starts, salts, makers
 * and small typos, best match first.
 * Run: npm test (in frontends/mobile)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactSaltOf, saltOf, searchMedicines, scoreMedicine } from './medicineSearch.ts';

const CATALOG = [
  { name: 'Dolo 650 Tablet', genericName: 'Paracetamol 650mg', brand: 'Dolo', manufacturer: 'Micro Labs' },
  { name: 'Crocin Advance 500 Tablet', genericName: 'Paracetamol 500mg', brand: 'Crocin', manufacturer: 'GSK' },
  { name: 'Azithral 500 Tablet', genericName: 'Azithromycin 500mg', brand: 'Azithral', manufacturer: 'Alembic' },
  { name: 'ORS Powder Sachet', genericName: 'Oral Rehydration Salts', brand: 'Electral', manufacturer: 'FDC' },
  { name: 'Digital Thermometer', genericName: 'Clinical Digital Thermometer', brand: 'Dr Trust', manufacturer: 'Dr Trust' }
];
const names = (q: string) => searchMedicines(CATALOG, q, (m) => m).map((m) => m.name);

test('a word start finds the brand ("dol" → Dolo)', () => {
  assert.deepEqual(names('dol'), ['Dolo 650 Tablet']);
});

test('the salt finds every brand that has it', () => {
  assert.deepEqual(names('paracetamol').sort(), ['Crocin Advance 500 Tablet', 'Dolo 650 Tablet']);
});

test('a one-letter typo still finds it ("crosin" → Crocin, "azitral" → Azithral)', () => {
  assert.deepEqual(names('crosin'), ['Crocin Advance 500 Tablet']);
  assert.deepEqual(names('azitral'), ['Azithral 500 Tablet']);
});

test('every word must match, and brand matches rank above salt-only matches', () => {
  assert.deepEqual(names('paracetamol 650'), ['Dolo 650 Tablet']);
  assert.ok(scoreMedicine(CATALOG[0], 'dolo') > scoreMedicine(CATALOG[1], 'paracetamol'));
});

test('maker, mixed case and punctuation work; nonsense finds nothing', () => {
  assert.deepEqual(names('GSK'), ['Crocin Advance 500 Tablet']);
  assert.deepEqual(names('  ORS!! '), ['ORS Powder Sachet']);
  assert.deepEqual(names('xyzzy'), []);
  assert.deepEqual(names(''), []);
});

test('same salt family ignores strength; a like-for-like swap needs the same strength', () => {
  assert.equal(saltOf('Paracetamol 650mg'), saltOf('Paracetamol 500 mg'));
  assert.notEqual(exactSaltOf('Paracetamol 650mg'), exactSaltOf('Paracetamol 500mg'));
  assert.equal(exactSaltOf('Paracetamol 500 mg'), exactSaltOf('paracetamol  500mg'));
  assert.notEqual(saltOf('Ibuprofen 400mg + Paracetamol 325mg'), saltOf('Paracetamol 500mg'));
});
