import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, MessageCircle, Package, Stethoscope } from 'lucide-react-native';
import type { CareBooking, ChatThreadView, PharmacyOrder } from '@medrush/shared';
import { pickActive, type ActiveItem } from './activeItems';
import { Text } from '@/lib/T';
import { api } from './api';
import { useAuth } from './auth';
import { BrandGradient } from './BrandHeader';
import { C, F, depth } from './theme';

/**
 * The live strip above the tabs: the customer's current visit or medicine order
 * on every tab, like a live food-delivery order. Tap it for the full screen and
 * keep browsing the rest of the app meanwhile. What qualifies: lib/activeItems.ts.
 */
export const STRIP_SPACE = 76; // strip height + gap above the tab bar
const REFRESH_MS = 15_000;

interface ActiveState { item: ActiveItem | null; refresh: () => void }
const Ctx = createContext<ActiveState>({ item: null, refresh: () => undefined });

export function ActiveOrderProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [item, setItem] = useState<ActiveItem | null>(null);
  const busy = useRef(false);
  const signedIn = session?.kind === 'patient';

  const refresh = useCallback(() => {
    if (!signedIn) { setItem(null); return; }
    if (busy.current) return;
    busy.current = true;
    Promise.all([
      api.getMyCareBookings().then((r) => r.data || r.bookings || []).catch(() => [] as CareBooking[]),
      api.getMyOrders({ limit: 10 }).then((r) => r.orders).catch(() => [] as PharmacyOrder[]),
      api.chatThreads().then((r) => r.threads).catch(() => [] as ChatThreadView[])
    ]).then(([visits, orders, threads]) => setItem(pickActive(visits, orders, threads)[0] || null))
      .finally(() => { busy.current = false; });
  }, [signedIn]);

  useEffect(() => {
    refresh();
    if (!signedIn) return undefined;
    const tm = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, REFRESH_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => { clearInterval(tm); sub.remove(); };
  }, [refresh, signedIn]);

  const value = useMemo(() => ({ item, refresh }), [item, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useActiveOrder = () => useContext(Ctx);

/** Opens the full screen for the item: live tracking for a visit, the order in Bookings. */
export function openActive(item: ActiveItem) {
  if (item.kind === 'VISIT') router.push({ pathname: '/track', params: { id: item.id } });
  else router.push({ pathname: '/bookings', params: { tab: 'orders' } });
}

export type { ActiveItem };

/** The strip itself (rendered by the tab bar, just above it). */
export function LiveOrderStrip({ item, bottom }: { item: ActiveItem; bottom: number }) {
  const Icon = item.kind === 'VISIT' ? Stethoscope : Package;
  return (
    <Pressable onPress={() => openActive(item)} style={({ pressed }) => [s.strip, { bottom }, depth.raised, pressed && { transform: [{ scale: 0.98 }] }]}
      accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.subtitle}. Open`}>
      <BrandGradient radius={18} />
      <View style={s.icon}>
        <Icon size={20} color={C.onHeader} />
        {item.live ? <View style={s.pulse} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.title} numberOfLines={1}>{item.title}</Text>
        <Text style={s.sub} numberOfLines={1}>{item.subtitle}</Text>
      </View>
      {item.unread > 0 ? (
        <View style={s.unread}><MessageCircle size={12} color={C.ink} /><Text style={s.unreadText}>{item.unread}</Text></View>
      ) : null}
      {item.more > 0 ? <Text style={s.more}>+{item.more}</Text> : null}
      <ChevronRight size={20} color={C.onHeader} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  strip: { position: 'absolute', left: 12, right: 12, height: 64, borderRadius: 18, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, backgroundColor: C.brand },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.headerGlass, borderWidth: 1, borderColor: C.headerGlassBorder },
  pulse: { position: 'absolute', top: -3, right: -3, width: 12, height: 12, borderRadius: 6, backgroundColor: C.mint, borderWidth: 2, borderColor: '#ffffff' },
  title: { color: C.onHeader, fontFamily: F.bold, fontSize: 15 },
  sub: { color: C.onHeaderMuted, fontFamily: F.medium, fontSize: 12.5, marginTop: 1 },
  unread: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.plus, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  unreadText: { color: C.ink, fontFamily: F.heavy, fontSize: 11 },
  more: { color: C.onHeader, fontFamily: F.bold, fontSize: 12 }
});
