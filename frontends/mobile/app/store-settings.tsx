import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { StoreDay, StoreHours, StoreProfile } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { problem } from '@/lib/market';
import { Btn, Chip, Chips, Note, Screen, Title, TopBar } from '@/lib/marketUI';
import { success } from '@/lib/motion';
import { C, F, clay } from '@/lib/theme';

const DAYS: Array<{ day: StoreDay; label: string }> = [
  { day: 'MON', label: 'Monday' }, { day: 'TUE', label: 'Tuesday' }, { day: 'WED', label: 'Wednesday' }, { day: 'THU', label: 'Thursday' },
  { day: 'FRI', label: 'Friday' }, { day: 'SAT', label: 'Saturday' }, { day: 'SUN', label: 'Sunday' }
];
const RADII = [2, 3, 5, 8, 10, 15];
const PACKING = [10, 15, 20, 30, 45];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "9" / "9:30" / "0930" → "09:00" / "09:30", else the text as typed. */
function tidyTime(t: string) {
  const digits = t.replace(/[^\d]/g, '');
  if (/^\d{1,2}$/.test(digits)) return `${digits.padStart(2, '0')}:00`;
  if (/^\d{3,4}$/.test(digits)) { const d = digits.padStart(4, '0'); return `${d.slice(0, 2)}:${d.slice(2)}`; }
  return t.trim();
}

/** Shop settings: open switch, hours, delivery area and fees, packing time, contact. */
export default function StoreSettings() {
  const [shop, setShop] = useState<StoreProfile | null>(null);
  const [hours, setHours] = useState<StoreHours[]>([]);
  const [radius, setRadius] = useState(5);
  const [fee, setFee] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [packing, setPacking] = useState(15);
  const [rx, setRx] = useState(true);
  const [open, setOpen] = useState(true);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.vendorProfile().then(({ vendor: v }) => {
      setShop(v);
      setHours(DAYS.map(({ day }) => v.operatingHours.find((h) => h.day === day) || { day, open: '09:00', close: '21:00', isClosed: false }));
      setRadius(v.serviceRadiusKm); setFee(String(v.deliveryFee)); setMinOrder(String(v.minOrderValue)); setPacking(v.avgPreparationMinutes);
      setRx(v.acceptsPrescriptionOrders); setOpen(v.isOpen); setPhone(v.contactPhone); setEmail(v.contactEmail);
    }).catch((e) => setErr(problem(e).message));
  }, []);

  const setDay = (day: StoreDay, patch: Partial<StoreHours>) => setHours((hs) => hs.map((h) => (h.day === day ? { ...h, ...patch } : h)));
  const copyMonday = () => {
    const mon = hours.find((h) => h.day === 'MON');
    if (mon) setHours((hs) => hs.map((h) => ({ ...mon, day: h.day })));
  };

  const save = async () => {
    const tidy = hours.map((h) => ({ ...h, open: tidyTime(h.open || ''), close: tidyTime(h.close || '') }));
    const bad = tidy.find((h) => !h.isClosed && (!HHMM.test(h.open) || !HHMM.test(h.close)));
    if (bad) return setErr(`Check ${DAYS.find((d) => d.day === bad.day)?.label}'s times. Use 24-hour time like 09:00 and 21:30.`);
    const f = Number(fee || 0); const m = Number(minOrder || 0);
    if (!(f >= 0 && f <= 200)) return setErr('Delivery fee must be ₹0 to ₹200');
    if (!(m >= 0 && m <= 5000)) return setErr('Minimum order must be ₹0 to ₹5000');
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return setErr('Enter a 10-digit mobile number');
    setBusy(true); setErr('');
    try {
      await api.vendorUpdateProfile({
        isOpen: open, operatingHours: tidy, ...(radius !== shop?.serviceRadiusKm ? { serviceRadiusKm: radius } : {}), deliveryFee: f, minOrderValue: m,
        avgPreparationMinutes: packing, acceptsPrescriptionOrders: rx, contactPhone: phone, contactEmail: email.trim()
      });
      success();
      appAlert('Saved', 'Customers see your new settings right away.');
      if (router.canGoBack()) router.back();
    } catch (e) { setErr(problem(e).message); } finally { setBusy(false); }
  };

  return (
    <Screen header={<TopBar title="Shop settings" />}>
      {!shop ? (err ? <Note>{err}</Note> : <ActivityIndicator color={C.brand} />) : (
        <>
          <View style={s.card}>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.big}>{open ? 'Shop is open' : 'Shop is closed'}</Text>
                <Text style={s.meta}>Close it for a holiday or when you’re too busy. Your hours below still apply when it’s open.</Text>
              </View>
              <Switch value={open} onValueChange={setOpen} trackColor={{ true: C.mint, false: C.faint }} thumbColor="#ffffff" accessibilityLabel="Shop open" />
            </View>
          </View>

          <Title size={18}>Opening hours</Title>
          <View style={s.card}>
            {hours.map((h) => (
              <View key={h.day} style={s.dayRow}>
                <Text style={[s.dayName, h.isClosed && { color: C.muted }]}>{DAYS.find((d) => d.day === h.day)?.label}</Text>
                {h.isClosed ? <Text style={[s.meta, { flex: 1 }]}>Closed all day</Text> : (
                  <View style={s.times}>
                    <TextInput value={h.open} onChangeText={(t) => setDay(h.day, { open: t })} style={s.time} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="09:00" placeholderTextColor={C.muted} accessibilityLabel={`${h.day} opens at`} />
                    <Text style={s.meta}>to</Text>
                    <TextInput value={h.close} onChangeText={(t) => setDay(h.day, { close: t })} style={s.time} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="21:00" placeholderTextColor={C.muted} accessibilityLabel={`${h.day} closes at`} />
                  </View>
                )}
                <Switch value={!h.isClosed} onValueChange={(v) => setDay(h.day, { isClosed: !v })} trackColor={{ true: C.mint, false: C.faint }} thumbColor="#ffffff" accessibilityLabel={`Open on ${h.day}`} />
              </View>
            ))}
            <Btn label="Use Monday’s hours every day" variant="ghost" small onPress={copyMonday} />
          </View>

          <Title size={18}>Delivery</Title>
          <View style={[s.card, { gap: 14 }]}>
            <View style={{ gap: 6 }}>
              <Text style={s.label}>How far you deliver</Text>
              <Chips>{RADII.map((r) => <Chip key={r} label={`${r} km`} on={radius === r} onPress={() => setRadius(r)} />)}</Chips>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.label}>Delivery fee (₹)</Text>
                <TextInput value={fee} onChangeText={setFee} keyboardType="number-pad" style={s.input} accessibilityLabel="Delivery fee in rupees" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.label}>Minimum order (₹)</Text>
                <TextInput value={minOrder} onChangeText={setMinOrder} keyboardType="number-pad" style={s.input} accessibilityLabel="Minimum order in rupees" />
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={s.label}>Time to pack an order</Text>
              <Chips>{PACKING.map((p) => <Chip key={p} label={`${p} min`} on={packing === p} onPress={() => setPacking(p)} />)}</Chips>
            </View>
            <View style={s.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Take prescription orders</Text>
                <Text style={s.meta}>Needs a pharmacist to check each prescription.</Text>
              </View>
              <Switch value={rx} onValueChange={setRx} trackColor={{ true: C.mint, false: C.faint }} thumbColor="#ffffff" accessibilityLabel="Take prescription orders" />
            </View>
          </View>

          <Title size={18}>Contact</Title>
          <View style={[s.card, { gap: 10 }]}>
            <View style={{ gap: 4 }}>
              <Text style={s.label}>Shop phone</Text>
              <TextInput value={phone} onChangeText={(t) => setPhone(t.replace(/[^\d]/g, '').slice(0, 10))} keyboardType="phone-pad" style={s.input} placeholder="10-digit mobile" placeholderTextColor={C.muted} accessibilityLabel="Shop phone" />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={s.label}>Shop email</Text>
              <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={s.input} accessibilityLabel="Shop email" />
            </View>
            {shop.address?.line1 ? <Text style={s.meta}>Address: {[shop.address.line1, shop.address.city, shop.address.pincode].filter(Boolean).join(', ')}. To change it, contact Nabz support.</Text> : null}
          </View>

          {err ? <Note>{err}</Note> : null}
          <Btn label="Save settings" onPress={save} loading={busy} disabled={busy} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 22, padding: 14, gap: 4, ...clay },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  big: { fontFamily: F.display, fontSize: 19, color: C.ink },
  label: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  meta: { fontFamily: F.medium, fontSize: 13, color: C.muted, lineHeight: 18 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  dayName: { width: 92, fontFamily: F.bold, fontSize: 15, color: C.ink },
  times: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { width: 70, textAlign: 'center', backgroundColor: C.cardAlt, borderRadius: 12, paddingVertical: 10, fontFamily: F.semi, fontSize: 15, color: C.ink },
  input: { backgroundColor: C.cardAlt, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, minHeight: 50, fontFamily: F.semi, fontSize: 16, color: C.ink }
});
