import { createContext, useCallback, useContext, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
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

  const value = useMemo(() => ({ storeId, cart, setCart, selectStore, add, remove, count }), [storeId, cart, selectStore, add, remove, count]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart must be used inside <CartProvider>');
  return v;
}
