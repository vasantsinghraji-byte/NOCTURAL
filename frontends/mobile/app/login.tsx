import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Bike, FlaskConical, Stethoscope, Store, type LucideIcon } from 'lucide-react-native';
import { homeForRole, useAuth, type AccountKind } from '@/lib/auth';
import { ALLOW_SERVER_OVERRIDE, api, describeNetworkError, saveServerUrl } from '@/lib/api';
import { IconTile } from '@/lib/icons';
import { PressScale } from '@/lib/motion';
import { IS_PARTNER_APP } from '@/lib/variant';
import { PasswordInput } from '@/lib/fields';
import { C, F, shadow, ui } from '@/lib/theme';

type Mode = 'login' | 'register';

// Partner portals are enforced server-side: a pharmacy account can't open the
// medical-staff area and vice versa. Customers never see this chooser.
const PARTNER_PORTALS: Array<{ kind: AccountKind; icon: LucideIcon; title: string; hint: string; tone: string; fg: string }> = [
  { kind: 'staff', icon: Stethoscope, title: 'Medical staff', hint: 'Nurses & physios', tone: C.violetSoft, fg: C.violet },
  { kind: 'pharmacy', icon: Store, title: 'Pharmacy', hint: 'Store partner', tone: C.mintSoft, fg: C.mint }
];

// Delivery and path-lab partners are onboarding now; their dashboards open next
// (sign-in stays off until then so nobody lands on an empty screen).
type WaitlistRole = 'DELIVERY' | 'PATH_LAB';
const WAITLIST: Array<{ role: WaitlistRole; icon: LucideIcon; title: string; hint: string; tone: string; fg: string; steps: string[] }> = [
  {
    role: 'DELIVERY', icon: Bike, title: 'Delivery partner', hint: 'Medicine deliveries', tone: C.skySoft, fg: C.sky,
    steps: ['Get delivery requests from partner pharmacies near you', 'Pick up the packed order at the store', 'Hand it over with the customer’s delivery code', 'Earn per delivery, paid weekly']
  },
  {
    role: 'PATH_LAB', icon: FlaskConical, title: 'Path lab', hint: 'Nabz-certified labs', tone: C.amberSoft, fg: C.amber,
    steps: ['A customer books a test at the Nabz common rate', 'A certified collector takes the sample at home and brings it to your lab', 'You confirm receipt, run the test and upload the report', 'The report reaches the patient directly in the Nabz app']
  }
];

/** Email sign-in. Customer app: customers only. Nabz Partner: staff / pharmacy (delivery and path lab: apply). */
export default function Login() {
  const { login, register } = useAuth();
  const params = useLocalSearchParams<{ kind?: AccountKind }>();
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

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (ALLOW_SERVER_OVERRIDE) await saveServerUrl(server);
      const session = mode === 'register'
        ? await register({ name, email, phone, password })
        : await login(kind, email, password);
      if (router.canDismiss()) router.dismissAll();
      router.replace(homeForRole(session.role));
    } catch (e) {
      setError(describeNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === 'register';
  const active = PARTNER_PORTALS.find((p) => p.kind === kind);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={ui.screen} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={ui.display}>{isRegister ? 'Create account' : IS_PARTNER_APP ? 'Partner sign in' : 'Welcome back'}</Text>

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
                <Text style={[ui.btnText, { color: C.onNight }]}>Apply as {w.title.toLowerCase()}</Text>
              </PressScale>
            </View>
          );
        })() : (
        <View style={[ui.card, { gap: 10 }]}>
          {IS_PARTNER_APP && active && <Text style={ui.label}>{active.title} login</Text>}
          {isRegister && (
            <>
              <TextInput style={ui.input} placeholder="Full name" placeholderTextColor={C.faint} value={name} onChangeText={setName} />
              <TextInput style={ui.input} placeholder="Mobile (10 digits)" placeholderTextColor={C.faint} keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={10} />
            </>
          )}
          <TextInput style={ui.input} placeholder="Email" placeholderTextColor={C.faint} autoCapitalize="none" keyboardType="email-address"
            autoComplete="email" value={email} onChangeText={setEmail} />
          <PasswordInput placeholder="Password" autoComplete="password" value={password} onChangeText={setPassword} />

          {!isRegister && (
            <Pressable onPress={() => router.push('/forgot')} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
          )}

          {error && <Text style={ui.error}>{error}</Text>}

          <PressScale style={[ui.btnDark, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={C.onNight} /> : <Text style={[ui.btnText, { color: C.onNight }]}>{isRegister ? 'Create account' : 'Sign in'}</Text>}
          </PressScale>

          {IS_PARTNER_APP ? (
            <Pressable onPress={() => router.push('/partner-apply')}>
              <Text style={styles.link}>New partner? Apply to join Nabz</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setMode(isRegister ? 'login' : 'register')}>
              <Text style={styles.link}>{isRegister ? 'Have an account? Sign in' : 'New to Nabz? Create an account'}</Text>
            </Pressable>
          )}
        </View>
        )}

        {ALLOW_SERVER_OVERRIDE && (
          <View style={[ui.card, { gap: 8 }]}>
            <Text style={ui.h3}>Server (testing builds only)</Text>
            <TextInput style={ui.input} autoCapitalize="none" autoCorrect={false} keyboardType="url"
              value={server} onChangeText={setServer} placeholder="http://10.0.2.2:5000" placeholderTextColor={C.faint} />
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

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  portal: { width: '48%', flexGrow: 1, borderRadius: 18, padding: 12, gap: 4, borderWidth: 2, borderColor: C.border, backgroundColor: C.card },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.night, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNum: { color: C.onNight, fontFamily: F.heavy, fontSize: 12 },
  portalOn: { borderColor: C.ink, ...shadow },
  link: { color: C.brand, textAlign: 'center', fontFamily: F.bold, paddingVertical: 4 }
});
