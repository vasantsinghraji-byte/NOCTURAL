import { useEffect, useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { ArrowLeft, ChevronRight, Clock, Search, TrendingUp, X } from 'lucide-react-native';
import type { StorefrontItem } from '@medrush/shared';
import { Text } from '@/lib/T';
import { api, describeNetworkError } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { ProductRow } from '@/lib/ProductRow';
import { searchMedicines } from '@/lib/medicineSearch';
import { Skeleton } from '@/lib/motion';
import { C, F, R, depth } from '@/lib/theme';

const RECENT_KEY = 'nabz.pharmacy.recentSearches';
const MAX_RECENT = 6;
// Common reasons people open a pharmacy app; only the ones this store can answer are shown.
const POPULAR = ['Paracetamol', 'Fever', 'Cough syrup', 'Cold', 'Acidity', 'ORS', 'Vitamin C', 'Thermometer', 'Antiseptic', 'Diabetes'];

/** Full-screen search of one store: suggestions before typing, instant results while typing. */
export default function PharmacySearch() {
  const { store, storeName } = useLocalSearchParams<{ store: string; storeName?: string }>();
  const insets = useSafeAreaInsets();
  const { cart, add, remove, count, storeId, selectStore } = useCart();
  const [items, setItems] = useState<StorefrontItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (store && storeId !== store) selectStore(String(store));
    api.getVendorStorefront(String(store)).then((r) => setItems(r.items)).catch((e) => setError(describeNetworkError(e)));
    SecureStore.getItemAsync(RECENT_KEY).then((v) => { try { setRecent(v ? JSON.parse(v) : []); } catch { setRecent([]); } }).catch(() => undefined);
  }, [store, storeId, selectStore]);

  const get = (it: StorefrontItem) => it.medicine;
  const results = useMemo(() => (items && q.trim() ? searchMedicines(items, q, get) : []), [items, q]);
  const popular = useMemo(() => (items ? POPULAR.filter((p) => searchMedicines(items, p, get).length > 0 || items.some((it) => (it.medicine.category || '').toLowerCase().includes(p.toLowerCase()))).slice(0, 8) : []), [items]);

  function remember(term: string) {
    const t = term.trim();
    if (t.length < 2) return;
    const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
    setRecent(next);
    SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
  }
  const clearRecent = () => { setRecent([]); SecureStore.deleteItemAsync(RECENT_KEY).catch(() => undefined); };
  const open = (it: StorefrontItem) => {
    remember(q || it.medicine.name);
    router.push({ pathname: '/product/[id]', params: { id: it.medicine._id, store: String(store), storeName: storeName || '' } });
  };
  const toCart = () => router.dismissTo({ pathname: '/pharmacy', params: { openCart: String(Date.now()) } });

  return (
    <View style={[s.screen, { paddingTop: insets.top + 8 }]}>
      <View style={s.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={s.back}><ArrowLeft size={22} color={C.ink} /></Pressable>
        <View style={s.field}>
          <Search size={18} color={C.muted} />
          <TextInput autoFocus value={q} onChangeText={setQ} placeholder={`Search ${storeName ? storeName.split(' · ')[0] : 'this store'}: name or salt`} placeholderTextColor={C.muted}
            style={s.input} returnKeyType="search" autoCorrect={false} onSubmitEditing={() => { remember(q); Keyboard.dismiss(); }} accessibilityLabel="Search medicines" />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search"><X size={18} color={C.muted} /></Pressable> : null}
        </View>
      </View>

      {error ? <Text style={s.error}>{error}</Text> : !items ? (
        <View style={{ padding: 16, gap: 12 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={64} radius={14} />)}</View>
      ) : !q.trim() ? (
        <Animated.View entering={FadeIn.duration(180)} style={{ padding: 16, gap: 20 }}>
          {recent.length ? (
            <View style={{ gap: 10 }}>
              <View style={s.headRow}>
                <Text style={s.head}>Recent searches</Text>
                <Pressable onPress={clearRecent} hitSlop={8} accessibilityRole="button"><Text style={s.link}>Clear</Text></Pressable>
              </View>
              <View style={s.chips}>
                {recent.map((r) => (
                  <Pressable key={r} onPress={() => setQ(r)} style={s.chip} accessibilityRole="button"><Clock size={14} color={C.muted} /><Text style={s.chipText}>{r}</Text></Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {popular.length ? (
            <View style={{ gap: 10 }}>
              <Text style={s.head}>Popular at this store</Text>
              <View style={s.chips}>
                {popular.map((p) => (
                  <Pressable key={p} onPress={() => setQ(p)} style={s.chip} accessibilityRole="button"><TrendingUp size={14} color={C.brand} /><Text style={s.chipText}>{p}</Text></Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <Text style={s.hint}>Tip: search by salt too, e.g. “paracetamol” finds every brand that has it.</Text>
        </Animated.View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(it) => it.inventoryId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 + insets.bottom }}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListHeaderComponent={<Text style={s.count}>{results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : ''}</Text>}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center', gap: 6 }}>
              <Text style={s.head}>No match for “{q.trim()}”</Text>
              <Text style={[s.hint, { textAlign: 'center' }]}>Check the spelling, try the salt name, or look in another pharmacy.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <ProductRow item={item} qty={cart[item.medicine._id] || 0} onAdd={() => { remember(q); add(item.medicine._id); }} onRemove={() => remove(item.medicine._id)} onOpen={() => open(item)} />
          )}
        />
      )}

      {count > 0 ? (
        <Animated.View entering={SlideInDown.springify().damping(18)} style={[s.cartWrap, { bottom: 12 + insets.bottom }]}>
          <Pressable onPress={toCart} style={({ pressed }) => [s.cartBar, pressed && { opacity: 0.9 }]} accessibilityRole="button" accessibilityLabel={`${count} items in cart. View cart`}>
            <Text style={s.cartText}>{count} item{count === 1 ? '' : 's'} in cart</Text>
            <Text style={s.cartCta}>View cart</Text>
            <ChevronRight size={18} color={C.onBrand} />
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, minHeight: 48, ...depth.card },
  input: { flex: 1, color: C.ink, fontFamily: F.medium, fontSize: 15, paddingVertical: 10 },
  error: { margin: 16, padding: 12, borderRadius: R.md, backgroundColor: C.roseSoft, color: C.roseInk, fontFamily: F.semi },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  head: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  link: { fontFamily: F.bold, fontSize: 13, color: C.brand },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: R.full, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipText: { fontFamily: F.semi, fontSize: 13, color: C.ink },
  hint: { fontFamily: F.medium, fontSize: 12.5, color: C.muted, lineHeight: 18 },
  count: { fontFamily: F.semi, fontSize: 12, color: C.muted, paddingVertical: 6 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  cartWrap: { position: 'absolute', left: 12, right: 12 },
  cartBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.brand, borderRadius: R.lg, paddingHorizontal: 16, minHeight: 56, ...depth.button },
  cartText: { flex: 1, color: C.onBrand, fontFamily: F.semi, fontSize: 14 },
  cartCta: { color: C.onBrand, fontFamily: F.bold, fontSize: 15 }
});
