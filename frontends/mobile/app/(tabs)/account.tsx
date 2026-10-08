import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarSpace } from '@/lib/PillTabBar';
import { router, useFocusEffect, type Href } from 'expo-router';
import type { MembershipStatus } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BadgeCheck, Briefcase, CalendarHeart, HeartHandshake, ChevronRight, Crown, FlaskConical, Gift, Languages, LogOut, MapPin, ShieldCheck, Trash2, Type, UserRound, type LucideIcon } from 'lucide-react-native';
import { useT } from '@/lib/i18n';
import { CallMeBack } from '@/lib/CallMeBack';
import { openTextSizeSettings, useEasyMode } from '@/lib/easyMode';
import { C, F, shadow, ui } from '@/lib/theme';
import { appAlert, appPrompt } from '@/lib/dialog';
import { PhotoAvatar } from '@/lib/profilePhoto';

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
  const tabSpace = useTabBarSpace();
  const { session, logout, setExplored } = useAuth();

  async function enterReferral() {
    const code = await appPrompt({ title: 'Referral code', message: 'Got a code from a Nabz nurse, physio or pharmacy? Enter it before your first order.', placeholder: 'NZXXXXXX', confirmText: 'Apply', maxLength: 12 });
    if (!code) return;
    try {
      const r = await api.applyPartnerReferral(code.trim().toUpperCase());
      appAlert('Referral applied', r.message);
    } catch (e) {
      appAlert('Could not apply the code', describeNetworkError(e));
    }
  }

  function deleteAccount() {
    appAlert('Delete your account?', 'Your name, phone, email and addresses are erased and you are signed out everywhere. Your health records are kept as your medical history, and past orders and visits stay as records we must keep by law, no longer linked to your name. This can’t be undone.', [
      { text: 'Keep account', style: 'cancel' },
      {
        text: 'Continue', style: 'destructive', onPress: async () => {
          const typed = await appPrompt({ title: 'Type DELETE', message: 'To confirm, type DELETE in capitals.', placeholder: 'DELETE', confirmText: 'Delete account', maxLength: 10 });
          if (typed === null) return;
          if (typed !== 'DELETE') { appAlert('Not deleted', 'The text didn’t match, so your account is unchanged.'); return; }
          try {
            await api.deleteMyAccount(typed);
            await logout();
            setExplored(false);
            router.replace('/welcome');
            appAlert('Account deleted', 'Your personal data has been erased. Thank you for using Nabz.');
          } catch (e) {
            appAlert('Could not delete account', describeNetworkError(e));
          }
        }
      }
    ]);
  }
  const { t, lang, setLang } = useT();
  const { easy, setEasy } = useEasyMode();
  const [plus, setPlus] = useState<MembershipStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPlus = useCallback(() => {
    if (session?.kind !== 'patient') { setPlus(null); return; }
    api.getMembership().then(setPlus).catch(() => setPlus(null));
  }, [session?.kind]);
  useFocusEffect(loadPlus);
  // Profile photo (customers): fetched with the profile, changed here.
  const [photo, setPhoto] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    if (session?.kind !== 'patient') return;
    api.me().then((r) => setPhoto(r.patient?.profilePhoto?.url || null)).catch(() => undefined);
  }, [session?.kind]))

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
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: tabSpace, gap: 12 }}>
      <View style={styles.profile}>
        {session
          ? <PhotoAvatar name={session.name} url={photo} size={60} editable={session.kind === 'patient'} onChange={setPhoto} />
          : <View style={styles.avatar}><UserRound size={28} color={C.onNight} /></View>}
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

      {session?.kind === 'patient' && (
        <>
          <Text style={ui.section}>Your care</Text>
          <Row icon={CalendarHeart} title="Care plans and credit" desc="Physio and home care plans, suggestions, Nabz credit" href="/care/plans" />
          <Row icon={FlaskConical} title="Lab tests" desc="Bookings, collection codes and reports" href="/labs/orders" />
          <Row icon={MapPin} title="Saved addresses" desc="Home, work, family: one tap at booking" href="/addresses" />
          <Row icon={HeartHandshake} title="Care Circle" desc="Help a parent with their care, or let family help you" href="/family" />
        </>
      )}

      <Text style={ui.section}>Easy to use</Text>
      <View style={[styles.row, { alignItems: 'center' }]}>
        <View style={{ flex: 1 }}>
          <Text style={ui.h3}>Easy mode</Text>
          <Text style={ui.muted}>A simple home with big buttons and fewer choices</Text>
        </View>
        <Switch value={easy} onValueChange={setEasy} trackColor={{ true: C.brand, false: C.faint }} thumbColor="#ffffff" accessibilityLabel="Easy mode" />
      </View>
      <Row icon={Type} title="Make text bigger" desc="Opens your phone’s display settings. Nabz follows the size you choose." onPress={openTextSizeSettings} />
      {session?.kind === 'patient' && <CallMeBack topic="OTHER" />}

      <Text style={ui.section}>Settings</Text>
      <Row icon={Languages} title={t('account.language')} desc={t('account.languageDesc')} onPress={() => setLang(lang === 'en' ? 'hi' : 'en')}
        right={<Text style={styles.lang}>{lang === 'en' ? 'English' : 'हिन्दी'}</Text>} />
      <Row icon={ShieldCheck} title="Permissions" desc="Location, notifications, camera, photos" href="/permissions" />
      <Row icon={Briefcase} title="Work with Nabz" desc="Nurses, physios, pharmacies, labs: apply to join" href="/partner-apply" />
      {session && <Row icon={LogOut} title="Log out" desc={`Signed in as ${session.email}`} onPress={async () => { await logout(); setExplored(false); router.replace('/welcome'); }} />}
      {session?.kind === 'patient' && <Row icon={Gift} title="Have a referral code?" desc="From a Nabz nurse, physio or pharmacy" onPress={enterReferral} />}
      {session?.kind === 'patient' && <Row icon={Trash2} title="Delete account" desc="Erase your personal data from Nabz" onPress={deleteAccount} />}

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
