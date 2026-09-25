import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { SocialSignInResult } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { PressScale, Rise, success, warn } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

type Step = 'phone' | 'code' | 'profile';

/**
 * Phone OTP sign-in (and profile completion for first-time users, including
 * those arriving from Google with a signup token).
 */
export default function PhoneSignIn() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { adoptPatientSession } = useAuth();
  const params = useLocalSearchParams<{ signupToken?: string; needs?: string; name?: string; email?: string }>();

  const [step, setStep] = useState<Step>(params.signupToken ? 'profile' : 'phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [signupToken, setSignupToken] = useState(params.signupToken || '');
  const [needs, setNeeds] = useState<string[]>(params.needs ? params.needs.split(',') : ['name', 'email']);
  const [name, setName] = useState(params.name || '');
  const [email, setEmail] = useState(params.email || '');
  const [profilePhone, setProfilePhone] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const tm = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(tm);
  }, [resendIn]);

  async function finish(res: SocialSignInResult) {
    if (res.needsProfile) {
      setSignupToken(res.signupToken);
      setNeeds(res.profile.needs);
      if (res.profile.email) setEmail(res.profile.email);
      if (res.profile.name) setName(res.profile.name);
      setStep('profile');
      return;
    }
    success();
    await adoptPatientSession(res);
    if (router.canDismiss()) router.dismissAll();
    router.replace('/');
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { warn(); setError(describeNetworkError(e)); } finally { setBusy(false); }
  }

  const sendCode = () => run(async () => {
    if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('Enter a valid 10-digit mobile number.');
    const r = await api.startPhoneSignIn(phone);
    setResendIn(r.resendAfterSeconds || 30);
    setCode('');
    setStep('code');
    setTimeout(() => codeRef.current?.focus(), 250);
  });

  const verify = (value = code) => run(async () => {
    if (!/^\d{6}$/.test(value)) throw new Error('Enter the 6-digit code.');
    await finish(await api.verifyPhoneSignIn(phone, value));
  });

  const complete = () => run(async () => {
    if (name.trim().length < 2) throw new Error('Tell us your name.');
    if (needs.includes('email') && !/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Enter a valid email for receipts.');
    if (needs.includes('phone') && !/^[6-9]\d{9}$/.test(profilePhone)) throw new Error('Enter your 10-digit mobile number.');
    await finish(await api.completeSignup({
      signupToken,
      name: name.trim(),
      email: needs.includes('email') ? email.trim() : undefined,
      phone: needs.includes('phone') ? profilePhone : undefined
    }));
  });

  function back() {
    if (step === 'code') { setStep('phone'); return; }
    router.back();
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, flex: 1 }}>
        <Pressable hitSlop={12} onPress={back} style={styles.back}><ArrowLeft size={22} color={C.ink} /></Pressable>

        {step === 'phone' && (
          <Rise key="phone" style={{ gap: 14 }}>
            <Text style={ui.display}>{t('phone.title')}</Text>
            <Text style={ui.body}>{t('phone.sub')}</Text>
            <View style={styles.phoneRow}>
              <View style={styles.cc}><Text style={styles.ccText}>+91</Text></View>
              <TextInput
                style={[ui.input, styles.phoneInput]} value={phone} autoFocus keyboardType="phone-pad" maxLength={10}
                onChangeText={(v) => setPhone(v.replace(/\D/g, ''))} placeholder="98765 43210" placeholderTextColor={C.faint}
                textContentType="telephoneNumber" autoComplete="tel"
              />
            </View>
          </Rise>
        )}

        {step === 'code' && (
          <Rise key="code" style={{ gap: 14 }}>
            <Text style={ui.display}>{t('phone.codeTitle')}</Text>
            <Text style={ui.body}>{t('phone.codeSub', { phone })}</Text>
            {/* One hidden input drives six boxes (keeps SMS autofill working). */}
            <Pressable onPress={() => codeRef.current?.focus()} style={styles.boxes}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={[styles.box, code.length === i && styles.boxOn, code[i] ? styles.boxFilled : null]}>
                  <Text style={styles.boxText}>{code[i] || ''}</Text>
                </View>
              ))}
            </Pressable>
            <TextInput
              ref={codeRef} value={code} keyboardType="number-pad" maxLength={6} style={styles.hidden}
              textContentType="oneTimeCode" autoComplete="sms-otp"
              onChangeText={(v) => { const d = v.replace(/\D/g, ''); setCode(d); if (d.length === 6) verify(d); }}
            />
            <Pressable disabled={resendIn > 0 || busy} onPress={sendCode}>
              <Text style={[styles.resend, resendIn > 0 && { color: C.muted }]}>
                {resendIn > 0 ? t('phone.resendIn', { s: resendIn }) : t('phone.resend')}
              </Text>
            </Pressable>
          </Rise>
        )}

        {step === 'profile' && (
          <Rise key="profile" style={{ gap: 12 }}>
            <Text style={ui.display}>{t('profile.title')}</Text>
            <Text style={ui.body}>{t('profile.sub')}</Text>
            <TextInput style={ui.input} value={name} onChangeText={setName} placeholder={t('profile.name')} placeholderTextColor={C.faint} autoComplete="name" autoFocus />
            {needs.includes('email') && (
              <TextInput style={ui.input} value={email} onChangeText={setEmail} placeholder={t('profile.email')} placeholderTextColor={C.faint}
                autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            )}
            {needs.includes('phone') && (
              <TextInput style={ui.input} value={profilePhone} onChangeText={(v) => setProfilePhone(v.replace(/\D/g, ''))} placeholder="Mobile (10 digits)"
                placeholderTextColor={C.faint} keyboardType="phone-pad" maxLength={10} />
            )}
          </Rise>
        )}

        {error && <Text style={[ui.error, { marginTop: 14 }]}>{error}</Text>}
        <View style={{ flex: 1 }} />

        <PressScale
          style={[ui.btnDark, { marginBottom: insets.bottom + 16 }, busy && { opacity: 0.7 }]}
          disabled={busy}
          onPress={step === 'phone' ? sendCode : step === 'code' ? () => verify() : complete}
        >
          {busy ? <ActivityIndicator color={C.onNight} /> : (
            <Text style={[ui.btnText, { color: C.onNight }]}>
              {step === 'phone' ? t('phone.send') : step === 'code' ? t('phone.verify') : t('profile.done')}
            </Text>
          )}
        </PressScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginBottom: 18, borderWidth: 1, borderColor: C.border },
  phoneRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  cc: { paddingHorizontal: 16, borderRadius: 14, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, justifyContent: 'center' },
  ccText: { fontFamily: F.bold, color: C.ink, fontSize: 16 },
  phoneInput: { flex: 1, fontSize: 18, letterSpacing: 1, fontFamily: F.bold },
  boxes: { flexDirection: 'row', gap: 8, marginTop: 8 },
  box: { flex: 1, height: 58, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  boxOn: { borderColor: C.brand, borderWidth: 2 },
  boxFilled: { borderColor: C.ink },
  boxText: { fontFamily: F.heavy, fontSize: 22, color: C.ink },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resend: { color: C.brand, fontFamily: F.bold, marginTop: 4 }
});
