import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/lib/T';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { BadgeCheck, Phone } from 'lucide-react-native';
import type { SignInMethods, SocialSignInResult } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Wordmark } from '@/lib/Brand';
import { GoogleButton } from '@/lib/GoogleButton';
import { PressScale, Rise } from '@/lib/motion';
import { WelcomeCareCarousel } from '@/lib/WelcomeCareCarousel';
import { GOOGLE_CONFIGURED } from '@/lib/variant';
import { C, F } from '@/lib/theme';
import { BrandGradient } from '@/lib/BrandHeader';
import { TermsCheckbox } from '@/lib/fields';

/** First screen of the customer app: phone / Google / email, or explore first. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useT();
  const { adoptPatientSession, setExplored } = useAuth();
  const [methods, setMethods] = useState<SignInMethods>({ google: false, phone: true, email: true });
  const [error, setError] = useState<string | null>(null);
  // Signing in or up needs the Terms accepted (browsing with "Explore" doesn't).
  const [agreed, setAgreed] = useState(false);
  const needTerms = () => { if (agreed) return false; setError('Please tick the box to accept the Terms and Conditions.'); return true; };

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
      <BrandGradient />
      <View style={[styles.orb, { top: -120, right: -90 }]} />
      <View style={[styles.orb, { top: 260, left: -140, width: 300, height: 300 }]} />

      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 20, paddingHorizontal: 22, flexGrow: 1 }}>
        <View style={styles.topRow}>
          <Wordmark size={24} color={C.onHeader} />
          <View style={styles.lang}>
            {(['en', 'hi'] as const).map((l) => (
              <Pressable key={l} onPress={() => setLang(l)} style={[styles.langBtn, lang === l && styles.langOn]}>
                <Text style={[styles.langText, lang === l && { color: C.brand }]}>{l === 'en' ? 'EN' : 'हि'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Patient Care Experience Showcase */}
        <Rise delay={80}>
          <WelcomeCareCarousel />
        </Rise>

        <Rise delay={160}>
          <Text style={styles.kicker}>{t('welcome.kicker')}</Text>
          <Text style={styles.title}>{t('welcome.title')}</Text>
          <Text style={styles.sub}>{t('welcome.sub')}</Text>
        </Rise>

        <View style={{ flex: 1, minHeight: 20 }} />

        <Rise delay={260} style={{ gap: 10 }}>
          <TermsCheckbox checked={agreed} onChange={(v) => { setAgreed(v); if (v) setError(null); }} tone="brand"
            label="I agree to the" linkText="Terms and Conditions and Privacy Policy" />
          {error && <Text style={styles.error}>{error}</Text>}
          {/* Mobile number first: a code by SMS where that's switched on, otherwise
              the mobile number + password on the sign-in screen. */}
          <PressScale style={[styles.primary, !agreed && { opacity: 0.6 }]} accessibilityRole="button"
            onPress={() => { if (!needTerms()) router.push(methods.phone ? '/phone' : { pathname: '/login', params: { use: 'phone' } }); }}>
            <Phone size={18} color={C.brand} />
            <Text style={styles.primaryText}>{methods.phone ? t('welcome.phone') : t('welcome.mobile')}</Text>
          </PressScale>
          {GOOGLE_CONFIGURED && methods.google && (
            <View pointerEvents={agreed ? 'auto' : 'none'} style={!agreed && { opacity: 0.6 }}>
              <GoogleButton label={t('welcome.google')} onResult={onGoogle} onError={setError} />
            </View>
          )}
          <View style={styles.links}>
            <Pressable hitSlop={8} onPress={() => { if (!needTerms()) router.push('/login'); }}><Text style={styles.link}>{t('welcome.email')}</Text></Pressable>
            <View style={styles.sep} />
            <Pressable hitSlop={8} onPress={explore}><Text style={styles.link}>{t('welcome.explore')}</Text></Pressable>
          </View>
        </Rise>

        <Pressable style={styles.partner} onPress={() => router.push('/partner-apply')}>
          <BadgeCheck size={18} color={C.onHeader} />
          <Text style={styles.partnerText}>{t('welcome.partner')} <Text style={{ color: C.onHeader, fontFamily: F.bold, textDecorationLine: 'underline' }}>{t('welcome.partnerCta')}</Text></Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.brand, overflow: 'hidden' },
  orb: { position: 'absolute', width: 360, height: 360, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lang: { flexDirection: 'row', backgroundColor: C.headerGlass, borderWidth: 1, borderColor: C.headerGlassBorder, borderRadius: 999, padding: 3 },
  langBtn: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 },
  langOn: { backgroundColor: '#ffffff' },
  langText: { color: C.onHeader, fontFamily: F.bold, fontSize: 12 },
  stage: { height: 230, marginTop: 18, alignItems: 'center', justifyContent: 'center' },
  pinHalo: {
    width: 170, height: 170, borderRadius: 85, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderWidth: 1, borderColor: C.nightAlt
  },
  float: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.nightAlt
  },
  floatIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: C.night, alignItems: 'center', justifyContent: 'center' },
  floatTitle: { color: C.onNight, fontFamily: F.bold, fontSize: 12 },
  floatSub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 11 },
  kicker: { color: C.onHeaderMuted, fontFamily: F.bold, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 14 },
  title: { color: C.onHeader, fontFamily: F.displayHeavy, fontSize: 48, lineHeight: 52, marginTop: 8, letterSpacing: -1 },
  sub: { color: C.onHeaderMuted, fontFamily: F.medium, fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 330 },
  primary: { flexDirection: 'row', gap: 10, backgroundColor: '#ffffff', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.08), 0 14px 26px -12px rgba(0,0,0,0.45)' },
  primaryText: { color: C.brand, fontFamily: F.heavy, fontSize: 16 },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 8 },
  link: { color: C.onHeader, fontFamily: F.bold, fontSize: 14 },
  sep: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.onHeaderMuted },
  partner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: C.headerGlassBorder, backgroundColor: C.headerGlass
  },
  partnerText: { color: C.onHeaderMuted, fontFamily: F.medium, fontSize: 13, flex: 1 },
  terms: { color: C.onHeaderMuted, opacity: 0.7, fontFamily: F.medium, fontSize: 11, textAlign: 'center', marginTop: 12 },
  error: { backgroundColor: 'rgba(229,72,77,0.18)', color: '#ffb3b0', padding: 12, borderRadius: 12, overflow: 'hidden', fontFamily: F.semi }
});
