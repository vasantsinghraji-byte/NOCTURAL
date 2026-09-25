import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Bike, CircleCheck, FlaskConical, Stethoscope, Store, type LucideIcon } from 'lucide-react-native';
import type { PartnerApplicationInput, PartnerKind } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { IconTile } from '@/lib/icons';
import { PressScale, Rise, success } from '@/lib/motion';
import { C, F, shadow, ui } from '@/lib/theme';

const KINDS: Array<{ kind: PartnerKind; icon: LucideIcon; title: string; tone: string; fg: string }> = [
  { kind: 'MEDICAL_STAFF', icon: Stethoscope, title: 'Nurse / physio', tone: C.violetSoft, fg: C.violet },
  { kind: 'PHARMACY', icon: Store, title: 'Pharmacy', tone: C.mintSoft, fg: C.mint },
  { kind: 'PATH_LAB', icon: FlaskConical, title: 'Path lab', tone: C.amberSoft, fg: C.amber },
  { kind: 'DELIVERY', icon: Bike, title: 'Delivery', tone: C.skySoft, fg: C.sky }
];

type Field = { key: keyof PartnerApplicationInput; label: string; keyboard?: 'number-pad' | 'email-address' | 'phone-pad'; max?: number };
const EXTRA: Record<PartnerKind, Field[]> = {
  MEDICAL_STAFF: [
    { key: 'qualification', label: 'Qualification (e.g. B.Sc Nursing, GNM, BPT)' },
    { key: 'registrationNumber', label: 'Nursing / physio council registration no.' },
    { key: 'experienceYears', label: 'Years of experience', keyboard: 'number-pad', max: 2 }
  ],
  PHARMACY: [
    { key: 'businessName', label: 'Store name' },
    { key: 'registrationNumber', label: 'Drug licence number' },
    { key: 'gstin', label: 'GSTIN (optional)' },
    { key: 'address', label: 'Store address' }
  ],
  PATH_LAB: [
    { key: 'businessName', label: 'Lab name' },
    { key: 'registrationNumber', label: 'NABL / registration number' },
    { key: 'address', label: 'Lab address' }
  ],
  DELIVERY: [
    { key: 'vehicle', label: 'Vehicle (e.g. scooter, bike)' }
  ]
};

/** Apply to join as a partner. Ops review every application before creating a login. */
export default function PartnerApply() {
  const [kind, setKind] = useState<PartnerKind>('MEDICAL_STAFF');
  const [form, setForm] = useState<Record<string, string>>({ city: 'Jaipur' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError(null);
    if ((form.name || '').trim().length < 2) { setError('Enter your full name.'); return; }
    if (!/^[6-9]\d{9}$/.test(form.phone || '')) { setError('Enter a valid 10-digit mobile number.'); return; }
    setBusy(true);
    try {
      const input: PartnerApplicationInput = { kind, name: form.name.trim(), phone: form.phone, city: form.city || 'Jaipur' };
      if (form.email) input.email = form.email.trim();
      for (const f of EXTRA[kind]) {
        const v = (form[f.key] || '').trim();
        if (!v) continue;
        if (f.key === 'experienceYears') input.experienceYears = Number(v);
        else (input as unknown as Record<string, string>)[f.key] = v;
      }
      await api.applyAsPartner(input);
      success();
      setDone(true);
    } catch (e) {
      setError(describeNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <View style={[ui.screen, { padding: 24, justifyContent: 'center', gap: 14 }]}>
        <Rise style={{ alignItems: 'center', gap: 14 }}>
          <IconTile icon={CircleCheck} bg={C.mintSoft} color={C.mint} size={84} radius={42} />
          <Text style={[ui.display, { textAlign: 'center' }]}>Application received</Text>
          <Text style={[ui.body, { textAlign: 'center' }]}>
            Our Jaipur team will call you within 2 working days to verify documents. Once approved, you’ll get your Nabz Partner login by SMS.
          </Text>
        </Rise>
        <PressScale style={ui.btnDark} onPress={() => router.back()}>
          <Text style={[ui.btnText, { color: C.onNight }]}>Done</Text>
        </PressScale>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={ui.screen} contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={ui.display}>How will you partner?</Text>
        <View style={styles.grid}>
          {KINDS.map((k) => (
            <Pressable key={k.kind} onPress={() => setKind(k.kind)} style={[styles.kind, kind === k.kind && styles.kindOn]}>
              <IconTile icon={k.icon} bg={k.tone} color={k.fg} size={40} />
              <Text style={ui.h3}>{k.title}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[ui.card, { gap: 10 }]}>
          <TextInput style={ui.input} placeholder="Full name" placeholderTextColor={C.faint} value={form.name || ''} onChangeText={set('name')} autoComplete="name" />
          <TextInput style={ui.input} placeholder="Mobile (10 digits)" placeholderTextColor={C.faint} keyboardType="phone-pad" maxLength={10}
            value={form.phone || ''} onChangeText={(v) => set('phone')(v.replace(/\D/g, ''))} />
          <TextInput style={ui.input} placeholder="Email (optional)" placeholderTextColor={C.faint} keyboardType="email-address" autoCapitalize="none"
            value={form.email || ''} onChangeText={set('email')} />
          <TextInput style={ui.input} placeholder="City" placeholderTextColor={C.faint} value={form.city || ''} onChangeText={set('city')} />
          {EXTRA[kind].map((f) => (
            <TextInput key={`${kind}-${f.key}`} style={ui.input} placeholder={f.label} placeholderTextColor={C.faint}
              keyboardType={f.keyboard} maxLength={f.max} value={form[f.key] || ''} onChangeText={set(f.key)} />
          ))}
          {error && <Text style={ui.error}>{error}</Text>}
          <PressScale style={[ui.btnDark, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
            {busy ? <ActivityIndicator color={C.onNight} /> : <Text style={[ui.btnText, { color: C.onNight }]}>Submit application</Text>}
          </PressScale>
          <Text style={[ui.muted, { textAlign: 'center' }]}>We verify ID, registration and police clearance before you go live.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kind: { width: '48%', flexGrow: 1, borderRadius: 18, padding: 14, gap: 8, borderWidth: 2, borderColor: C.border, backgroundColor: C.card },
  kindOn: { borderColor: C.ink, ...shadow },
  label: { fontFamily: F.bold }
});
