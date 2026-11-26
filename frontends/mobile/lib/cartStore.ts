/**
 * Keeps the medicine cart when Android closes the app (lib/cart.tsx saves it,
 * encrypted on the phone). Only for the same account, and only for a day:
 * another person signing in on the phone never sees it, and an old basket
 * isn't sprung on anyone. Anything that doesn't look right is dropped.
 */

export const CART_KEY = 'nabz.cart.v1';
export const CART_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_LINES = 50;
const MAX_QTY = 20;
const ID = /^[a-f0-9]{24}$/;

export interface SavedCart { owner: string; storeId: string; cart: Record<string, number>; at: number }

/** Who the cart belongs to (signed out = nobody, nothing is saved). */
export const cartOwner = (session: { kind: string; email: string } | null | undefined): string | null =>
  session && session.kind === 'patient' && session.email ? `patient:${session.email.trim().toLowerCase()}` : null;

/** Text to save, or null when there is nothing worth keeping. */
export function encodeCart(owner: string | null, storeId: string | null, cart: Record<string, number>, now: number): string | null {
  if (!owner || !storeId || !Object.keys(cart).length) return null;
  return JSON.stringify({ owner, storeId, cart, at: now } satisfies SavedCart);
}

/** The saved cart, if it belongs to this account, is recent and is well formed. */
export function decodeCart(raw: string | null | undefined, owner: string | null, now: number): { storeId: string; cart: Record<string, number> } | null {
  if (!raw || !owner) return null;
  let v: Partial<SavedCart>;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || v.owner !== owner || typeof v.storeId !== 'string' || !ID.test(v.storeId)) return null;
  if (typeof v.at !== 'number' || now - v.at > CART_MAX_AGE_MS || v.at > now + 60 * 1000) return null;
  const cart: Record<string, number> = {};
  for (const [id, qty] of Object.entries(v.cart || {}).slice(0, MAX_LINES)) {
    if (ID.test(id) && Number.isInteger(qty) && qty >= 1) cart[id] = Math.min(MAX_QTY, qty);
  }
  return Object.keys(cart).length ? { storeId: v.storeId, cart } : null;
}

/** Drop lines the store no longer lists (they can't be ordered or shown). */
export function keepListed(cart: Record<string, number>, listedIds: Iterable<string>): Record<string, number> {
  const listed = new Set(listedIds);
  const next: Record<string, number> = {};
  for (const [id, qty] of Object.entries(cart)) if (listed.has(id)) next[id] = qty;
  return Object.keys(next).length === Object.keys(cart).length ? cart : next;
}
