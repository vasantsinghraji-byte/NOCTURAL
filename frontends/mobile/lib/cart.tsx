import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from './auth';
import { CART_KEY, cartOwner, decodeCart, encodeCart } from './cartStore';
import { tap } from './motion';

/**
 * The medicine cart, shared by the Pharmacy tab, search and product pages.
 * One store at a time (orders are per store): `storeId` says which. Quantities
 * are keyed by medicine id; prices and names come from that store's storefront.
 */
type Lines = Record<string, number>;
interface CartState {
  storeId: string | null;
  cart: Lines;
  setCart: Dispatch<SetStateAction<Lines>>;
  /** Make `id` the cart's store; clears the cart when it changes. */
  selectStore: (id: string) => void;
  add: (medicineId: string) => void;
  remove: (medicineId: string) => void;
  count: number;
}

const Ctx = createContext<CartState | null>(null);
const MAX_PER_LINE = 20;

export function CartProvider({ children }: { children: ReactNode }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [cart, setCart] = useState<Lines>({});

  const current = useRef<string | null>(null);
  const selectStore = useCallback((id: string) => {
    if (current.current === id) return;
    current.current = id;
    setStoreId(id);
    setCart({});
  }, []);
  const add = useCallback((id: string) => {
    tap();
    setCart((c) => ({ ...c, [id]: Math.min(MAX_PER_LINE, (c[id] || 0) + 1) }));
  }, []);
  const remove = useCallback((id: string) => {
    tap();
    setCart((c) => {
      const next = { ...c };
      if ((next[id] || 0) <= 1) delete next[id]; else next[id] -= 1;
      return next;
    });
  }, []);
  const count = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);

  // Keep the cart if Android closes the app (lib/cartStore.ts): same account, one day.
  const { ready, session } = useAuth();
  const owner = cartOwner(session);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!ready) return undefined;
    // A different account (or signed out): start empty, never show the last person's cart.
    current.current = null;
    setStoreId(null);
    setCart({});
    if (!owner) {
      SecureStore.deleteItemAsync(CART_KEY).catch(() => undefined);
      setLoadedFor(null);
      return undefined;
    }
    let live = true;
    SecureStore.getItemAsync(CART_KEY)
      .then((raw) => {
        const saved = decodeCart(raw, owner, Date.now());
        // Only if nothing was picked meanwhile.
        if (live && saved && current.current === null) {
          current.current = saved.storeId;
          setStoreId(saved.storeId);
          setCart(saved.cart);
        }
      })
      .catch(() => undefined)
      .finally(() => { if (live) setLoadedFor(owner); });
    return () => { live = false; };
  }, [ready, owner]);
  useEffect(() => {
    // Not before the saved cart was read: saving the empty start would erase it.
    if (!owner || loadedFor !== owner) return;
    const raw = encodeCart(owner, storeId, cart, Date.now());
    (raw ? SecureStore.setItemAsync(CART_KEY, raw) : SecureStore.deleteItemAsync(CART_KEY)).catch(() => undefined);
  }, [owner, loadedFor, storeId, cart]);

  const value = useMemo(() => ({ storeId, cart, setCart, selectStore, add, remove, count }), [storeId, cart, selectStore, add, remove, count]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart must be used inside <CartProvider>');
  return v;
}
