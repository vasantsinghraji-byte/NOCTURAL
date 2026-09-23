import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Redirect, router } from 'expo-router';
import { Bike, FlaskConical, IndianRupee, Stethoscope, Store, Wallet, type LucideIcon } from 'lucide-react-native';
import { homeForRole, useAuth } from '@/lib/auth';
import { Wordmark } from '@/lib/Brand';
import { PressScale, Rise } from '@/lib/motion';
import { C, F } from '@/lib/theme';

const ROLES: Array<{ icon: LucideIcon; title: string; line: string }> = [
  { icon: Stethoscope, title: 'Nurses & physios', line: 'Go online, get visit requests nearby, earn per visit' },
  { icon: Store, title: 'Pharmacies', line: 'Receive orders and nurse pickups from your area' },
  { icon: FlaskConical, title: 'Path labs', line: 'Home sample collection requests' },
  { icon: Bike, title: 'Delivery partners', line: 'Medicine deliveries in your area' }
];

/** Nabz Partner: first screen (sign in or apply). */
export default function PartnerWelcome() {
  const insets = useSafeAreaInsets();
  const { ready, session } = useAuth();
  if (ready && session) return <Redirect href={homeForRole(session.role)} />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.orb, { top: -130, left: -80 }]} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20, paddingHorizontal: 22, flexGrow: 1 }}>
        <Wordmark size={24} suffix="Partner" />

        <Rise delay={100}>
          <Text style={styles.title}>Earn on your{'\n'}own schedule.</Text>
          <Text style={styles.sub}>Join Jaipur’s home-care network. Weekly payouts, clear earnings on every visit, no joining fee.</Text>
        </Rise>

        <Rise delay={220} style={styles.stats}>
          <View style={styles.stat}>
            <IndianRupee size={16} color={C.gold} />
            <Text style={styles.statValue}>80%</Text>
            <Text style={styles.statLabel}>of the visit price is yours</Text>
          </View>
          <View style={styles.stat}>
            <Wallet size={16} color={C.gold} />
            <Text style={styles.statValue}>Weekly</Text>
            <Text style={styles.statLabel}>bank payouts</Text>
          </View>
        </Rise>

        <Rise delay={320} style={{ gap: 10, marginTop: 18 }}>
          {ROLES.map((r) => (
            <View key={r.title} style={styles.role}>
              <View style={styles.roleIcon}><r.icon size={18} color={C.onNight} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>{r.title}</Text>
                <Text style={styles.roleLine}>{r.line}</Text>
              </View>
            </View>
          ))}
        </Rise>

        <View style={{ flex: 1, minHeight: 24 }} />

        <Rise delay={420} style={{ gap: 10 }}>
          <PressScale style={styles.primary} onPress={() => router.push('/login')}>
            <Text style={styles.primaryText}>Sign in</Text>
          </PressScale>
          <PressScale style={styles.secondary} onPress={() => router.push('/partner-apply')}>
            <Text style={styles.secondaryText}>Apply to join</Text>
          </PressScale>
          <Text style={styles.note}>Accounts are created after document and background checks. Roles are never self-assigned.</Text>
        </Rise>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.night, overflow: 'hidden' },
  orb: { position: 'absolute', width: 380, height: 380, borderRadius: 999, backgroundColor: 'rgba(212,166,74,0.14)' },
  title: { color: C.onNight, fontFamily: F.display, fontSize: 46, lineHeight: 50, marginTop: 34 },
  sub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 15, lineHeight: 22, marginTop: 10 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 22 },
  stat: { flex: 1, borderRadius: 18, padding: 14, gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  statValue: { color: C.onNight, fontFamily: F.heavy, fontSize: 22 },
  statLabel: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 12 },
  role: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roleIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  roleTitle: { color: C.onNight, fontFamily: F.bold, fontSize: 14 },
  roleLine: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 12 },
  primary: { backgroundColor: C.gold, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#0a0f24', fontFamily: F.heavy, fontSize: 15 },
  secondary: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' },
  secondaryText: { color: C.onNight, fontFamily: F.bold, fontSize: 15 },
  note: { color: C.onNightMuted, opacity: 0.75, fontFamily: F.medium, fontSize: 11, textAlign: 'center', marginTop: 4 }
});
