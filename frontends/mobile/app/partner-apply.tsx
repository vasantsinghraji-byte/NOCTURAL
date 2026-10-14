import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Bike, CircleCheck, Droplets, FlaskConical, Hospital, Stethoscope, Store, Syringe, type LucideIcon } from 'lucide-react-native';
import { PEOPLE_PARTNER_KINDS, type PartnerApplicationInput, type PartnerKind } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { TermsCheckbox } from '@/lib/fields';
import { IconTile } from '@/lib/icons';
import { PressScale, Rise, success } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

// `waitlist`: no partner flow yet, so approving doesn't create a login.
const KINDS: Array<{ kind: PartnerKind; icon: LucideIcon; title: string; waitlist?: boolean }> = [
  { kind: 'MEDICAL_STAFF', icon: Stethoscope, title: 'Nurse / physio' },
  { kind: 'PHARMACY', icon: Store, title: 'Pharmacy' },
  { kind: 'DELIVERY', icon: Bike, title: 'Delivery rider' },
  { kind: 'PATH_LAB', icon: FlaskConical, title: 'Path lab' },
  { kind: 'PHLEBOTOMIST', icon: Droplets, title: 'Phlebotomist' },
  { kind: 'PRP_TECHNICIAN', icon: Syringe, title: 'PRP technician', waitlist: true },
  { kind: 'HOSPITAL', icon: Hospital, title: 'Hospital / nursing home', waitlist: true }
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  ],
  PHLEBOTOMIST: [
    { key: 'qualification', label: 'Qualification (e.g. DMLT, BMLT)' },
    { key: 'experienceYears', label: 'Years of sample-collection experience', keyboard: 'number-pad', max: 2 }
  ],
  PRP_TECHNICIAN: [
    { key: 'qualification', label: 'Qualification / certification' },
    { key: 'experienceYears', label: 'Years of PRP experience', keyboard: 'number-pad', max: 2 }
  ],
  HOSPITAL: [
    { key: 'businessName', label: 'Hospital / nursing home name' },
    { key: 'registrationNumber', label: 'Clinical establishment registration no.' },
    { key: 'address', label: 'Address' }
  ],
};

/** Apply to join as a partner. Ops review every application before creating a login. */
export default function PartnerApply() {
  const params = useLocalSearchParams<{ kind?: PartnerKind }>();
  const [kind, setKind] = useState<PartnerKind>(params.kind && KINDS.some((k) => k.kind === params.kind) ? params.kind : 'MEDICAL_STAFF');
  const [form, setForm] = useState<Record<string, string>>({ city: 'Jaipur' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const waitlisted = !!KINDS.find((k) => k.kind === kind)?.waitlist;

  async function submit() {
    setError(null);
    if ((form.name || '').trim().length < 2) { setError('Enter your full name.'); return; }
    if (!/^[6-9]\d{9}$/.test(form.phone || '')) { setError('Enter a valid 10-digit mobile number.'); return; }
    // The sign-in invite (set your password) is emailed once ops approve.
    if (!waitlisted && !EMAIL_RE.test((form.email || '').trim())) { setError('Enter your email: we send your partner sign-in link there.'); return; }
    setBusy(true);
    try {
      if (form.agree !== 'yes') { setError('Please accept the partner terms to apply.'); setBusy(false); return; }
      const input: PartnerApplicationInput = { kind, name: form.name.trim(), phone: form.phone, city: form.city || 'Jaipur', acceptTerms: true };
      if (form.email) input.email = form.email.trim();
      if (form.referralCode) input.referralCode = form.referralCode.trim().toUpperCase();
      if (PEOPLE_PARTNER_KINDS.includes(kind)) {
        if (!form.gender) { setError('Choose your gender (patients can ask for a female or male professional).'); setBusy(false); return; }
        input.gender = form.gender as PartnerApplicationInput['gender'];
      }
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
            {waitlisted
              ? 'You’re on the waitlist. Our Jaipur team will call you when this partnership opens.'
              : 'Our Jaipur team will call you within 2 working days. Once approved, we’ll email you a link to set your password. Then sign in to Nabz Partner, upload your documents, and start as soon as they’re verified.'}
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
            <Pressable key={k.kind} onPress={() => setKind(k.kind)} style={[styles.kind, kind === k.kind && styles.kindOn]}
              accessibilityRole="radio" accessibilityState={{ checked: kind === k.kind }}>
              <IconTile icon={k.icon} bg={kind === k.kind ? C.brandSoft : C.cardAlt} color={kind === k.kind ? C.brand : C.inkSoft} size={40} />
              <Text style={ui.h3}>{k.title}</Text>
              {k.waitlist ? <Text style={styles.waitlist}>Waitlist</Text> : null}
            </Pressable>
          ))}
        </View>

        <View style={[ui.card, { gap: 10 }]}>
          <TextInput style={ui.input} placeholder="Full name" placeholderTextColor={C.faint} value={form.name || ''} onChangeText={set('name')} autoComplete="name" />
          <TextInput style={ui.input} placeholder="Mobile (10 digits)" placeholderTextColor={C.faint} keyboardType="phone-pad" maxLength={10}
            value={form.phone || ''} onChangeText={(v) => set('phone')(v.replace(/\D/g, ''))} />
          <TextInput style={ui.input} placeholder={waitlisted ? 'Email (optional)' : 'Email (your sign-in link is sent here)'} placeholderTextColor={C.faint} keyboardType="email-address" autoCapitalize="none" autoComplete="email"
            value={form.email || ''} onChangeText={set('email')} />
          <TextInput style={ui.input} placeholder="City" placeholderTextColor={C.faint} value={form.city || ''} onChangeText={set('city')} />
          <TextInput style={ui.input} placeholder="Referral code from a Nabz partner (optional)" placeholderTextColor={C.faint} autoCapitalize="characters"
            maxLength={12} value={form.referralCode || ''} onChangeText={set('referralCode')} />
          {PEOPLE_PARTNER_KINDS.includes(kind) && (
            <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
              {(['FEMALE', 'MALE', 'OTHER'] as const).map((g) => (
                <Pressable key={g} onPress={() => set('gender')(g)} accessibilityRole="radio" accessibilityState={{ checked: form.gender === g }}
                  style={[styles.gender, form.gender === g && styles.genderOn]}>
                  <Text style={[ui.h3, { fontSize: 14 }, form.gender === g && { color: C.onNight }]}>{g === 'FEMALE' ? 'Female' : g === 'MALE' ? 'Male' : 'Other'}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {kind === 'PRP_TECHNICIAN' && <Text style={ui.muted}>PRP visits run under a registered doctor; we confirm the supervising doctor during verification.</Text>}
          {EXTRA[kind].map((f) => (
            <TextInput key={`${kind}-${f.key}`} style={ui.input} placeholder={f.label} placeholderTextColor={C.faint}
              keyboardType={f.keyboard} maxLength={f.max} value={form[f.key] || ''} onChangeText={set(f.key)} />
          ))}
          <TermsCheckbox checked={form.agree === 'yes'} onChange={(v) => set('agree')(v ? 'yes' : '')} section="partners"
            label="I agree to the" linkText="Nabz partner terms" />
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
  kind: { width: '48%', flexGrow: 1, borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  kindOn: { borderColor: C.brand, borderWidth: 1.5 },
  waitlist: { alignSelf: 'flex-start', fontFamily: F.semi, fontSize: 11, color: C.amber, backgroundColor: C.amberSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  label: { fontFamily: F.bold },
  gender: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
  genderOn: { backgroundColor: C.night, borderColor: C.night }
});
