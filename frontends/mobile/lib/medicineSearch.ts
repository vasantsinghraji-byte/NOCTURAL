/**
 * Search one store's medicines on the phone: by brand name, salt (generic name)
 * or maker, matching word starts ("dol" → Dolo), anywhere in the name, and
 * small typos ("crosin" → Crocin). Best matches first.
 */
export interface Searchable { name: string; genericName?: string; brand?: string; manufacturer?: string }

const norm = (s = '') => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s = '') => norm(s).split(' ').filter(Boolean);

/** Edit distance with an early stop: we only care whether it is 0, 1 or 2. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** How well one query word matches one field (0 = no match). */
function wordScore(q: string, field: string[], weight: number): number {
  let best = 0;
  for (const w of field) {
    if (w === q) best = Math.max(best, 10 * weight);
    else if (w.startsWith(q)) best = Math.max(best, 8 * weight);
    else if (q.length >= 3 && w.includes(q)) best = Math.max(best, 5 * weight);
    else if (q.length >= 4 && within(q, w.slice(0, q.length + 1), q.length >= 7 ? 2 : 1)) best = Math.max(best, 4 * weight);
  }
  return best;
}

/** Score of a medicine for the whole query; every query word must match something. */
export function scoreMedicine(m: Searchable, query: string): number {
  const qs = words(query);
  if (!qs.length) return 0;
  const fields: Array<[string[], number]> = [[words(m.name), 3], [words(m.brand), 3], [words(m.genericName), 2], [words(m.manufacturer), 1]];
  let total = 0;
  for (const q of qs) {
    const s = Math.max(...fields.map(([f, w]) => wordScore(q, f, w)));
    if (!s) return 0;
    total += s;
  }
  return total;
}

/** Matching items, best first. `get` reads the medicine out of each item. */
export function searchMedicines<T>(items: T[], query: string, get: (t: T) => Searchable): T[] {
  return items
    .map((t) => ({ t, s: scoreMedicine(get(t), query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.t);
}

/** Salt without the strength, so "Paracetamol 650mg" and "Paracetamol 500mg" count as the same salt family. */
export const saltOf = (g?: string) => (g || '').toLowerCase().replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|%|iu)\b/g, '').replace(/\s+/g, ' ').trim();
/** Salt and strength, so only a true like-for-like ("Paracetamol 500mg" = "paracetamol 500 mg") counts as the same medicine. */
export const exactSaltOf = (g?: string) => (g || '').toLowerCase().replace(/(\d)\s+(mg|mcg|g|ml|%|iu)\b/g, '$1$2').replace(/\s+/g, ' ').trim();
