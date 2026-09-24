import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pickAndUploadPrescription } from '@/lib/prescription';
import type { PharmacyVendor, StorefrontItem } from '@medrush/shared';
import { C, F } from '@/lib/theme';

const FALLBACK = { lat: 26.9110, lng: 75.8010 }; // launch city demo area (C-Scheme, Jaipur)

export default function Pharmacy() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState({ line1: '', pincode: '' });
  const [rx, setRx] = useState<{ uri: string; key?: string } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [vendors, setVendors] = useState<PharmacyVendor[]>([]);
  const [active, setActive] = useState<PharmacyVendor | null>(null);
  const [items, setItems] = useState<StorefrontItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let coords = FALLBACK;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(coords); // only a real fix is used as the delivery point
        }
      } catch { /* use fallback */ }

      try {
        const res = await api.getNearbyVendors({ ...coords, radiusKm: 10 });
        setVendors(res.vendors);
        if (res.vendors[0]) selectVendor(res.vendors[0]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load pharmacies');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectVendor(v: PharmacyVendor) {
    setActive(v);
    setItems([]);
    setCart({});
    try {
      const res = await api.getVendorStorefront(v._id);
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load storefront');
    }
  }

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));

  // Prices can change while the cart is open: refresh them without losing the cart.
  async function refreshPrices() {
    if (!active) return;
    try {
      const res = await api.getVendorStorefront(active._id);
      setItems(res.items);
    } catch { /* keep what we have */ }
  }

  function switchTo(storeId: string, name: string) {
    const known = vendors.find((v) => v._id === storeId);
    selectVendor(known || ({ _id: storeId, name } as PharmacyVendor));
  }

  /** Out here? Show which nearby store has it, or a same-salt brand that is in stock. */
  async function findElsewhere(medicineId: string, name: string) {
    try {
      const res = await api.getMedicineAvailability(medicineId, coords || FALLBACK);
      if (res.blocked) {
        Alert.alert(name, res.message || 'This item cannot be ordered online.');
        return;
      }
      const other = res.stores.find((s) => s.store.id !== active?._id);
      const sub = res.substitutes[0];
      const buttons: Array<{ text: string; style?: 'cancel'; onPress?: () => void }> = [];
      if (other) buttons.push({ text: `Shop at ${other.store.name}`, onPress: () => switchTo(other.store.id, other.store.name) });
      if (!other && sub) buttons.push({ text: `Find ${sub.medicine.name}`, onPress: () => findElsewhere(sub.medicine.id, sub.medicine.name) });
      buttons.push({ text: 'OK', style: 'cancel' });
      const lines = [
        other
          ? `${other.store.name} has it · ₹${other.sellingPrice} · ~${other.store.etaMinutes} min${other.confidence === 'LIKELY' ? ' (likely in stock)' : ''}`
          : 'No other pharmacy near you has it right now.',
        sub ? `Same medicine, other brand: ${sub.medicine.name} from ₹${sub.fromPrice}${sub.medicine.requiresPrescription ? ' (prescription needed)' : ''}. Check with your doctor if your prescription names a brand.` : ''
      ].filter(Boolean);
      Alert.alert(name, lines.join('\n\n'), buttons);
    } catch (e) {
      Alert.alert('Could not check other stores', describeNetworkError(e));
    }
  }
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartItems = items.filter((it) => cart[it.medicine._id]);
  const cartTotal = cartItems.reduce((sum, it) => sum + it.sellingPrice * cart[it.medicine._id], 0);
  const needsRx = cartItems.some((it) => it.medicine.requiresPrescription);

  async function attachPrescription() {
    const up = await pickAndUploadPrescription();
    if (up) setRx({ uri: up.uri, key: up.key });
  }

  async function placeOrder() {
    if (!session || session.kind !== 'patient') {
      router.push('/login');
      return;
    }
    if (!active) return;
    if (!address.line1.trim() || !/^\d{6}$/.test(address.pincode)) {
      Alert.alert('Address needed', 'Enter the delivery address and a 6-digit pincode.');
      return;
    }
    if (needsRx && !rx?.key) {
      Alert.alert('Prescription needed', 'Some items need a prescription photo.');
      return;
    }
    setPlacing(true);
    try {
      const res = await api.createOrder({
        vendorId: active._id,
        items: cartItems.map((it) => ({ medicineId: it.medicine._id, quantity: cart[it.medicine._id] })),
        deliveryAddress: { line1: address.line1.trim(), pincode: address.pincode },
        deliveryLocation: coords ? { coordinates: [coords.lng, coords.lat] } : undefined,
        prescriptionKey: rx?.key,
        paymentMode: 'COD', // online payment in the app comes with react-native-razorpay
        // The server refuses the order if the store changed a price since this screen loaded.
        quotedSubtotal: Math.round(cartTotal * 100) / 100
      });
      setCart({});
      setRx(null);
      Alert.alert('Order placed', `${res.order.orderNumber} — the pharmacy has been notified.`);
    } catch (e) {
      Alert.alert('Could not place order', describeNetworkError(e));
      refreshPrices();
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.brand} /><Text style={styles.muted}>Finding pharmacies…</Text></View>;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={{ paddingHorizontal: 16 }}>
        <Text style={styles.title}>Pharmacy</Text>
        <Text style={styles.muted}>Medicines from stores near you · ~30 min</Text>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vendorBar} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {vendors.map((v) => (
          <Pressable key={v._id} onPress={() => selectVendor(v)}
            style={[styles.chip, active?._id === v._id && styles.chipActive]}>
            <Text style={[styles.chipText, active?._id === v._id && styles.chipTextActive]}>{v.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={items}
        keyExtractor={(it) => it.inventoryId}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        ListEmptyComponent={<Text style={styles.muted}>No items. Seed demo data: npm run db:seed:pharmacy</Text>}
        renderItem={({ item: it }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{it.medicine.name}</Text>
              <Text style={styles.muted}>{it.medicine.packSize || it.medicine.form}</Text>
              <Text style={styles.price}>₹{it.sellingPrice}
                {it.mrp > it.sellingPrice ? <Text style={styles.strike}>  ₹{it.mrp}</Text> : null}
              </Text>
            </View>
            {it.inStock ? (
              <Pressable style={styles.addBtn} onPress={() => add(it.medicine._id)}>
                <Text style={styles.addBtnText}>{cart[it.medicine._id] ? `× ${cart[it.medicine._id]}` : 'Add'}</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.findBtn} onPress={() => findElsewhere(it.medicine._id, it.medicine.name)}>
                <Text style={styles.findBtnText}>Find nearby</Text>
              </Pressable>
            )}
          </View>
        )}
      />

      {cartCount > 0 && (
        <View style={styles.checkout}>
          <Text style={styles.cartText}>{cartCount} item(s) · ₹{Math.round(cartTotal * 100) / 100}</Text>
          <TextInput style={styles.input} placeholder="Delivery address" placeholderTextColor={C.muted}
            value={address.line1} onChangeText={(line1) => setAddress((a) => ({ ...a, line1 }))} />
          <TextInput style={styles.input} placeholder="Pincode" placeholderTextColor={C.muted} keyboardType="number-pad" maxLength={6}
            value={address.pincode} onChangeText={(pincode) => setAddress((a) => ({ ...a, pincode }))} />
          {needsRx && (
            <View style={styles.rxRow}>
              <Text style={styles.rxText}>{rx?.key ? 'Prescription attached' : 'Prescription required'}</Text>
              <Pressable onPress={attachPrescription}><Text style={styles.rxLink}>{rx?.key ? 'Change' : 'Attach'}</Text></Pressable>
            </View>
          )}
          <Pressable style={[styles.placeBtn, placing && { opacity: 0.6 }]} disabled={placing} onPress={placeOrder}>
            {placing ? <ActivityIndicator color={C.onBrand} /> : (
              <Text style={styles.addBtnText}>{session?.kind === 'patient' ? 'Place order · Cash on delivery' : 'Log in as a customer to order'}</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.bg },
  title: { fontFamily: F.display, fontSize: 34, color: C.ink },
  vendorBar: { maxHeight: 60, flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.card, borderRadius: 999, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { color: C.ink, fontFamily: F.semi },
  chipTextActive: { color: C.onBrand },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border },
  name: { fontSize: 15, fontFamily: F.bold, color: C.ink },
  muted: { color: C.muted, fontSize: 13, fontFamily: F.medium },
  price: { marginTop: 6, fontFamily: F.heavy, color: C.ink },
  strike: { color: C.muted, textDecorationLine: 'line-through', fontFamily: F.regular, fontSize: 12 },
  addBtn: { backgroundColor: C.brand, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12 },
  findBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: C.brand },
  findBtnText: { color: C.brand, fontFamily: F.bold, fontSize: 13 },
  addBtnText: { color: C.onBrand, fontFamily: F.bold },
  error: { backgroundColor: C.roseSoft, color: C.roseInk, padding: 10, margin: 12, borderRadius: 10, fontFamily: F.semi },
  checkout: { backgroundColor: C.night, padding: 16, gap: 8, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  cartText: { color: C.onNight, fontFamily: F.bold },
  input: { backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontFamily: F.medium },
  rxRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rxText: { color: C.onNight, flex: 1, fontFamily: F.medium },
  rxLink: { color: C.gold, fontFamily: F.bold },
  placeBtn: { backgroundColor: C.brand, paddingVertical: 13, borderRadius: 12, alignItems: 'center' }
});
