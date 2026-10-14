import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronRight, Clock, Minus, Pill, Plus, Truck } from 'lucide-react-native';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarSpace } from '@/lib/PillTabBar';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pickAndUploadPrescription } from '@/lib/prescription';
import type { DeliveryQuote, PayMethod, PharmacyVendor, StorefrontItem } from '@medrush/shared';
import { C, F, R } from '@/lib/theme';
import { BottomSheet } from '@/lib/marketUI';
import { inr } from '@/lib/market';
import { appAlert } from '@/lib/dialog';
import { PaymentSheet } from '@/lib/paymentSheet';
import { RecipientPicker, rememberRecipient } from '@/lib/recipients';
import { PaymentDismissedError, payOrderOnline } from '@/lib/payments';

const FALLBACK = { lat: 26.9110, lng: 75.8010 }; // launch city demo area (C-Scheme, Jaipur)

export default function Pharmacy() {
  const params = useLocalSearchParams<{ refill?: string }>();
  const [refillId, setRefillId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const { session } = useAuth();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState({ line1: '', pincode: '' });
  const [rx, setRx] = useState<{ uri: string; key?: string } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [paySheet, setPaySheet] = useState(false);
  // Ordering medicines for someone else (e.g. parents in another city).
  const [forOther, setForOther] = useState(false);
  const [recipient, setRecipient] = useState({ name: '', phone: '' });
  const [onlinePay, setOnlinePay] = useState(false);
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
          // A GPS fix can take ages indoors: use the last known position, and
          // never wait more than 8 s before showing stores.
          const fix = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))
          ]).catch(() => null);
          const pos = fix || await Location.getLastKnownPositionAsync().catch(() => null);
          if (pos) {
            coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCoords(coords); // only a real fix is used as the delivery point
          }
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
  const remove = (id: string) => setCart((c) => {
    const next = { ...c };
    if ((next[id] || 0) <= 1) delete next[id]; else next[id] -= 1;
    return next;
  });

  // "Order again" from a refill reminder: same store, same medicines, ready to check out.
  useEffect(() => {
    if (!params.refill) return;
    (async () => {
      try {
        const r = await api.refillReorder(String(params.refill));
        if (!r.vendor || !r.vendor.available) { appAlert('That store isn’t taking orders', 'Pick another pharmacy below; your medicines are listed in Account → Medicine refills.'); return; }
        await selectVendor({ _id: r.vendor._id, name: r.vendor.name } as PharmacyVendor);
        setCart(Object.fromEntries(r.items.map((i) => [String(i.medicineId), i.quantity])));
        setRefillId(String(params.refill));
      } catch (e) { setError(describeNetworkError(e)); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.refill]);

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

  /** Back-in-stock alert at the customer's location. */
  async function notifyMe(medicineId: string) {
    if (!session || session.kind !== 'patient') {
      router.push('/login');
      return;
    }
    try {
      await api.notifyWhenInStock(medicineId, coords || FALLBACK);
      appAlert("We'll let you know", 'You will get a notification when a pharmacy near you has it.');
    } catch (e) {
      appAlert('Could not set the alert', describeNetworkError(e));
    }
  }

  /** Out here? Show which nearby store has it, or a same-salt brand that is in stock. */
  async function findElsewhere(medicineId: string, name: string) {
    try {
      const res = await api.getMedicineAvailability(medicineId, coords || FALLBACK);
      if (res.blocked) {
        appAlert(name, res.message || 'This item cannot be ordered online.');
        return;
      }
      const other = res.stores.find((s) => s.store.id !== active?._id);
      const sub = res.substitutes[0];
      const buttons: Array<{ text: string; style?: 'cancel'; onPress?: () => void }> = [];
      if (other) buttons.push({ text: `Shop at ${other.store.name}`, onPress: () => switchTo(other.store.id, other.store.name) });
      if (!other && sub) buttons.push({ text: `Find ${sub.medicine.name}`, onPress: () => findElsewhere(sub.medicine.id, sub.medicine.name) });
      if (!other) buttons.push({ text: 'Notify me', onPress: () => notifyMe(medicineId) });
      buttons.push({ text: 'OK', style: 'cancel' });
      const lines = [
        other
          ? `${other.store.name} has it · ₹${other.sellingPrice} · ~${other.store.etaMinutes} min${other.confidence === 'LIKELY' ? ' (likely in stock)' : ''}`
          : 'No other pharmacy near you has it right now.',
        sub ? `Same medicine, other brand: ${sub.medicine.name} from ₹${sub.fromPrice}${sub.medicine.requiresPrescription ? ' (prescription needed)' : ''}. Check with your doctor if your prescription names a brand.` : ''
      ].filter(Boolean);
      appAlert(name, lines.join('\n\n'), buttons);
    } catch (e) {
      appAlert('Could not check other stores', describeNetworkError(e));
    }
  }
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartItems = items.filter((it) => cart[it.medicine._id]);
  const cartTotal = cartItems.reduce((sum, it) => sum + it.sellingPrice * cart[it.medicine._id], 0);
  const needsRx = cartItems.some((it) => it.medicine.requiresPrescription);
  const subtotal = Math.round(cartTotal * 100) / 100;
  const etaMinutes = active?.eta ? Math.max(active.eta.prepMinutes, active.eta.assignmentMinutes) + active.eta.lastMileMinutes : null;
  const [cartOpen, setCartOpen] = useState(false);

  // The delivery fee for this basket from this store (distance-based below the
  // free-delivery amount), refreshed as the cart changes. Signed-in customers only.
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const isPatient = session?.kind === 'patient';
  useEffect(() => {
    if (!active || !isPatient || subtotal <= 0) { setQuote(null); return undefined; }
    let live = true;
    const tm = setTimeout(() => {
      api.quoteDelivery({ vendorId: active._id, itemsSubtotal: subtotal, ...(coords || {}) })
        .then((q) => { if (live) setQuote(q); })
        .catch(() => { if (live) setQuote(null); });
    }, 350);
    return () => { live = false; clearTimeout(tm); };
  }, [active, isPatient, subtotal, coords]);
  useEffect(() => { if (cartCount === 0) setCartOpen(false); }, [cartCount]);

  async function attachPrescription() {
    const up = await pickAndUploadPrescription();
    if (up) setRx({ uri: up.uri, key: up.key });
  }

  useEffect(() => {
    api.getPaymentOptions().then((o) => setOnlinePay(o.online && !!o.razorpayKeyId)).catch(() => setOnlinePay(false));
  }, []);

  function placeOrder() {
    if (!session || session.kind !== 'patient') {
      router.push('/login');
      return;
    }
    if (!active) return;
    if (!address.line1.trim() || !/^\d{6}$/.test(address.pincode)) {
      appAlert('Address needed', 'Enter the delivery address and a 6-digit pincode.');
      return;
    }
    if (needsRx && !rx?.key) {
      appAlert('Prescription needed', 'Some items need a prescription photo.');
      return;
    }
    if (forOther && (recipient.name.trim().length < 2 || !/^[6-9]\d{9}$/.test(recipient.phone))) {
      appAlert('Who receives it?', 'Add the name and 10-digit mobile number of the person receiving the order.');
      return;
    }
    if (quote?.belowMinimum) {
      appAlert('Add a little more', `${active.name} takes orders from ${inr(quote.minOrderValue)}.`);
      return;
    }
    // One sheet at a time: close the cart before the payment sheet slides up.
    setCartOpen(false);
    setTimeout(() => setPaySheet(true), 300);
  }

  async function submitOrder(method: PayMethod) {
    setPaySheet(false);
    if (!active) return;
    const prepaid = method !== 'cod';
    setPlacing(true);
    try {
      const res = await api.createOrder({
        vendorId: active._id,
        items: cartItems.map((it) => ({ medicineId: it.medicine._id, quantity: cart[it.medicine._id] })),
        deliveryAddress: {
          line1: address.line1.trim(),
          pincode: address.pincode,
          ...(forOther ? { contactName: recipient.name.trim(), contactPhone: recipient.phone } : {})
        },
        deliveryLocation: coords ? { coordinates: [coords.lng, coords.lat] } : undefined,
        prescriptionKey: rx?.key,
        paymentMode: prepaid ? 'PREPAID' : 'COD',
        // The server refuses the order if the store changed a price since this screen loaded.
        quotedSubtotal: Math.round(cartTotal * 100) / 100
      });
      setCart({});
      setRx(null);
      if (refillId) { api.refillOrdered(refillId, res.order._id).catch(() => undefined); setRefillId(null); }
      if (forOther) rememberRecipient(recipient).catch(() => undefined);
      if (!prepaid) {
        appAlert('Order placed', `${res.order.orderNumber}: the pharmacy has been notified.`);
        return;
      }
      try {
        await payOrderOnline(res.order._id, method, { name: session?.name, email: session?.email });
        appAlert('Paid', `${res.order.orderNumber}: payment received and the pharmacy has been notified.`);
      } catch (payErr) {
        const mins = res.order.paymentExpiresAt ? Math.max(1, Math.round((new Date(res.order.paymentExpiresAt).getTime() - Date.now()) / 60000)) : 15;
        appAlert(
          payErr instanceof PaymentDismissedError ? 'Payment not finished' : 'Payment failed',
          `${payErr instanceof PaymentDismissedError ? '' : `${describeNetworkError(payErr)}

`}Your order ${res.order.orderNumber} is saved for ${mins} min. Pay from Bookings → Medicine orders.`,
          [{ text: 'Go to Bookings', onPress: () => router.push('/bookings') }, { text: 'OK', style: 'cancel' }]
        );
      }
    } catch (e) {
      appAlert('Could not place order', describeNetworkError(e));
      refreshPrices();
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={C.brand} /><Text style={styles.muted}>Finding pharmacies near you…</Text></View>;
  }

  const fee = quote?.deliveryFee;
  const toFree = quote && quote.deliveryFee > 0 ? quote.breakdown.amountToFreeDelivery : 0;
  const freeAt = quote?.breakdown.freeDeliveryAbove || 0;
  const payable = quote ? quote.total : subtotal;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Pharmacy</Text>
        <View style={styles.promise}>
          <Clock size={14} color={C.ink} />
          <Text style={styles.promiseText}>{etaMinutes ? `Delivery in ${etaMinutes} min` : 'Delivery in ~30 min'}</Text>
        </View>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vendorBar} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' }}>
        {vendors.map((v) => (
          <Pressable key={v._id} onPress={() => selectVendor(v)} accessibilityRole="button" accessibilityState={{ selected: active?._id === v._id }}
            style={[styles.chip, active?._id === v._id && styles.chipActive]}>
            <Text style={[styles.chipText, active?._id === v._id && styles.chipTextActive]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{v.name}</Text>
            {typeof v.distanceKm === 'number' ? <Text style={[styles.chipMeta, active?._id === v._id && styles.chipTextActive]}>{v.distanceKm.toFixed(1)} km</Text> : null}
          </Pressable>
        ))}
      </ScrollView>

      {/* Three products per row, like quick-commerce apps */}
      <FlatList
        data={items}
        keyExtractor={(it) => it.inventoryId}
        numColumns={3}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, gap: 8, paddingBottom: tabSpace + (cartCount > 0 ? 72 : 0) }}
        ListEmptyComponent={<Text style={[styles.muted, { padding: 16 }]}>{active ? 'This pharmacy has no medicines listed yet.' : 'No pharmacy delivers here yet.'}</Text>}
        renderItem={({ item: it }) => {
          const off = it.mrp > it.sellingPrice ? Math.round(((it.mrp - it.sellingPrice) / it.mrp) * 100) : 0;
          const qty = cart[it.medicine._id] || 0;
          return (
            <View style={styles.tile}>
              <View style={styles.tileImage}>
                <Pill size={26} color={C.faint} strokeWidth={1.6} />
                {off >= 5 ? <Text style={styles.off}>{off}% OFF</Text> : null}
                {it.medicine.requiresPrescription ? <Text style={styles.rxTag}>Rx</Text> : null}
              </View>
              <Text style={styles.tileName} numberOfLines={2}>{it.medicine.name}</Text>
              <Text style={styles.tileMeta} numberOfLines={1}>{it.medicine.packSize || it.medicine.form}</Text>
              <View style={{ marginTop: 'auto', gap: 6 }}>
                <View>
                  <Text style={styles.tilePrice}>{inr(it.sellingPrice)}</Text>
                  {it.mrp > it.sellingPrice ? <Text style={styles.strike}>MRP {inr(it.mrp)}</Text> : null}
                </View>
                {!it.inStock ? (
                  <Pressable style={styles.findBtn} onPress={() => findElsewhere(it.medicine._id, it.medicine.name)} accessibilityRole="button" accessibilityLabel={`${it.medicine.name} is out of stock. Find it nearby`}>
                    <Text style={styles.findBtnText}>Find nearby</Text>
                  </Pressable>
                ) : qty ? (
                  <Stepper qty={qty} name={it.medicine.name} onAdd={() => add(it.medicine._id)} onRemove={() => remove(it.medicine._id)} />
                ) : (
                  <Pressable style={({ pressed }) => [styles.addBtn, pressed && { backgroundColor: C.brandSoft }]} onPress={() => add(it.medicine._id)}
                    accessibilityRole="button" accessibilityLabel={`Add ${it.medicine.name}`}>
                    <Text style={styles.addBtnText}>ADD</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Cart bar: what's in the bag and what it costs, one tap to the bill */}
      {cartCount > 0 && (
        <View style={[styles.cartDock, { bottom: tabSpace - 4 }]}>
          {toFree > 0 ? (
            <View style={styles.nudge}>
              <Truck size={14} color={C.mint} />
              <Text style={styles.nudgeText} numberOfLines={1}>Add {inr(toFree)} more for free delivery</Text>
            </View>
          ) : quote && quote.deliveryFee === 0 ? (
            <View style={styles.nudge}>
              <Truck size={14} color={C.mint} />
              <Text style={styles.nudgeText} numberOfLines={1}>{quote.breakdown.waiver === 'MEMBER' ? 'Free delivery with Nabz Plus' : 'Free delivery on this order'}</Text>
            </View>
          ) : null}
          <Pressable style={({ pressed }) => [styles.cartBar, pressed && { opacity: 0.92 }]} onPress={() => setCartOpen(true)} accessibilityRole="button"
            accessibilityLabel={`${cartCount} items, ${inr(payable)}. View cart`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cartCount}>{cartCount} item{cartCount === 1 ? '' : 's'}</Text>
              <Text style={styles.cartTotal}>{inr(payable)}{quote ? '' : ' + delivery'}</Text>
            </View>
            <Text style={styles.cartCta}>View cart</Text>
            <ChevronRight size={18} color={C.onBrand} />
          </Pressable>
        </View>
      )}

      <BottomSheet visible={cartOpen} onClose={() => setCartOpen(false)} title={active ? `Your cart · ${active.name}` : 'Your cart'}>
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
          <View style={styles.group}>
            {cartItems.map((it) => (
              <View key={it.inventoryId} style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName} numberOfLines={2}>{it.medicine.name}</Text>
                  <Text style={styles.tileMeta}>{it.medicine.packSize || it.medicine.form}</Text>
                </View>
                <View style={{ width: 96 }}>
                  <Stepper qty={cart[it.medicine._id]} name={it.medicine.name} onAdd={() => add(it.medicine._id)} onRemove={() => remove(it.medicine._id)} />
                </View>
                <Text style={styles.linePrice}>{inr(it.sellingPrice * cart[it.medicine._id])}</Text>
              </View>
            ))}
          </View>

          {toFree > 0 && freeAt > 0 ? (
            <View style={styles.progressWrap}>
              <Text style={styles.nudgeText}>Add {inr(toFree)} more for free delivery</Text>
              <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, (subtotal / freeAt) * 100)}%` }]} /></View>
            </View>
          ) : null}

          {/* Bill */}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Bill details</Text>
            <BillRow label="Item total" value={inr(subtotal)} />
            <BillRow
              label={quote && quote.breakdown.distanceKm !== null && quote.deliveryFee > 0 ? `Delivery fee · ${quote.breakdown.chargedKm} km` : 'Delivery fee'}
              value={!isPatient ? 'At checkout' : fee === undefined ? '…' : fee === 0 ? 'FREE' : inr(fee)}
              good={fee === 0}
            />
            {quote && (quote.breakdown.surgeAmount > 0 || quote.breakdown.nightSurcharge > 0) ? (
              <Text style={styles.billNote}>
                Includes {[quote.breakdown.surgeAmount > 0 ? `${inr(quote.breakdown.surgeAmount)} busy-hours fee` : '', quote.breakdown.nightSurcharge > 0 ? `${inr(quote.breakdown.nightSurcharge)} late-night fee` : ''].filter(Boolean).join(' and ')}.
              </Text>
            ) : null}
            <View style={styles.billDivider} />
            <BillRow label="To pay" value={inr(payable)} strong />
          </View>

          <View style={styles.group}>
            <Text style={styles.groupTitle}>Deliver to</Text>
            <View style={styles.seg}>
              {[{ v: false, t: 'Me' }, { v: true, t: 'Someone else' }].map((o) => (
                <Pressable key={o.t} onPress={() => setForOther(o.v)} style={[styles.segBtn, forOther === o.v && styles.segOn]}
                  accessibilityRole="radio" accessibilityState={{ checked: forOther === o.v }}>
                  <Text style={[styles.segText, forOther === o.v && styles.segTextOn]}>{o.t}</Text>
                </Pressable>
              ))}
            </View>
            {forOther && (
              <>
                <RecipientPicker onPick={(r) => setRecipient({ name: r.name, phone: r.phone })} />
                <TextInput style={styles.input} placeholder="Receiver’s name" placeholderTextColor={C.muted}
                  value={recipient.name} onChangeText={(name) => setRecipient((r) => ({ ...r, name }))} />
                <TextInput style={styles.input} placeholder="Receiver’s mobile (10 digits)" placeholderTextColor={C.muted} keyboardType="phone-pad" maxLength={10}
                  value={recipient.phone} onChangeText={(v) => setRecipient((r) => ({ ...r, phone: v.replace(/\D/g, '') }))} />
              </>
            )}
            <TextInput style={styles.input} placeholder={forOther ? 'Their address: house, street, area' : 'House, street, area'} placeholderTextColor={C.muted}
              value={address.line1} onChangeText={(line1) => setAddress((a) => ({ ...a, line1 }))} />
            <TextInput style={styles.input} placeholder="Pincode" placeholderTextColor={C.muted} keyboardType="number-pad" maxLength={6}
              value={address.pincode} onChangeText={(pincode) => setAddress((a) => ({ ...a, pincode }))} />
          </View>

          {needsRx && (
            <Pressable style={styles.rxRow} onPress={attachPrescription} accessibilityRole="button">
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{rx?.key ? 'Prescription attached' : 'Prescription required'}</Text>
                <Text style={styles.tileMeta}>A pharmacist checks it before packing</Text>
              </View>
              <Text style={styles.rxLink}>{rx?.key ? 'Change' : 'Attach'}</Text>
            </Pressable>
          )}
        </ScrollView>

        <Pressable style={({ pressed }) => [styles.placeBtn, (placing || pressed) && { opacity: 0.85 }]} disabled={placing} onPress={placeOrder} accessibilityRole="button">
          {placing ? <ActivityIndicator color={C.onBrand} /> : (
            <>
              <Text style={styles.placeTotal}>{inr(payable)}</Text>
              <Text style={styles.placeText}>{isPatient ? 'Choose payment' : 'Log in to order'}</Text>
              <ChevronRight size={18} color={C.onBrand} />
            </>
          )}
        </Pressable>
      </BottomSheet>
      <PaymentSheet visible={paySheet} online={onlinePay} onPick={submitOrder} onClose={() => setPaySheet(false)} />
    </View>
  );
}

function Stepper({ qty, name, onAdd, onRemove }: { qty: number; name: string; onAdd: () => void; onRemove: () => void }) {
  return (
    <View style={styles.stepper} accessibilityLabel={`${name}, ${qty} in cart`}>
      <Pressable onPress={onRemove} hitSlop={6} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={`Remove one ${name}`}>
        <Minus size={16} color={C.onBrand} strokeWidth={2.4} />
      </Pressable>
      <Text style={styles.stepQty}>{qty}</Text>
      <Pressable onPress={onAdd} hitSlop={6} style={styles.stepBtn} accessibilityRole="button" accessibilityLabel={`Add one more ${name}`}>
        <Plus size={16} color={C.onBrand} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

function BillRow({ label, value, strong, good }: { label: string; value: string; strong?: boolean; good?: boolean }) {
  return (
    <View style={styles.billRow}>
      <Text style={strong ? styles.billStrong : styles.billLabel}>{label}</Text>
      <Text style={[strong ? styles.billStrong : styles.billValue, good && { color: C.mint }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16 },
  title: { fontFamily: F.display, fontSize: 26, color: C.ink, letterSpacing: -0.4 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 6 },
  promiseText: { fontFamily: F.bold, fontSize: 12.5, color: C.ink },
  // No fixed height: large phone font sizes must not clip the store names.
  vendorBar: { flexGrow: 0, flexShrink: 0 },
  chip: { minHeight: 40, maxWidth: 260, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.card, borderRadius: R.full, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.night, borderColor: C.night },
  chipText: { color: C.ink, fontFamily: F.semi, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  chipMeta: { color: C.muted, fontFamily: F.medium, fontSize: 12 },
  chipTextActive: { color: C.onNight },
  muted: { color: C.muted, fontSize: 13, fontFamily: F.medium },
  error: { backgroundColor: C.roseSoft, color: C.roseInk, padding: 10, marginHorizontal: 16, marginTop: 10, borderRadius: R.md, fontFamily: F.semi },
  tile: { flexGrow: 1, flexBasis: 0, maxWidth: '32.4%', minHeight: 232, backgroundColor: C.card, borderRadius: R.md, padding: 8, gap: 3, borderWidth: 1, borderColor: C.border },
  tileImage: { height: 76, borderRadius: R.sm, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  off: { position: 'absolute', top: 0, left: 0, backgroundColor: C.sky, color: '#ffffff', fontFamily: F.bold, fontSize: 9.5, paddingHorizontal: 5, paddingVertical: 2, borderTopLeftRadius: R.sm, borderBottomRightRadius: 6, overflow: 'hidden' },
  rxTag: { position: 'absolute', top: 4, right: 4, backgroundColor: C.card, color: C.roseInk, fontFamily: F.bold, fontSize: 9.5, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  tileName: { fontSize: 12.5, lineHeight: 16, fontFamily: F.semi, color: C.ink },
  tileMeta: { color: C.muted, fontSize: 11.5, fontFamily: F.medium },
  tilePrice: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  strike: { color: C.muted, textDecorationLine: 'line-through', fontFamily: F.regular, fontSize: 11 },
  addBtn: { borderRadius: R.sm, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.brand, backgroundColor: C.card },
  addBtnText: { color: C.brand, fontFamily: F.bold, fontSize: 13, letterSpacing: 0.4 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, borderRadius: R.sm, backgroundColor: C.brand },
  stepBtn: { width: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  stepQty: { color: C.onBrand, fontFamily: F.bold, fontSize: 14 },
  findBtn: { borderRadius: R.sm, minHeight: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardAlt },
  findBtnText: { color: C.inkSoft, fontFamily: F.semi, fontSize: 12 },
  cartDock: { position: 'absolute', left: 12, right: 12 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.mintSoft, paddingHorizontal: 12, paddingVertical: 7, borderTopLeftRadius: R.md, borderTopRightRadius: R.md },
  nudgeText: { color: C.mint, fontFamily: F.semi, fontSize: 12.5, flexShrink: 1 },
  cartBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.brand, borderRadius: R.md, paddingHorizontal: 16, paddingVertical: 10, minHeight: 56 },
  cartCount: { color: C.onBrand, fontFamily: F.semi, fontSize: 12, opacity: 0.9 },
  cartTotal: { color: C.onBrand, fontFamily: F.bold, fontSize: 16 },
  cartCta: { color: C.onBrand, fontFamily: F.bold, fontSize: 15 },
  group: { backgroundColor: C.card, borderRadius: R.md, padding: 14, gap: 10, borderWidth: 1, borderColor: C.border },
  groupTitle: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineName: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  linePrice: { fontFamily: F.bold, fontSize: 14, color: C.ink, minWidth: 64, textAlign: 'right' },
  progressWrap: { gap: 8, backgroundColor: C.mintSoft, borderRadius: R.md, padding: 12 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.card, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: C.mint },
  billRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  billLabel: { fontFamily: F.medium, fontSize: 14, color: C.inkSoft },
  billValue: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  billStrong: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  billNote: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  billDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  seg: { flexDirection: 'row', backgroundColor: C.cardAlt, borderRadius: R.md, padding: 3, gap: 3 },
  segBtn: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segOn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  segText: { fontFamily: F.semi, fontSize: 14, color: C.muted },
  segTextOn: { color: C.ink, fontFamily: F.bold },
  input: { backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingLeft: 14, paddingRight: 14, paddingVertical: 12, color: C.ink, fontFamily: F.medium, fontSize: 15 },
  rxRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: R.md, padding: 14, borderWidth: 1, borderColor: C.border },
  rxLink: { color: C.brand, fontFamily: F.bold },
  placeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.brand, paddingVertical: 14, paddingHorizontal: 16, borderRadius: R.md, minHeight: 54, justifyContent: 'center' },
  placeTotal: { color: C.onBrand, fontFamily: F.bold, fontSize: 16, flex: 1 },
  placeText: { color: C.onBrand, fontFamily: F.bold, fontSize: 15 }
});
