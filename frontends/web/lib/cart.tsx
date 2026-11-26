'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StorefrontItem } from '@medrush/shared';

export interface CartLine {
  medicineId: string;
  name: string;
  packSize?: string;
  sellingPrice: number;
  mrp: number;
  requiresPrescription: boolean;
  qty: number;
}

interface CartState {
  vendorId: string | null;
  vendorName: string | null;
  lines: Record<string, CartLine>;
}

interface CartContextValue extends CartState {
  add: (vendorId: string, vendorName: string, item: StorefrontItem) => void;
  decrement: (medicineId: string) => void;
  remove: (medicineId: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  hasRx: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'medrush_cart';
const EMPTY: CartState = { vendorId: null, vendorName: null, lines: {} };

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(EMPTY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  // A cart holds items from ONE vendor (single-vendor fulfilment). Adding from a
  // different vendor resets the cart after a confirmation.
  const add = useCallback((vendorId: string, vendorName: string, item: StorefrontItem) => {
    setState((prev) => {
      let base = prev;
      if (prev.vendorId && prev.vendorId !== vendorId) {
        const ok = typeof window === 'undefined'
          ? true
          : window.confirm('Your cart has items from another pharmacy. Start a new cart with this pharmacy?');
        if (!ok) return prev;
        base = { ...EMPTY };
      }
      const id = item.medicine._id;
      const existing = base.lines[id];
      const line: CartLine = existing
        ? { ...existing, qty: existing.qty + 1 }
        : {
            medicineId: id,
            name: item.medicine.name,
            packSize: item.medicine.packSize,
            sellingPrice: item.sellingPrice,
            mrp: item.mrp,
            requiresPrescription: !!item.medicine.requiresPrescription,
            qty: 1
          };
      return { vendorId, vendorName, lines: { ...base.lines, [id]: line } };
    });
  }, []);

  const decrement = useCallback((medicineId: string) => {
    setState((prev) => {
      const line = prev.lines[medicineId];
      if (!line) return prev;
      const lines = { ...prev.lines };
      if (line.qty > 1) lines[medicineId] = { ...line, qty: line.qty - 1 };
      else delete lines[medicineId];
      const empty = Object.keys(lines).length === 0;
      return empty ? { ...EMPTY } : { ...prev, lines };
    });
  }, []);

  const remove = useCallback((medicineId: string) => {
    setState((prev) => {
      const lines = { ...prev.lines };
      delete lines[medicineId];
      const empty = Object.keys(lines).length === 0;
      return empty ? { ...EMPTY } : { ...prev, lines };
    });
  }, []);

  const clear = useCallback(() => setState({ ...EMPTY }), []);

  const lineList = Object.values(state.lines);
  const value = useMemo<CartContextValue>(() => ({
    ...state,
    add,
    decrement,
    remove,
    clear,
    count: lineList.reduce((a, l) => a + l.qty, 0),
    subtotal: Math.round(lineList.reduce((a, l) => a + l.qty * l.sellingPrice, 0) * 100) / 100,
    hasRx: lineList.some((l) => l.requiresPrescription)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state, add, decrement, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
