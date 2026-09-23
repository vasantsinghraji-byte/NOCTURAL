import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import {
  ArrowLeft, BadgeCheck, Clock, Crown, Fingerprint, Languages, Navigation, Phone, Share2, ShieldAlert, ShieldCheck, Star, Syringe
} from 'lucide-react-native';
import type { VisitTracking } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { LiveMap, type MapPin } from '@/lib/MapView';
import { NabzMark } from '@/lib/Brand';
import { PressScale, Radar, Rise, success, warn } from '@/lib/motion';
import { WEB_BASE_URL } from '@/lib/variant';
import { C, F, IS_DARK, shadow, ui } from '@/lib/theme';

const STATUS_TEXT: Record<string, string> = {
  ASSIGNED: 'Professional assigned',
  CONFIRMED: 'Visit confirmed',
  EN_ROUTE: 'On the way to you',
  IN_PROGRESS: 'With you now',
  COMPLETED: 'Visit completed',
  CANCELLED: 'Visit cancelled'
};
const TAGS = ['Punctual', 'Gentle', 'Explained clearly', 'Hygienic', 'Professional', 'Brought everything'];

function shareUrl(token: string) {
  // Website hosts /track/<token>. Dev fallback: the web app runs next to the API on :3000.
  const base = WEB_BASE_URL || api.getBaseUrl().replace(/:5000$/, ':3000');
  return `${base}/track/${token}`;
}

/** The matching moment: finding (radar) → accepted (trust card + visit code) → live route → rating. */
export default function Track() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tracking, setTracking] = useState<VisitTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [rated, setRated] = useState(false);
  const [busy, setBusy] = useState(false);

  const searching = tracking?.status === 'REQUESTED' && ['SEARCHING', 'OFFERED', 'IDLE'].includes(tracking.dispatch?.status || 'SEARCHING');
  const noStaff = tracking?.status === 'REQUESTED' && tracking.dispatch?.status === 'NO_STAFF';

  const load = useCallback(() => {
    api.getVisitTracking(id).then((r) => {
      setTracking((prev) => {
        // Haptic when a nurse accepts.
        if (prev?.status === 'REQUESTED' && r.tracking.status !== 'REQUESTED' && r.tracking.staff) success();
        return r.tracking;
      });
      setError(null);
    }).catch((e) => setError(describeNetworkError(e)));
  }, [id]);

  useEffect(() => {
    load();
    const tm = setInterval(load, searching ? 3_000 : 8_000);
    return () => clearInterval(tm);
  }, [load, searching]);

  const pins = useMemo<MapPin[]>(() => (tracking?.staffLocation
    ? [{ id: 'staff', kind: 'staff', label: tracking.staff?.name || 'Your nurse', ...tracking.staffLocation }]
    : []), [tracking]);
  const route = useMemo(() => (tracking?.staffLocation && tracking.destination ? [tracking.staffLocation, tracking.destination] : undefined), [tracking]);

  const etaMin = tracking?.estimatedArrival
    ? Math.max(1, Math.round((new Date(tracking.estimatedArrival).getTime() - Date.now()) / 60000))
    : null;

  async function cancel() {
    Alert.alert('Cancel this request?', 'Supplies ordered for this visit will be cancelled too.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel request', style: 'destructive',
        onPress: () => api.cancelCareBooking(id, 'Cancelled by patient while matching').then(() => router.replace('/bookings')).catch((e) => setError(describeNetworkError(e)))
      }
    ]);
  }

  async function share() {
    if (!tracking?.shareToken) return;
    const name = tracking.staff?.name?.split(' ')[0] || 'The nurse';
    await Share.share({ message: `${name} from Nabz is on the way for my home visit. Track live: ${shareUrl(tracking.shareToken)}` }).catch(() => undefined);
  }

  function sos() {
    warn();
    Alert.alert('Emergency?', 'Nabz safety team will be alerted right away with your location.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call ambulance 108', onPress: () => Linking.openURL('tel:108') },
      {
        text: 'Alert Nabz', style: 'destructive', onPress: async () => {
          let coords: { lat?: number; lng?: number } = {};
          try {
            const pos = await Location.getLastKnownPositionAsync();
            if (pos) coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          } catch { /* location optional */ }
          try {
            const r = await api.raiseSos(id, coords);
            Alert.alert('Help is on the way', `Our safety team has been alerted. Ambulance ${r.emergencyNumbers.ambulance || '108'} · Police ${r.emergencyNumbers.police || '112'} · Women helpline ${r.emergencyNumbers.women || '1091'}.`);
          } catch (e) {
            Alert.alert('Could not reach Nabz', `${describeNetworkError(e)}\n\nCall 112 for emergencies.`);
          }
        }
      }
    ]);
  }

  async function submitRating() {
    if (!stars) return;
    setBusy(true);
    try {
      await api.rateVisit(id, { stars, tags, comment: comment.trim() || undefined });
      success();
      setRated(true);
    } catch (e) {
      setError(describeNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  // ── Finding: radar over midnight ──────────────────────────────────────────
  if (!tracking || searching || noStaff) {
    return (
      <View style={styles.findScreen}>
        <StatusBar style="light" />
        <Pressable style={[styles.backDark, { top: insets.top + 10 }]} onPress={() => router.back()}>
          <ArrowLeft size={22} color={C.onNight} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          {noStaff ? (
            <Rise style={{ alignItems: 'center', gap: 14 }}>
              <View style={styles.pinHalo}><NabzMark size={70} /></View>
              <Text style={styles.findTitle}>{t('find.none')}</Text>
              <Text style={styles.findSub}>{t('find.noneSub')}</Text>
            </Rise>
          ) : (
            <>
              <Radar size={280} color="#5b7cff"><NabzMark size={72} /></Radar>
              <Text style={styles.findTitle}>{t('find.title')}</Text>
              <Text style={styles.findSub}>{t('find.sub')}</Text>
              {tracking?.dispatch?.attempts ? <Text style={styles.findMeta}>{t('find.attempt', { n: tracking.dispatch.attempts })}</Text> : null}
              {!tracking && !error && <ActivityIndicator color={C.onNight} style={{ marginTop: 10 }} />}
            </>
          )}
          {error && <Text style={[ui.error, { marginTop: 16 }]}>{error}</Text>}
        </View>
        <View style={{ padding: 20, paddingBottom: insets.bottom + 20, gap: 10 }}>
          {noStaff && (
            <PressScale style={styles.lightBtn} onPress={() => router.replace('/')}>
              <Text style={styles.lightBtnText}>{t('home.schedule')}</Text>
            </PressScale>
          )}
          {tracking && (
            <Pressable onPress={cancel} style={{ alignItems: 'center', padding: 10 }}>
              <Text style={styles.cancelText}>{noStaff ? 'Cancel request' : 'Cancel'}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const staff = tracking.staff;
  const v = staff?.verification || {};
  const badges = [
    v.id && { icon: Fingerprint, label: 'ID verified' },
    v.police && { icon: ShieldCheck, label: 'Police verified' },
    v.council && { icon: BadgeCheck, label: 'Council registered' },
    v.vaccinated && { icon: Syringe, label: 'Vaccinated' }
  ].filter(Boolean) as Array<{ icon: typeof ShieldCheck; label: string }>;
  const done = tracking.status === 'COMPLETED';
  const live = ['CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS', 'ASSIGNED'].includes(tracking.status);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={StyleSheet.absoluteFill}>
        <LiveMap center={tracking.destination || null} pins={pins} fit={pins.length > 0} dark={IS_DARK} route={route} />
      </View>
      <Pressable style={[styles.back, { top: insets.top + 10 }]} onPress={() => router.back()}>
        <ArrowLeft size={22} color={C.ink} />
      </Pressable>
      {live && (
        <PressScale style={[styles.sos, { top: insets.top + 10 }]} onPress={sos}>
          <ShieldAlert size={18} color="#ffffff" />
          <Text style={styles.sosText}>{t('match.sos')}</Text>
        </PressScale>
      )}

      <ScrollView style={styles.sheetScroll} contentContainerStyle={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.grabber} />
        {error && <Text style={ui.error}>{error}</Text>}

        <Rise>
          <Text style={ui.label}>{STATUS_TEXT[tracking.status] || tracking.status}</Text>
          <Text style={styles.headline}>
            {done ? t('rate.title') : staff ? t('match.title', { name: staff.name.split(' ')[0] }) : 'Assigning a professional'}
          </Text>
        </Rise>

        {staff && !done && (
          <Rise delay={80} style={styles.staffCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{staff.name.charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={ui.h3}>{staff.name}</Text>
              <Text style={ui.muted}>
                {[staff.qualification, staff.experienceYears ? `${staff.experienceYears} yrs exp.` : null].filter(Boolean).join(' · ') || 'Verified professional'}
              </Text>
              <View style={styles.inline}>
                {staff.rating ? (
                  <><Star size={12} color={C.gold} fill={C.gold} /><Text style={styles.meta}>{Number(staff.rating).toFixed(1)} ({staff.totalReviews || 0})</Text></>
                ) : <Text style={styles.meta}>New on Nabz</Text>}
                {staff.languages?.length ? (<><Languages size={12} color={C.muted} /><Text style={styles.meta}>{staff.languages.join(', ')}</Text></>) : null}
              </View>
            </View>
            {staff.phone ? (
              <PressScale style={styles.call} onPress={() => Linking.openURL(`tel:${staff.phone}`)}>
                <Phone size={20} color="#ffffff" />
              </PressScale>
            ) : null}
          </Rise>
        )}

        {badges.length > 0 && !done && (
          <View style={styles.badges}>
            {badges.map((b) => (
              <View key={b.label} style={styles.badge}><b.icon size={13} color={C.mint} /><Text style={styles.badgeText}>{b.label}</Text></View>
            ))}
          </View>
        )}

        {tracking.visitCode && !done && (
          <Rise delay={140} style={styles.codeCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.codeLabel}>{t('match.code').toUpperCase()}</Text>
              <Text style={styles.codeHint}>{t('match.codeHint')}</Text>
            </View>
            <View style={styles.codeDigits}>
              {tracking.visitCode.split('').map((d, i) => <View key={i} style={styles.digit}><Text style={styles.digitText}>{d}</Text></View>)}
            </View>
          </Rise>
        )}

        {!done && (
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Clock size={16} color={C.brand} />
              <Text style={styles.statValue}>{etaMin !== null ? `${etaMin} min` : '—'}</Text>
              <Text style={ui.muted}>{t('match.eta')}</Text>
            </View>
            <View style={styles.stat}>
              <Navigation size={16} color={C.brand} />
              <Text style={styles.statValue}>{tracking.distanceKm !== null ? `${tracking.distanceKm} km` : '—'}</Text>
              <Text style={ui.muted}>{tracking.staffLocation ? t('match.away') : 'Live once on the way'}</Text>
            </View>
            {tracking.shareToken ? (
              <PressScale style={[styles.stat, { alignItems: 'flex-start' }]} onPress={share}>
                <Share2 size={16} color={C.brand} />
                <Text style={styles.statValue}>{t('match.share')}</Text>
                <Text style={ui.muted}>with family</Text>
              </PressScale>
            ) : null}
          </View>
        )}

        {done && !rated && (
          <Rise style={{ gap: 12 }}>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} hitSlop={6} onPress={() => setStars(n)}>
                  <Star size={38} color={C.gold} fill={n <= stars ? C.gold : 'transparent'} strokeWidth={1.5} />
                </Pressable>
              ))}
            </View>
            {stars > 0 && (
              <>
                <View style={styles.tags}>
                  {TAGS.map((tg) => {
                    const on = tags.includes(tg);
                    return (
                      <Pressable key={tg} onPress={() => setTags((x) => (on ? x.filter((y) => y !== tg) : [...x, tg]))} style={[styles.tag, on && styles.tagOn]}>
                        <Text style={[styles.tagText, on && { color: C.onNight }]}>{tg}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput style={[ui.input, { minHeight: 64, textAlignVertical: 'top' }]} multiline value={comment} onChangeText={setComment}
                  placeholder={stars <= 3 ? 'What went wrong? We read every report.' : 'Anything to add? (optional)'} placeholderTextColor={C.faint} />
                <PressScale style={[ui.btnDark, busy && { opacity: 0.6 }]} disabled={busy} onPress={submitRating}>
                  {busy ? <ActivityIndicator color={C.onNight} /> : <Text style={[ui.btnText, { color: C.onNight }]}>{t('rate.submit')}</Text>}
                </PressScale>
              </>
            )}
          </Rise>
        )}

        {done && rated && (
          <Rise style={{ gap: 12 }}>
            <Text style={ui.body}>{t('rate.thanks')}</Text>
            <PressScale style={styles.plus} onPress={() => router.push('/account')}>
              <Crown size={20} color={C.gold} />
              <View style={{ flex: 1 }}>
                <Text style={styles.plusTitle}>Save on your next visit</Text>
                <Text style={styles.plusSub}>Nabz Plus members pay no platform fee on visits and get free medicine delivery.</Text>
              </View>
            </PressScale>
            <PressScale style={ui.btnDark} onPress={() => router.replace('/')}>
              <Text style={[ui.btnText, { color: C.onNight }]}>Done</Text>
            </PressScale>
          </Rise>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  findScreen: { flex: 1, backgroundColor: C.night },
  backDark: { position: 'absolute', left: 16, zIndex: 3, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  pinHalo: { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(91,124,255,0.14)' },
  findTitle: { color: C.onNight, fontFamily: F.display, fontSize: 36, textAlign: 'center', marginTop: 10 },
  findSub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  findMeta: { color: C.gold, fontFamily: F.bold, fontSize: 12, marginTop: 10, letterSpacing: 0.5 },
  lightBtn: { backgroundColor: C.onNight, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  lightBtnText: { color: '#0a0f24', fontFamily: F.heavy, fontSize: 15 },
  cancelText: { color: C.onNightMuted, fontFamily: F.bold },
  back: { position: 'absolute', left: 16, zIndex: 3, width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  sos: { position: 'absolute', right: 16, zIndex: 3, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#e5484d', paddingHorizontal: 14, height: 44, borderRadius: 22, ...shadow },
  sosText: { color: '#ffffff', fontFamily: F.heavy, letterSpacing: 1 },
  sheetScroll: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '64%' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, paddingTop: 10, gap: 14, ...shadow, elevation: 20 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.border },
  headline: { fontFamily: F.display, fontSize: 32, color: C.ink, marginTop: 2 },
  staffCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: C.border },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: C.night, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.onNight, fontFamily: F.display, fontSize: 28 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  meta: { fontFamily: F.semi, fontSize: 12, color: C.muted, marginRight: 6 },
  call: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.mintSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontFamily: F.bold, fontSize: 11, color: C.mint },
  codeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.night, borderRadius: 20, padding: 16 },
  codeLabel: { color: C.gold, fontFamily: F.heavy, fontSize: 11, letterSpacing: 1.2 },
  codeHint: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 12, marginTop: 4, lineHeight: 16 },
  codeDigits: { flexDirection: 'row', gap: 6 },
  digit: { width: 36, height: 46, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  digitText: { color: C.onNight, fontFamily: F.heavy, fontSize: 22 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 12, gap: 2, borderWidth: 1, borderColor: C.border },
  statValue: { fontSize: 18, fontFamily: F.heavy, color: C.ink },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  tagOn: { backgroundColor: C.night, borderColor: C.night },
  tagText: { fontFamily: F.bold, fontSize: 12, color: C.ink },
  plus: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.night, borderRadius: 20, padding: 16 },
  plusTitle: { color: C.onNight, fontFamily: F.bold, fontSize: 15 },
  plusSub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 12, lineHeight: 17, marginTop: 2 }
});
