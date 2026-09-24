import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, type Href } from 'expo-router';
import type { MembershipStatus } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BadgeCheck, Briefcase, ChevronRight, Crown, Languages, LogOut, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react-native';
import { useT } from '@/lib/i18n';
import { C, F, shadow, ui } from '@/lib/theme';
import { appAlert } from '@/lib/dialog';

function Row({ icon: Icon, title, desc, href, onPress, right }: { icon: LucideIcon; title: string; desc: string; href?: Href; onPress?: () => void; right?: ReactNode }) {
  return (
    <Pressable style={styles.row} onPress={onPress || (() => href && router.push(href))}>
      <View style={styles.rowIcon}><Icon size={20} color={C.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={ui.h3}>{title}</Text>
        <Text style={ui.muted}>{desc}</Text>
      </View>
      {right ?? <ChevronRight size={18} color={C.faint} />}
    </Pressable>
  );
}

export default function Account() {
  const insets = useSafeAreaInsets();
  const { session, logout, setExplored } = useAuth();
  const { t, lang, setLang } = useT();
  const [plus, setPlus] = useState<MembershipStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPlus = useCallback(() => {
    if (session?.kind !== 'patient') { setPlus(null); return; }
    api.getMembership().then(setPlus).catch(() => setPlus(null));
  }, [session?.kind]);
  useFocusEffect(loadPlus);

  async function startTrial() {
    setBusy(true);
    try {
      await api.startMembershipTrial();
      loadPlus();
      appAlert('Welcome to Nabz Plus', 'Free delivery and no platform fee on nurse visits are now on.');
    } catch (e) {
      appAlert('Could not start trial', describeNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  const plan = plus?.plans?.[0];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 12 }}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          {session ? <Text style={styles.initial}>{session.name.charAt(0).toUpperCase()}</Text> : <UserRound size={28} color={C.onNight} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{session ? session.name : 'Welcome to Nabz'}</Text>
          <Text style={styles.email}>{session ? session.email : 'Sign in to book staff and order medicines'}</Text>
        </View>
      </View>

      {!session && (
        <Pressable style={ui.btnDark} onPress={() => router.push('/welcome')}><Text style={[ui.btnText, { color: C.onNight }]}>Sign in / Create account</Text></Pressable>
      )}

      {session?.kind === 'patient' && plus && (
        <View style={styles.plus}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Crown size={22} color={C.gold} />
            <Text style={styles.plusTitle}>Nabz Plus</Text>
            {plus.active && <View style={styles.plusBadge}><BadgeCheck size={12} color={C.mint} /><Text style={styles.plusBadgeText}>ACTIVE</Text></View>}
          </View>
          <Text style={styles.plusText}>Free medicine delivery · No platform fee on nurse visits · Priority support</Text>
          {plus.active ? (
            <Text style={styles.plusSub}>Valid till {plus.validUntil ? new Date(plus.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</Text>
          ) : plus.trialAvailable ? (
            <Pressable style={styles.plusBtn} disabled={busy} onPress={startTrial}>
              {busy ? <ActivityIndicator color={C.brand} /> : <Text style={styles.plusBtnText}>Start {plus.trialDays}-day free trial</Text>}
            </Pressable>
          ) : (
            <Text style={styles.plusSub}>
              {plan ? `₹${plan.price} / ${plan.days} days · ` : ''}{plus.onlinePayment ? 'Subscribe on nabz web' : 'Online payment coming soon'}
            </Text>
          )}
        </View>
      )}

      <Text style={ui.section}>Settings</Text>
      <Row icon={Languages} title={t('account.language')} desc={t('account.languageDesc')} onPress={() => setLang(lang === 'en' ? 'hi' : 'en')}
        right={<Text style={styles.lang}>{lang === 'en' ? 'English' : 'हिन्दी'}</Text>} />
      <Row icon={ShieldCheck} title="Permissions" desc="Location, notifications, camera, photos" href="/permissions" />
      <Row icon={Briefcase} title="Work with Nabz" desc="Nurses, physios, pharmacies, labs: apply to join" href="/partner-apply" />
      {session && <Row icon={LogOut} title="Log out" desc={`Signed in as ${session.email}`} onPress={async () => { await logout(); setExplored(false); router.replace('/welcome'); }} />}

      <Text style={[ui.muted, { textAlign: 'center', marginTop: 20 }]}>Nabz · care at your doorstep</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.night, borderRadius: 26, padding: 20, ...shadow },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  name: { color: C.onNight, fontSize: 26, fontFamily: F.display },
  email: { color: C.onNightMuted, marginTop: 2, fontFamily: F.medium },
  initial: { color: C.onNight, fontSize: 30, fontFamily: F.display },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.border },
  plus: { backgroundColor: C.night, borderRadius: 24, padding: 18, gap: 8, borderWidth: 1, borderColor: 'rgba(255,232,196,0.45)', ...shadow },
  plusTitle: { color: C.onNight, fontSize: 24, fontFamily: F.display },
  plusText: { color: C.onNightMuted, fontSize: 13, lineHeight: 19, fontFamily: F.medium },
  plusSub: { color: C.gold, fontFamily: F.bold },
  plusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.mintSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  plusBadgeText: { color: C.mint, fontSize: 10, fontFamily: F.heavy },
  plusBtn: { backgroundColor: C.gold, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  plusBtnText: { color: '#2a2523', fontFamily: F.heavy },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  lang: { fontFamily: F.bold, color: C.brand }
});
