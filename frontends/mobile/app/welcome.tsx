import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { BadgeCheck, Clock3, Phone, ShieldCheck, Star } from 'lucide-react-native';
import type { SignInMethods, SocialSignInResult } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { NabzMark, Wordmark } from '@/lib/Brand';
import { GoogleButton } from '@/lib/GoogleButton';
import { PressScale, Rise } from '@/lib/motion';
import { GOOGLE_CONFIGURED } from '@/lib/variant';
import { C, F } from '@/lib/theme';

/** First screen of the customer app: phone / Google / email, or explore first. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useT();
  const { adoptPatientSession, setExplored } = useAuth();
  const [methods, setMethods] = useState<SignInMethods>({ google: false, phone: true, email: true });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSignInMethods().then((r) => setMethods(r.methods)).catch(() => undefined);
  }, []);

  async function onGoogle(res: SocialSignInResult) {
    if (res.needsProfile) {
      router.push({ pathname: '/phone', params: { signupToken: res.signupToken, needs: res.profile.needs.join(','), name: res.profile.name || '', email: res.profile.email || '' } });
      return;
    }
    await adoptPatientSession(res);
    router.replace('/');
  }

  function explore() {
    setExplored(true);
    router.replace('/');
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.orb, { top: -120, right: -90, backgroundColor: 'rgba(255,214,222,0.30)' }]} />
      <View style={[styles.orb, { top: 260, left: -140, width: 300, height: 300, backgroundColor: 'rgba(255,232,196,0.12)' }]} />

      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 20, paddingHorizontal: 22, flexGrow: 1 }}>
        <View style={styles.topRow}>
          <Wordmark size={24} />
          <View style={styles.lang}>
            {(['en', 'hi'] as const).map((l) => (
              <Pressable key={l} onPress={() => setLang(l)} style={[styles.langBtn, lang === l && styles.langOn]}>
                <Text style={[styles.langText, lang === l && { color: C.night }]}>{l === 'en' ? 'EN' : 'हि'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Product vignette: the promise, shown rather than told. */}
        <Rise delay={80} style={styles.stage}>
          <View style={styles.pinHalo}><NabzMark size={96} /></View>
          <Rise delay={380} style={[styles.float, { top: 14, left: 0 }]}>
            <View style={styles.floatIcon}><Clock3 size={15} color={C.mint} /></View>
            <View>
              <Text style={styles.floatTitle}>Asha · B.Sc Nursing</Text>
              <Text style={styles.floatSub}>Arriving in 12 min</Text>
            </View>
          </Rise>
          <Rise delay={560} style={[styles.float, { bottom: 18, right: 0 }]}>
            <View style={styles.floatIcon}><ShieldCheck size={15} color={C.gold} /></View>
            <View>
              <Text style={styles.floatTitle}>Police verified</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Star size={11} color={C.gold} fill={C.gold} /><Text style={styles.floatSub}>4.9 · 320 visits</Text>
              </View>
            </View>
          </Rise>
        </Rise>

        <Rise delay={160}>
          <Text style={styles.kicker}>{t('welcome.kicker')}</Text>
          <Text style={styles.title}>{t('welcome.title')}</Text>
          <Text style={styles.sub}>{t('welcome.sub')}</Text>
        </Rise>

        <View style={{ flex: 1, minHeight: 20 }} />

        <Rise delay={260} style={{ gap: 10 }}>
          {error && <Text style={styles.error}>{error}</Text>}
          {methods.phone && (
            <PressScale style={styles.primary} onPress={() => router.push('/phone')}>
              <Phone size={18} color={C.night} />
              <Text style={styles.primaryText}>{t('welcome.phone')}</Text>
            </PressScale>
          )}
          {GOOGLE_CONFIGURED && methods.google && (
            <GoogleButton label={t('welcome.google')} onResult={onGoogle} onError={setError} />
          )}
          <View style={styles.links}>
            <Pressable hitSlop={8} onPress={() => router.push('/login')}><Text style={styles.link}>{t('welcome.email')}</Text></Pressable>
            <View style={styles.sep} />
            <Pressable hitSlop={8} onPress={explore}><Text style={styles.link}>{t('welcome.explore')}</Text></Pressable>
          </View>
        </Rise>

        <Pressable style={styles.partner} onPress={() => router.push('/partner-apply')}>
          <BadgeCheck size={18} color={C.gold} />
          <Text style={styles.partnerText}>{t('welcome.partner')} <Text style={{ color: C.gold, fontFamily: F.bold }}>{t('welcome.partnerCta')}</Text></Text>
        </Pressable>
        <Text style={styles.terms}>{t('welcome.terms')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.night, overflow: 'hidden' },
  orb: { position: 'absolute', width: 360, height: 360, borderRadius: 999 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lang: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: 3 },
  langBtn: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 },
  langOn: { backgroundColor: C.onNight },
  langText: { color: C.onNightMuted, fontFamily: F.bold, fontSize: 12 },
  stage: { height: 230, marginTop: 18, alignItems: 'center', justifyContent: 'center' },
  pinHalo: {
    width: 170, height: 170, borderRadius: 85, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,214,222,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)'
  },
  float: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)'
  },
  floatIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  floatTitle: { color: C.onNight, fontFamily: F.bold, fontSize: 12 },
  floatSub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 11 },
  kicker: { color: C.gold, fontFamily: F.bold, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 14 },
  title: { color: C.onNight, fontFamily: F.display, fontSize: 50, lineHeight: 52, marginTop: 8, letterSpacing: -0.5 },
  sub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 330 },
  primary: { flexDirection: 'row', gap: 10, backgroundColor: C.onNight, borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#2a2523', fontFamily: F.heavy, fontSize: 15 },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 8 },
  link: { color: C.onNight, fontFamily: F.bold, fontSize: 14 },
  sep: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.onNightMuted },
  partner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,232,196,0.35)', backgroundColor: 'rgba(255,232,196,0.07)'
  },
  partnerText: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 13, flex: 1 },
  terms: { color: C.onNightMuted, opacity: 0.7, fontFamily: F.medium, fontSize: 11, textAlign: 'center', marginTop: 12 },
  error: { backgroundColor: 'rgba(229,72,77,0.18)', color: '#ffb3b0', padding: 12, borderRadius: 12, overflow: 'hidden', fontFamily: F.semi }
});
