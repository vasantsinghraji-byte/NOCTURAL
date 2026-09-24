import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { CareService, CareSuppliesQuote, CareSupplySource } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { inr, shortName } from '@/lib/care';
import { pickAndUploadPrescription } from '@/lib/prescription';
import { IconTile, serviceIcon } from '@/lib/icons';
import { PressScale, success } from '@/lib/motion';
import { ArrowLeft, Camera, Check, CircleCheck, CircleX, FileText, MapPin, Store, Zap } from 'lucide-react-native';
import { C, F, shadow, ui } from '@/lib/theme';

type Mode = 'ASAP' | 'SCHEDULED';
type StepId = 'supplies' | 'time' | 'details';
const GENDERS = ['Female', 'Male', 'Other'] as const;
const PREFS: Array<{ value: 'ANY' | 'FEMALE' | 'MALE'; label: string }> = [
  { value: 'ANY', label: 'No preference' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' }
];
const SLOTS: Record<string, string[]> = {
  Morning: ['08:00', '09:00', '10:00', '11:00'],
  Afternoon: ['12:30', '14:00', '15:30'],
  Evening: ['17:00', '18:30', '20:00']
};
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const TITLES: Record<StepId, string> = { supplies: 'What should they bring?', time: 'Pick a time', details: 'Visit details' };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Booking flow: supplies → (time, if scheduled) → details → confirm. Book now goes straight to matching. */
export default function Book() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ serviceType: string; lat: string; lng: string; area?: string; mode?: Mode }>();
  const point = { lat: Number(params.lat), lng: Number(params.lng) };
  const mode: Mode = params.mode === 'ASAP' ? 'ASAP' : 'SCHEDULED';
  const steps: StepId[] = mode === 'ASAP' ? ['supplies', 'details'] : ['supplies', 'time', 'details'];

  const [service, setService] = useState<CareService | null>(null);
  const [quote, setQuote] = useState<CareSuppliesQuote | null>(null);
  const [bring, setBring] = useState<Record<string, boolean>>({});
  const [stepIdx, setStepIdx] = useState(0);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => new Date(Date.now() + (i + 1) * 86400000)), []);
  const [date, setDate] = useState(ymd(days[0]));
  const [time, setTime] = useState('10:00');
  const [form, setForm] = useState({ street: '', city: 'Jaipur', pincode: '', age: '', gender: 'Female' as (typeof GENDERS)[number], notes: '' });
  const [pref, setPref] = useState<'ANY' | 'FEMALE' | 'MALE'>('ANY');
  const [rx, setRx] = useState<{ key: string; url: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const step = steps[stepIdx];

  useEffect(() => {
    if (session?.kind === 'patient') api.getMembership().then((m) => setIsMember(m.active)).catch(() => undefined);
    api.listCareServices().then((r) => setService(r.services.find((s) => s.serviceType === params.serviceType) || null)).catch((e) => setError(describeNetworkError(e)));
    api.quoteCareSupplies({ serviceType: params.serviceType, ...point })
      .then((r) => {
        setQuote(r.quote);
        setBring(Object.fromEntries(r.quote.items.map((i) => [i.key, canBring(i) && i.defaultSource === 'STAFF_BRINGS'])));
      })
      .catch((e) => setError(describeNetworkError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.serviceType]);

  const items = quote?.items || [];
  const bringing = items.filter((i) => bring[i.key]);
  const suppliesTotal = bringing.reduce((s, i) => s + (i.unitPrice || 0) * i.quantity, 0);
  // Server-computed price; Nabz Plus members pay no platform fee.
  const preview = service?.pricingPreview ? (isMember ? service.pricingPreview.member : service.pricingPreview.regular) : null;
  const fee = preview ? preview.totalAmount : 0;
  const needsRx = !!service?.requirements?.prescriptionRequired || bringing.some((i) => i.requiresPrescription);

  function next() {
    setError(null);
    if (step === 'details') {
      if (!session || session.kind !== 'patient') { router.push('/welcome'); return; }
      if (!form.street.trim() || !/^\d{6}$/.test(form.pincode) || !form.age) { setError('Add the address, a 6-digit pincode and the patient’s age.'); return; }
      if (needsRx && !rx) { setError('Attach the prescription for this visit.'); return; }
      setConfirming(true);
      return;
    }
    setStepIdx((i) => i + 1);
  }

  async function attachRx() {
    setError(null);
    const up = await pickAndUploadPrescription();
    if (up) setRx({ key: up.key, url: up.url });
  }

  async function book() {
    if (!service || !session) return;
    setBusy(true);
    const now = new Date();
    try {
      const res = await api.createCareBooking({
        serviceType: service.serviceType,
        mode,
        preferredGender: pref,
        scheduledDate: mode === 'ASAP' ? ymd(now) : date,
        scheduledTime: mode === 'ASAP' ? hm(now) : time,
        scheduledTimezone: 'Asia/Kolkata',
        scheduledTimezoneOffsetMinutes: -new Date().getTimezoneOffset() || 330,
        serviceLocation: { type: 'HOME', address: { street: form.street.trim(), city: form.city.trim(), pincode: form.pincode, coordinates: point } },
        patientDetails: { name: session.name, age: Number(form.age), gender: form.gender },
        specialRequirements: form.notes.trim() || undefined,
        supplies: items.map((i) => ({ key: i.key, source: (bring[i.key] ? 'STAFF_BRINGS' : 'PATIENT_HAS') as CareSupplySource })),
        suppliesVendorId: bringing.length ? quote?.vendor?._id : undefined,
        prescriptionKey: rx?.key,
        prescriptionUrl: rx?.url
      });
      success();
      setConfirming(false);
      if (mode === 'ASAP') {
        // Straight into the matching moment (radar → nurse accepted → live route).
        router.replace({ pathname: '/track', params: { id: res.booking._id } });
        return;
      }
      const s = res.booking.supplies;
      setResult({
        ok: true,
        message: s?.status === 'ORDERED'
          ? `${quote?.vendor?.name} is packing your supplies (${inr(s.amount || 0)}). Your nurse collects them on the way.`
          : 'We’ll offer this visit to verified professionals an hour before. You’ll get a notification when one accepts.'
      });
    } catch (e) {
      setResult({ ok: false, message: describeNetworkError(e) });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (result) {
    return (
      <View style={[styles.result, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.art}>
          <View style={styles.artInner}>
            {result.ok ? <CircleCheck size={92} color={C.onNight} strokeWidth={1.4} /> : <CircleX size={92} color={C.onNight} strokeWidth={1.4} />}
          </View>
        </View>
        <Text style={styles.resultTitle}>{result.ok ? 'Visit booked' : 'Booking failed'}</Text>
        <Text style={styles.resultText}>{result.message}</Text>
        <PressScale style={styles.resultBtn} onPress={() => (result.ok ? router.replace('/bookings') : setResult(null))}>
          <Text style={styles.resultBtnText}>{result.ok ? 'See my bookings' : 'Back to booking'}</Text>
        </PressScale>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={12} style={styles.back} onPress={() => (stepIdx === 0 ? router.back() : setStepIdx((i) => i - 1))}>
          <ArrowLeft size={22} color={C.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{TITLES[step]}</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.progress}>
        {steps.map((s, i) => <View key={s} style={[styles.bar, i <= stepIdx && { backgroundColor: C.ink }]} />)}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130, gap: 12 }} keyboardShouldPersistTaps="handled">
        {service && (
          <View style={styles.serviceRow}>
            <IconTile icon={serviceIcon(service.serviceType)} bg={C.card} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={ui.h3}>{service.displayName || service.name}</Text>
              <View style={styles.inline}><MapPin size={13} color={C.muted} /><Text style={ui.muted} numberOfLines={1}>{params.area || 'Your location'}</Text></View>
            </View>
            {mode === 'ASAP' && <View style={styles.now}><Zap size={12} color={C.onNight} fill={C.onNight} /><Text style={styles.nowText}>NOW</Text></View>}
          </View>
        )}
        {error && <Text style={ui.error}>{error}</Text>}

        {step === 'supplies' && (
          <>
            <View style={styles.banner}>
              <Store size={20} color={C.brand} />
              <Text style={[ui.muted, { flex: 1, color: C.brandDark }]}>
                {quote && !quote.vendor
                  ? 'No partner pharmacy delivers to this address yet (Nabz is live in Jaipur). Keep these supplies ready at home; the professional brings their basic kit.'
                  : `Tick what the staff should bring. ${quote?.vendor ? `Packed at ${quote.vendor.name}${quote.vendor.distanceKm !== undefined ? ` (${quote.vendor.distanceKm} km)` : ''}.` : 'Untick anything you already have.'}`}
              </Text>
            </View>
            {!quote ? <ActivityIndicator color={C.brand} /> : items.length === 0 ? (
              <Text style={[ui.good, ui.body]}>No supplies needed: the professional brings their own kit.</Text>
            ) : items.map((i) => {
              const ok = canBring(i);
              const on = !!bring[i.key];
              return (
                <Pressable key={i.key} disabled={!ok} onPress={() => setBring((b) => ({ ...b, [i.key]: !b[i.key] }))}
                  style={[styles.check, on && styles.checkOn, !ok && { opacity: 0.6 }]}>
                  <View style={[styles.box, on && styles.boxOn]}>{on && <Check size={15} color={C.onNight} strokeWidth={3} />}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={ui.h3}>{i.name} <Text style={ui.muted}>× {i.quantity}</Text>{i.requiresPrescription ? '  ℞' : ''}</Text>
                    <Text style={ui.muted}>{ok ? (on ? 'Staff brings it' : 'I already have it') : (i.note || (i.medicineId ? 'Out of stock nearby, keep it ready' : 'You provide this'))}</Text>
                  </View>
                  {ok && <Text style={[styles.price, !on && { color: C.muted }]}>{inr((i.unitPrice || 0) * i.quantity)}</Text>}
                </Pressable>
              );
            })}
          </>
        )}

        {step === 'time' && (
          <>
            <Text style={styles.month}>{days[0].toLocaleString('en-IN', { month: 'long' })}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {days.map((d) => {
                const on = ymd(d) === date;
                return (
                  <Pressable key={ymd(d)} onPress={() => setDate(ymd(d))} style={[styles.day, on && styles.dayOn]}>
                    <Text style={[styles.dayName, on && { color: C.onNightMuted }]}>{DAYS[d.getDay()]}</Text>
                    <Text style={[styles.dayNum, on && { color: C.onNight }]}>{d.getDate()}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {Object.entries(SLOTS).map(([label, slots]) => (
              <View key={label} style={{ gap: 8 }}>
                <Text style={ui.section}>{label}</Text>
                <View style={styles.slots}>
                  {slots.map((tm) => (
                    <Pressable key={tm} onPress={() => setTime(tm)} style={[styles.slot, time === tm && styles.slotOn]}>
                      <Text style={[styles.slotText, time === tm && { color: C.onNight }]}>{fmtTime(tm)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        {step === 'details' && (
          <View style={[ui.card, { gap: 10 }]}>
            <Text style={ui.label}>Address</Text>
            <TextInput style={ui.input} value={form.street} onChangeText={(street) => setForm({ ...form, street })} placeholder="House / flat / street" placeholderTextColor={C.faint} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[ui.input, { flex: 1 }]} value={form.city} onChangeText={(city) => setForm({ ...form, city })} placeholder="City" placeholderTextColor={C.faint} />
              <TextInput style={[ui.input, { width: 120 }]} value={form.pincode} onChangeText={(pincode) => setForm({ ...form, pincode })} placeholder="Pincode" keyboardType="number-pad" maxLength={6} placeholderTextColor={C.faint} />
            </View>
            <Text style={[ui.label, { marginTop: 6 }]}>Patient</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextInput style={[ui.input, { width: 84 }]} value={form.age} onChangeText={(age) => setForm({ ...form, age })} placeholder="Age" keyboardType="number-pad" maxLength={3} placeholderTextColor={C.faint} />
              {GENDERS.map((g) => (
                <Pressable key={g} onPress={() => setForm({ ...form, gender: g })} style={[styles.slot, form.gender === g && styles.slotOn]}>
                  <Text style={[styles.slotText, form.gender === g && { color: C.onNight }]}>{g}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[ui.label, { marginTop: 6 }]}>Professional preference</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {PREFS.map((p) => (
                <Pressable key={p.value} onPress={() => setPref(p.value)} style={[styles.slot, pref === p.value && styles.slotOn]}>
                  <Text style={[styles.slotText, pref === p.value && { color: C.onNight }]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={[ui.input, { minHeight: 70, textAlignVertical: 'top', marginTop: 6 }]} multiline value={form.notes} onChangeText={(notes) => setForm({ ...form, notes })} placeholder="Notes: allergies, floor, gate code (optional)" placeholderTextColor={C.faint} />
            {needsRx && (
              <Pressable style={ui.btnOutline} onPress={attachRx}>
                <View style={styles.inline}>
                  {rx ? <FileText size={18} color={C.brand} /> : <Camera size={18} color={C.brand} />}
                  <Text style={ui.btnOutlineText}>{rx ? 'Prescription attached' : 'Attach prescription (required)'}</Text>
                </View>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.total}>{inr(fee + suppliesTotal)}</Text>
          <Text style={ui.muted}>Visit {inr(fee)}{isMember ? ' (Plus: no fee)' : ''} + supplies {inr(suppliesTotal)}</Text>
        </View>
        <PressScale style={[ui.btnDark, { paddingHorizontal: 30 }]} onPress={next}>
          <Text style={[ui.btnText, { color: C.onNight }]}>{step === 'details' ? (session?.kind === 'patient' ? 'Review' : 'Sign in') : 'Next'}</Text>
        </PressScale>
      </View>

      <Modal visible={confirming} transparent animationType="slide" onRequestClose={() => setConfirming(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modal, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <Text style={[ui.display, { fontSize: 30 }]}>{mode === 'ASAP' ? 'Book now' : 'Confirm visit'}</Text>
            <View style={styles.serviceRow}>
              <IconTile icon={serviceIcon(params.serviceType)} bg={C.card} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={ui.h3}>{service ? shortName(service) : ''}</Text>
                <View style={styles.inline}><MapPin size={13} color={C.muted} /><Text style={ui.muted} numberOfLines={1}>{form.street}, {form.pincode}</Text></View>
              </View>
            </View>
            <View style={styles.bill}>
              <BillRow label="Visit" value={inr(preview?.basePrice ?? 0)} />
              <BillRow label={isMember ? 'Platform fee (waived with Plus)' : 'Platform fee'} value={inr(preview?.platformFee ?? 0)} />
              <BillRow label="GST" value={inr(preview?.gst ?? 0)} />
              {bringing.length > 0 && <BillRow label={`Supplies (${bringing.length})`} value={inr(suppliesTotal)} />}
              <View style={styles.billLine} />
              <BillRow label="Total · pay after the visit" value={inr(fee + suppliesTotal)} strong />
              <Text style={ui.muted}>{mode === 'ASAP' ? 'We’ll match the nearest verified professional now.' : `${new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(time)}`}</Text>
              {pref !== 'ANY' && <Text style={ui.muted}>Preference: {pref === 'FEMALE' ? 'female' : 'male'} professional (we’ll try, not guaranteed)</Text>}
            </View>
            <PressScale style={[ui.btnDark, busy && { opacity: 0.6 }]} disabled={busy} onPress={book}>
              {busy ? <ActivityIndicator color={C.onNight} /> : <Text style={[ui.btnText, { color: C.onNight }]}>{mode === 'ASAP' ? 'Find my nurse' : 'Book visit'}</Text>}
            </PressScale>
            <Pressable onPress={() => setConfirming(false)}><Text style={[ui.muted, { textAlign: 'center', fontFamily: F.bold }]}>Edit details</Text></Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function BillRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={strong ? ui.h3 : ui.muted}>{label}</Text>
      <Text style={strong ? [ui.h3, { fontFamily: F.heavy }] : [ui.muted, { color: C.ink }]}>{value}</Text>
    </View>
  );
}

function canBring(i: CareSuppliesQuote['items'][number]) {
  return i.available && !(i.kind === 'MEDICINE' && !i.medicineId);
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, backgroundColor: C.bg },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  headerTitle: { fontSize: 17, fontFamily: F.heavy, color: C.ink },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 16 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.border },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.cardAlt, borderRadius: 18, padding: 12 },
  now: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.night, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  nowText: { color: C.onNight, fontFamily: F.heavy, fontSize: 10, letterSpacing: 1 },
  price: { fontFamily: F.heavy, color: C.ink },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.brandSoft, borderRadius: 14, padding: 12 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: C.border },
  checkOn: { borderColor: C.ink, ...shadow },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.night, borderColor: C.night },
  month: { fontSize: 30, fontFamily: F.display, color: C.ink, textAlign: 'center', marginVertical: 4 },
  day: { width: 58, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  dayOn: { backgroundColor: C.night, borderColor: C.night },
  dayName: { fontSize: 11, fontFamily: F.bold, color: C.muted },
  dayNum: { fontSize: 18, fontFamily: F.heavy, color: C.ink, marginTop: 2 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  slotOn: { backgroundColor: C.night, borderColor: C.night },
  slotText: { fontFamily: F.bold, color: C.ink, fontSize: 13 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card,
    padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: C.border, ...shadow, elevation: 20
  },
  total: { fontSize: 22, fontFamily: F.heavy, color: C.ink },
  overlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modal: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.border },
  bill: { backgroundColor: C.card, borderRadius: 18, padding: 14, gap: 8, borderWidth: 1, borderColor: C.border },
  billLine: { height: 1, backgroundColor: C.border, marginVertical: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  result: { flex: 1, backgroundColor: C.night, alignItems: 'center', paddingHorizontal: 28, gap: 14 },
  art: { width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(91,124,255,0.14)', alignItems: 'center', justifyContent: 'center', marginVertical: 30 },
  artInner: { width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(91,124,255,0.20)', alignItems: 'center', justifyContent: 'center' },
  resultTitle: { color: C.onNight, fontSize: 40, fontFamily: F.display },
  resultText: { color: C.onNightMuted, textAlign: 'center', fontSize: 15, lineHeight: 22, fontFamily: F.medium },
  resultBtn: { marginTop: 'auto', alignSelf: 'stretch', backgroundColor: C.onNight, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  resultBtnText: { color: '#0a0f24', fontFamily: F.heavy, fontSize: 15 }
});
