import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { ChevronRight, FileText, ShieldCheck, Snowflake, Store } from 'lucide-react-native';
import type { StorefrontItem } from '@medrush/shared';
import { Text } from '@/lib/T';
import { api, describeNetworkError } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { MedicineArt } from '@/lib/MedicineArt';
import { AddToCart } from '@/lib/AddToCart';
import { ProductRow } from '@/lib/ProductRow';
import { exactSaltOf, saltOf } from '@/lib/medicineSearch';
import { Empty, Btn, TopBar } from '@/lib/marketUI';
import { Skeleton } from '@/lib/motion';
import { inr } from '@/lib/market';
import { C, F, R, depth } from '@/lib/theme';

/** One medicine at one store: what it is, its price, same-salt options and what goes with it. */
export default function ProductDetail() {
  const { id, store, storeName } = useLocalSearchParams<{ id: string; store: string; storeName?: string }>();
  const insets = useSafeAreaInsets();
  const { cart, add, remove, count, storeId, selectStore } = useCart();
  const [items, setItems] = useState<StorefrontItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (store && storeId !== store) selectStore(String(store));
    api.getVendorStorefront(String(store)).then((r) => setItems(r.items)).catch((e) => setError(describeNetworkError(e)));
  }, [store, storeId, selectStore]);

  const item = items?.find((it) => it.medicine._id === id);
  const related = useMemo(() => {
    if (!items || !item) return { salt: [] as StorefrontItem[], strengths: [] as StorefrontItem[], with: [] as StorefrontItem[] };
    const salt = saltOf(item.medicine.genericName);
    const exact = exactSaltOf(item.medicine.genericName);
    const family = salt ? items.filter((it) => it.medicine._id !== id && saltOf(it.medicine.genericName) === salt) : [];
    // A different strength is not a swap: shown separately, with a warning and no "cheaper" nudge.
    const same = family.filter((it) => exactSaltOf(it.medicine.genericName) === exact);
    const strengths = family.filter((it) => exactSaltOf(it.medicine.genericName) !== exact);
    const familyIds = new Set(family.map((x) => x.medicine._id));
    const goesWith = items.filter((it) => it.medicine._id !== id && !familyIds.has(it.medicine._id) && it.inStock
      && !it.medicine.requiresPrescription && it.medicine.category === item.medicine.category).slice(0, 4);
    return { salt: same.sort((a, b) => a.sellingPrice - b.sellingPrice), strengths, with: goesWith };
  }, [items, item, id]);

  const open = (mid: string) => router.push({ pathname: '/product/[id]', params: { id: mid, store: String(store), storeName: storeName || '' } });
  const toCart = () => router.dismissTo({ pathname: '/pharmacy', params: { openCart: String(Date.now()) } });

  if (error) {
    return <View style={s.screen}><TopBar title="Medicine" /><Empty title="Couldn’t load this medicine" text={error} action={<Btn label="Go back" onPress={() => router.back()} />} /></View>;
  }
  if (!items) {
    return (
      <View style={s.screen}><TopBar title="Medicine" />
        <View style={{ padding: 16, gap: 12 }}><Skeleton height={220} radius={20} /><Skeleton height={28} width="70%" /><Skeleton height={18} width="50%" /><Skeleton height={56} radius={16} /></View>
      </View>
    );
  }
  if (!item) {
    return <View style={s.screen}><TopBar title="Medicine" /><Empty title="Not sold here any more" text="This store has taken it off its shelf. Try another pharmacy." action={<Btn label="Back to pharmacy" onPress={() => router.back()} />} /></View>;
  }

  const m = item.medicine;
  const off = item.mrp > item.sellingPrice ? Math.round(((item.mrp - item.sellingPrice) / item.mrp) * 100) : 0;
  const qty = cart[m._id] || 0;
  const cheapest = related.salt.find((x) => x.inStock && x.sellingPrice < item.sellingPrice);

  return (
    <View style={s.screen}>
      <TopBar title={storeName ? storeName.split(' · ')[0] : 'Medicine'} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 + insets.bottom }}>
        <Animated.View entering={FadeInDown.duration(250)}>
          <View>
            <MedicineArt name={m.name} form={m.form} category={m.category} height={220} style={{ borderRadius: 20 }} />
            {off >= 5 ? <Text style={s.offBadge}>{off}% OFF</Text> : null}
            {m.requiresPrescription ? <Text style={s.rxBadge}>Rx</Text> : null}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(40).duration(250)} style={{ gap: 4 }}>
          <Text style={s.title}>{m.name}</Text>
          <Text style={s.meta}>{[m.packSize, m.strength].filter(Boolean).join(' · ') || m.form}</Text>
          {m.genericName ? <Text style={s.salt}>Salt: <Text style={s.saltStrong}>{m.genericName}</Text></Text> : null}
          {m.manufacturer ? <Text style={s.meta}>By {m.manufacturer}</Text> : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(250)} style={s.priceCard}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={s.price}>{inr(item.sellingPrice)}</Text>
            {off >= 5 ? <Text style={s.mrp}>MRP {inr(item.mrp)}</Text> : null}
            {off >= 5 ? <Text style={s.save}>Save {inr(item.mrp - item.sellingPrice)}</Text> : null}
          </View>
          <Text style={s.meta}>Inclusive of all taxes</Text>
          <View style={s.stockRow}>
            <Store size={14} color={item.inStock ? C.mint : C.muted} />
            <Text style={[s.stock, { color: item.inStock ? C.mint : C.muted }]}>{item.inStock ? `In stock at ${storeName || 'this store'}` : 'Out of stock here right now'}</Text>
          </View>
        </Animated.View>

        {m.requiresPrescription ? (
          <View style={s.note}>
            <FileText size={18} color={C.brand} />
            <Text style={s.noteText}>Prescription needed. Attach it in the cart; a licensed pharmacist checks it before packing.</Text>
          </View>
        ) : null}
        {m.coldChain ? (
          <View style={s.note}>
            <Snowflake size={18} color={C.sky} />
            <Text style={s.noteText}>Kept cold. Delivered in a cooler bag; refrigerate when it arrives.</Text>
          </View>
        ) : null}

        {related.salt.length ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Same salt, other brands</Text>
            <Text style={s.meta}>Same salt and strength, different maker. Check with your doctor if your prescription names a brand.</Text>
            {related.salt.map((x) => (
              <ProductRow key={x.inventoryId} item={x} qty={cart[x.medicine._id] || 0} onAdd={() => add(x.medicine._id)} onRemove={() => remove(x.medicine._id)} onOpen={() => open(x.medicine._id)}
                note={x.sellingPrice < item.sellingPrice ? `${inr(item.sellingPrice - x.sellingPrice)} cheaper` : undefined} />
            ))}
          </View>
        ) : null}

        {related.strengths.length ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Same salt, different strength</Text>
            <Text style={s.meta}>Not a direct swap. Ask your doctor or pharmacist before changing the strength.</Text>
            {related.strengths.map((x) => (
              <ProductRow key={x.inventoryId} item={x} qty={cart[x.medicine._id] || 0} onAdd={() => add(x.medicine._id)} onRemove={() => remove(x.medicine._id)} onOpen={() => open(x.medicine._id)} />
            ))}
          </View>
        ) : null}

        {related.with.length ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Often bought with</Text>
            {related.with.map((x) => (
              <ProductRow key={x.inventoryId} item={x} qty={cart[x.medicine._id] || 0} onAdd={() => add(x.medicine._id)} onRemove={() => remove(x.medicine._id)} onOpen={() => open(x.medicine._id)} />
            ))}
          </View>
        ) : null}

        <View style={s.trust}>
          <ShieldCheck size={16} color={C.mint} />
          <Text style={s.meta}>Sold and packed by a licensed pharmacy. Sealed packs only.</Text>
        </View>
      </ScrollView>

      {/* Sticky buy bar */}
      <Animated.View entering={SlideInDown.springify().damping(18)} style={[s.bar, { paddingBottom: 12 + insets.bottom }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.barPrice}>{inr(item.sellingPrice)}</Text>
          {cheapest ? <Text style={s.barHint} numberOfLines={1}>Same salt from {inr(cheapest.sellingPrice)} below</Text> : <Text style={s.meta} numberOfLines={1}>{m.packSize || m.form}</Text>}
        </View>
        <View style={{ width: 132 }}>
          {item.inStock ? <AddToCart qty={qty} name={m.name} onAdd={() => add(m._id)} onRemove={() => remove(m._id)} size="lg" /> : <Text style={s.meta}>Out of stock</Text>}
        </View>
        {count > 0 ? (
          <Pressable onPress={toCart} style={({ pressed }) => [s.cartBtn, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`View cart, ${count} item${count === 1 ? '' : 's'}`}>
            <Text style={s.cartBtnText}>Cart · {count}</Text>
            <ChevronRight size={16} color={C.onBrand} />
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  offBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: C.mint, color: '#ffffff', fontFamily: F.bold, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  rxBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: C.card, color: C.brand, fontFamily: F.bold, fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  title: { fontFamily: F.display, fontSize: 24, lineHeight: 29, color: C.ink },
  meta: { fontFamily: F.medium, fontSize: 13, color: C.muted, lineHeight: 18 },
  salt: { fontFamily: F.medium, fontSize: 14, color: C.inkSoft },
  saltStrong: { fontFamily: F.bold, color: C.ink },
  priceCard: { backgroundColor: C.card, borderRadius: R.lg, padding: 14, gap: 4, ...depth.card },
  price: { fontFamily: F.display, fontSize: 26, color: C.ink },
  mrp: { fontFamily: F.medium, fontSize: 14, color: C.muted, textDecorationLine: 'line-through' },
  save: { fontFamily: F.bold, fontSize: 13, color: C.mint },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  stock: { fontFamily: F.semi, fontSize: 13 },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: C.card, borderRadius: R.md, padding: 12, borderWidth: 1, borderColor: C.border },
  noteText: { flex: 1, fontFamily: F.medium, fontSize: 13, lineHeight: 19, color: C.inkSoft },
  section: { backgroundColor: C.card, borderRadius: R.lg, paddingHorizontal: 14, paddingVertical: 12, gap: 2, ...depth.card },
  sectionTitle: { fontFamily: F.bold, fontSize: 16, color: C.ink, marginBottom: 2 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: C.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, ...depth.raised },
  barPrice: { fontFamily: F.bold, fontSize: 18, color: C.ink },
  barHint: { fontFamily: F.semi, fontSize: 12, color: C.mint },
  cartBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: C.brand, borderRadius: R.md, paddingHorizontal: 12, minHeight: 48 },
  cartBtnText: { color: C.onBrand, fontFamily: F.bold, fontSize: 14 }
});
