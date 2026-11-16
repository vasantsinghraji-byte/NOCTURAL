import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text, useTr } from '@/lib/T';
import { router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { Bike, FlaskConical, Stethoscope, Store, type LucideIcon } from 'lucide-react-native';
import { homeForRole, useAuth, type AccountKind } from '@/lib/auth';
import { ALLOW_SERVER_OVERRIDE, api, describeNetworkError, saveServerUrl } from '@/lib/api';
import { IconTile } from '@/lib/icons';
import { NabzMark } from '@/lib/Brand';
import { PressScale } from '@/lib/motion';
import { IS_PARTNER_APP } from '@/lib/variant';
import { PasswordInput } from '@/lib/fields';
import { C, F, shadow, ui } from '@/lib/theme';

type Mode = 'login' | 'register';

// Partner portals are enforced server-side: a pharmacy account can't open the
// medical-staff area and vice versa. Customers never see this chooser.
const PARTNER_PORTALS: Array<{ kind: AccountKind; icon: LucideIcon; title: string; hint: string; tone: string; fg: string }> = [
  { kind: 'staff', icon: Stethoscope, title: 'Medical staff', hint: 'Nurses & physios', tone: C.violetSoft, fg: C.violet },
  { kind: 'pharmacy', icon: Store, title: 'Pharmacy', hint: 'Store partner', tone: C.mintSoft, fg: C.mint },
  { kind: 'rider', icon: Bike, title: 'Delivery partner', hint: 'Medicine deliveries', tone: C.skySoft, fg: C.sky },
  { kind: 'lab', icon: FlaskConical, title: 'Path lab', hint: 'Nabz-certified labs', tone: C.amberSoft, fg: C.amber }
];

// Roles still onboarding (none right now: delivery and path labs have their dashboards).
type WaitlistRole = 'DELIVERY' | 'PATH_LAB';
const WAITLIST: Array<{ role: WaitlistRole; icon: LucideIcon; title: string; hint: string; tone: string; fg: string; steps: string[] }> = [];

/** Email sign-in. Customer app: customers only. Nabz Partner: medical staff, pharmacy, delivery and path lab. */
export default function Login() {
  const { login, register } = useAuth();
  // The stack's gradient top bar is drawn over the screen (a custom header background makes
  // react-navigation's header translucent), so content starts below its measured height.
  const headerHeight = useHeaderHeight();
  const tr = useTr();
  const params = useLocalSearchParams<{ kind?: AccountKind; use?: 'phone' }>();
  const [kind, setKind] = useState<AccountKind>(IS_PARTNER_APP ? (params.kind || 'staff') : 'patient');
  const [waitlist, setWaitlist] = useState<WaitlistRole | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(api.getBaseUrl());
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Customers sign in with their email or their 10-digit Indian mobile number.
  const [idType, setIdType] = useState<'email' | 'phone'>(params.use === 'phone' ? 'phone' : 'email');
  const [fieldErrors, setFieldErrors] = useState<{ id?: string; password?: string; name?: string; phone?: string }>({});

  async function testServer() {
    setServerStatus('Checking…');
    try {
      const url = await saveServerUrl(server);
      setServer(url);
      await api.health();
      setServerStatus(`Connected to ${url}`);
    } catch (e) {
      setServerStatus(`Not reachable: ${describeNetworkError(e)}`);
    }
  }

  /** Checks the form before anything is sent; returns false and shows the reasons. */
  function validate(): boolean {
    const next: typeof fieldErrors = {};
    const usePhone = customerSignIn && idType === 'phone';
    if (usePhone) {
      if (!/^[6-9]\d{9}$/.test(digitsOnly(email))) next.id = 'Enter your 10-digit mobile number (starts with 6, 7, 8 or 9).';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.id = 'Enter the email address on your account.';
    }
    if (isRegister) {
      if (name.trim().length < 2) next.name = 'Enter your full name.';
      if (!/^[6-9]\d{9}$/.test(phone)) next.phone = 'Enter a 10-digit mobile number.';
      if (password.length < 8) next.password = 'Use at least 8 characters.';
    } else if (!password) {
      next.password = 'Enter your password.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (busy) return;
    setError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (ALLOW_SERVER_OVERRIDE) await saveServerUrl(server);
      // A mobile number is sent as its 10 digits; the server finds the account by it.
      const identifier = customerSignIn && idType === 'phone' ? digitsOnly(email) : email.trim();
      const session = mode === 'register'
        ? await register({ name: name.trim(), email: email.trim(), phone, password })
        : await login(kind, identifier, password);
      if (router.canDismiss()) router.dismissAll();
      router.replace(homeForRole(session.role));
    } catch (e) {
      setError(signInProblem(e, isRegister));
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === 'register';
  const customerSignIn = !IS_PARTNER_APP && !isRegister;
  const active = PARTNER_PORTALS.find((p) => p.kind === kind);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* flexGrow: the content always fills the screen, so it can't stay scrolled under the top bar after the keyboard closes. */}
      <ScrollView style={ui.screen} contentContainerStyle={[styles.scroll, { paddingTop: headerHeight + 16 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {IS_PARTNER_APP ? (
          <Text style={ui.display}>{isRegister ? 'Create account' : 'Partner sign in'}</Text>
        ) : (
          <View style={styles.hero}>
            <View style={styles.mark}><NabzMark size={30} pulse={C.brand} /></View>
            <Text style={ui.display} accessibilityRole="header">{isRegister ? 'Create your account' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>
              {isRegister ? 'Order medicines and book trusted home care for your family.' : 'Sign in to order medicines, book home care and track your orders.'}
            </Text>
          </View>
        )}

        {IS_PARTNER_APP && (
          <View style={styles.grid}>
            {PARTNER_PORTALS.map((p) => (
              <Pressable key={p.kind} onPress={() => { setKind(p.kind); setWaitlist(null); setError(null); }} style={[styles.portal, !waitlist && kind === p.kind && styles.portalOn]}>
                <IconTile icon={p.icon} bg={p.tone} color={p.fg} size={42} />
                <Text style={ui.h3}>{p.title}</Text>
                <Text style={ui.muted}>{p.hint}</Text>
              </Pressable>
            ))}
            {WAITLIST.map((w) => (
              <Pressable key={w.role} onPress={() => { setWaitlist(w.role); setError(null); }} style={[styles.portal, waitlist === w.role && styles.portalOn]}>
                <IconTile icon={w.icon} bg={w.tone} color={w.fg} size={42} />
                <Text style={ui.h3}>{w.title}</Text>
                <Text style={ui.muted}>{w.hint}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {IS_PARTNER_APP && waitlist ? (() => {
          const w = WAITLIST.find((x) => x.role === waitlist)!;
          return (
            <View style={[ui.card, { gap: 10 }]}>
              <Text style={ui.label}>{w.title}: onboarding now</Text>
              <Text style={ui.muted}>Your dashboard opens after verification. How it works:</Text>
              {w.steps.map((step, i) => (
                <View key={step} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View style={styles.stepDot}><Text style={styles.stepNum}>{i + 1}</Text></View>
                  <Text style={[ui.body, { flex: 1 }]}>{step}</Text>
                </View>
              ))}
              <PressScale style={ui.btnDark} onPress={() => router.push({ pathname: '/partner-apply', params: { kind: w.role } })}>
                <Text style={ui.btnText}>Apply as {w.title.toLowerCase()}</Text>
              </PressScale>
            </View>
          );
        })() : (
        <View style={[ui.card, { gap: 10 }]}>
          {IS_PARTNER_APP && active && <Text style={ui.label}>{active.title} login</Text>}
          {isRegister && (
            <>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Full name</Text>
                <TextInput style={[ui.input, fieldErrors.name && styles.inputError]} placeholder={tr("As on your ID")} placeholderTextColor={C.muted} value={name}
                  onChangeText={(v) => { setName(v); setFieldErrors((e) => ({ ...e, name: undefined })); }} autoComplete="name" accessibilityLabel="Full name" />
                {fieldErrors.name ? <Text style={styles.fieldError}>{fieldErrors.name}</Text> : null}
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Mobile number</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.prefix}><Text style={styles.prefixText}>+91</Text></View>
                  <TextInput style={[ui.input, { flex: 1 }, fieldErrors.phone && styles.inputError]} placeholder="98765 43210" placeholderTextColor={C.muted} keyboardType="phone-pad"
                    value={formatIndianMobile(phone)} onChangeText={(v) => { setPhone(digitsOnly(v).slice(0, 10)); setFieldErrors((e) => ({ ...e, phone: undefined })); }}
                    maxLength={11} autoComplete="tel" accessibilityLabel="Mobile number, 10 digits" />
                </View>
                {fieldErrors.phone ? <Text style={styles.fieldError}>{fieldErrors.phone}</Text> : null}
              </View>
            </>
          )}
          <View style={styles.field}>
            {/* Customers sign in with their email or their mobile number (same password either way). */}
            <Text style={styles.fieldLabel}>{customerSignIn ? 'Sign in with email or mobile number' : 'Email'}</Text>
            {customerSignIn ? (
              <View style={styles.seg} accessibilityRole="radiogroup">
                {([['email', 'Email'], ['phone', 'Mobile number']] as const).map(([v, label]) => (
                  <Pressable key={v} onPress={() => { setIdType(v); setEmail(''); setFieldErrors({}); setError(null); }}
                    style={[styles.segBtn, idType === v && styles.segOn]} accessibilityRole="radio" accessibilityState={{ checked: idType === v }}>
                    <Text style={[styles.segText, idType === v && styles.segTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {customerSignIn && idType === 'phone' ? (
              <View style={styles.phoneRow}>
                <View style={styles.prefix}><Text style={styles.prefixText}>+91</Text></View>
                <TextInput style={[ui.input, { flex: 1 }, fieldErrors.id && styles.inputError]} placeholder="98765 43210" placeholderTextColor={C.muted}
                  keyboardType="phone-pad" autoComplete="tel" maxLength={11} autoFocus={params.use === 'phone'}
                  value={formatIndianMobile(digitsOnly(email))} onChangeText={(v) => { setEmail(digitsOnly(v).slice(0, 10)); setFieldErrors((e) => ({ ...e, id: undefined })); }}
                  accessibilityLabel="Mobile number, 10 digits" />
              </View>
            ) : (
              <TextInput style={[ui.input, fieldErrors.id && styles.inputError]} placeholder="you@example.com" placeholderTextColor={C.muted}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress"
                value={email} onChangeText={(v) => { setEmail(v); setFieldErrors((e) => ({ ...e, id: undefined })); }} accessibilityLabel="Email" />
            )}
            {fieldErrors.id ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{fieldErrors.id}</Text> : null}
          </View>
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>Password</Text>
              {!isRegister && (
                <Pressable onPress={() => router.push('/forgot')} hitSlop={10} accessibilityRole="link">
                  <Text style={styles.inlineLink}>Forgot password?</Text>
                </Pressable>
              )}
            </View>
            <PasswordInput placeholder={isRegister ? 'At least 8 characters' : 'Your password'} placeholderTextColor={C.muted} autoComplete={isRegister ? 'password-new' : 'password'}
              value={password} onChangeText={(v) => { setPassword(v); setFieldErrors((e) => ({ ...e, password: undefined })); }}
              onSubmitEditing={submit} returnKeyType="go" accessibilityLabel="Password" />
            {fieldErrors.password ? <Text style={styles.fieldError} accessibilityLiveRegion="polite">{fieldErrors.password}</Text> : null}
          </View>

          {error && <Text style={ui.error} accessibilityLiveRegion="polite">{error}</Text>}

          <PressScale style={[ui.btnDark, styles.submit, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            {busy
              ? <View style={styles.busyRow}><ActivityIndicator color={C.onBrand} /><Text style={ui.btnText}>{isRegister ? 'Creating account…' : 'Signing in…'}</Text></View>
              : <Text style={ui.btnText}>{isRegister ? 'Create account' : 'Sign in'}</Text>}
          </PressScale>

          {IS_PARTNER_APP ? (
            <View style={styles.altRow}>
              <Text style={styles.altText}>New partner?</Text>
              <Pressable onPress={() => router.push('/partner-apply')} hitSlop={10} accessibilityRole="link">
                <Text style={styles.inlineLink}>Apply to join Nabz</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.altRow}>
              <Text style={styles.altText}>{isRegister ? 'Have an account?' : 'New to Nabz?'}</Text>
              <Pressable onPress={() => { setMode(isRegister ? 'login' : 'register'); setFieldErrors({}); setError(null); if (!isRegister) setIdType('email'); }} hitSlop={10} accessibilityRole="link">
                <Text style={styles.inlineLink}>{isRegister ? 'Sign in' : 'Create an account'}</Text>
              </Pressable>
            </View>
          )}
        </View>
        )}

        {ALLOW_SERVER_OVERRIDE && (
          <View style={[ui.card, { gap: 8 }]}>
            <Text style={ui.h3}>Server (testing builds only)</Text>
            <TextInput style={ui.input} autoCapitalize="none" autoCorrect={false} keyboardType="url"
              value={server} onChangeText={setServer} placeholder={tr("http://10.0.2.2:5000")} placeholderTextColor={C.muted} />
            <Text style={ui.muted}>Emulator: http://10.0.2.2:5000 · USB phone: http://localhost:5000 (adb reverse) · Wi-Fi phone: http://&lt;laptop IP&gt;:5000</Text>
            <Pressable style={ui.btnOutline} onPress={testServer}>
              <Text style={ui.btnOutlineText}>Test connection</Text>
            </Pressable>
            {serverStatus && <Text style={ui.muted}>{serverStatus}</Text>}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const digitsOnly = (v: string) => v.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
/** Indian mobile shown as "98765 43210" while typing. */
const formatIndianMobile = (d: string) => (d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5, 10)}` : d);

/** Sign-in failures in plain words; network problems keep their own explanation. */
function signInProblem(e: unknown, isRegister: boolean): string {
  const status = (e as { status?: number })?.status;
  if (!isRegister && (status === 401 || status === 400)) return 'That email or mobile number and password don’t match. Check them, or tap “Forgot password?”.';
  if (status === 429) return 'Too many tries. Wait a minute and try again.';
  return describeNetworkError(e);
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 20, paddingBottom: 32, gap: 14 },
  hero: { gap: 8, paddingTop: 8, paddingBottom: 4 },
  mark: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft },
  subtitle: { fontFamily: F.medium, fontSize: 15, lineHeight: 22, color: C.inkSoft },
  seg: { flexDirection: 'row', backgroundColor: C.cardAlt, borderRadius: 12, padding: 3, gap: 3 },
  segBtn: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segOn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  segText: { fontFamily: F.semi, fontSize: 14, color: C.muted },
  segTextOn: { fontFamily: F.bold, color: C.ink },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  prefix: { minWidth: 56, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  prefixText: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  inputError: { borderColor: C.rose },
  fieldError: { fontFamily: F.semi, fontSize: 12.5, color: C.roseInk },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  portal: { width: '48%', flexGrow: 1, borderRadius: 16, padding: 12, gap: 4, borderWidth: 2, borderColor: C.border, backgroundColor: C.card },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.night, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNum: { color: C.onNight, fontFamily: F.heavy, fontSize: 12 },
  portalOn: { borderColor: C.ink, ...shadow },
  link: { color: C.brand, textAlign: 'center', fontFamily: F.bold, paddingVertical: 4 },
  // Form: label above each field, one left edge; secondary actions sit on the label row or centred under the button.
  field: { gap: 6 },
  fieldLabel: { fontFamily: F.bold, fontSize: 13, color: C.inkSoft },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  inlineLink: { fontFamily: F.bold, fontSize: 13, color: C.brand },
  submit: { marginTop: 4 },
  altRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingTop: 2 },
  altText: { fontFamily: F.medium, fontSize: 13, color: C.muted }
});
