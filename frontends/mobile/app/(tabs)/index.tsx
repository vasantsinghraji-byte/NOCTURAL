import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronRight, Crown, MapPin as MapPinIcon, Navigation, PackageCheck, Radio, RotateCcw, Search, ShieldCheck, Store, Truck, X, type LucideIcon
} from 'lucide-react-native';
import type { CareBooking, CareService, HomeBanner, HomeFeed, PharmacyVendor } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useLiveLocation } from '@/lib/useLiveLocation';
import { DEMO_AREA_ENABLED } from '@/lib/variant';
import { LiveMap, type MapPin } from '@/lib/MapView';
import { DEMO_POINT, inr, shortName } from '@/lib/care';
import { IconTile, serviceIcon, TONES } from '@/lib/icons';
import { PressScale, Rise, Skeleton } from '@/lib/motion';
import { C, F, IS_DARK, shadow, ui } from '@/lib/theme';

type Mode = 'ASAP' | 'SCHEDULED';
const DEMO_AREA_KEY = 'nabz.demoArea';
const MAP_H = Math.round(Dimensions.get('window').height * 0.34);
const ACTIVE = ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const BANNER_LOOK: Record<HomeBanner['kind'], { icon: LucideIcon; bg: string; fg: string; ink: string }> = {
  PLUS: { icon: Crown, bg: C.night, fg: C.gold, ink: C.onNight },
  SUPPLIES: { icon: PackageCheck, bg: C.brand, fg: '#ffffff', ink: '#ffffff' },
  PHARMACY: { icon: Truck, bg: C.mintSoft, fg: C.mint, ink: C.ink },
  TRUST: { icon: ShieldCheck, bg: C.amberSoft, fg: C.amber, ink: C.ink }
};
const STATUS_LINE: Record<string, string> = {
  REQUESTED: 'Finding a professional',
  ASSIGNED: 'Professional assigned',
  CONFIRMED: 'Confirmed',
  EN_ROUTE: 'On the way',
  IN_PROGRESS: 'Visit in progress'
};

/** Home = book a medical staff (Uber/Rapido style): live map, then the booking sheet. */
export default function BookHome() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { t } = useT();
  const live = useLiveLocation(DEMO_POINT, 'C-Scheme, Jaipur (demo)');
  // Testers outside the launch city can switch to the Jaipur demo area (remembered).
  const [demoArea, setDemoArea] = useState(false);
  useEffect(() => { if (DEMO_AREA_ENABLED) SecureStore.getItemAsync(DEMO_AREA_KEY).then((v) => setDemoArea(v === '1')).catch(() => undefined); }, []);
  const point = demoArea ? DEMO_POINT : live.point;
  const area = demoArea ? 'C-Scheme, Jaipur (demo area)' : live.area;
  const source = demoArea ? 'recent' : live.source;
  function chooseArea() {
    if (!DEMO_AREA_ENABLED) return;
    Alert.alert('Where should we send care?', 'Nabz is live in Jaipur. Outside Jaipur you can try the app in the Jaipur demo area.', [
      { text: 'My live location', onPress: () => { setDemoArea(false); SecureStore.deleteItemAsync(DEMO_AREA_KEY).catch(() => undefined); } },
      { text: 'Jaipur demo area', onPress: () => { setDemoArea(true); SecureStore.setItemAsync(DEMO_AREA_KEY, '1').catch(() => undefined); } },
      { text: 'Cancel', style: 'cancel' }
    ]);
  }
  const [stores, setStores] = useState<PharmacyVendor[]>([]);
  const [storesChecked, setStoresChecked] = useState(false);
  const [nearby, setNearby] = useState<{ count: number; nearestKm: number | null; staff: Array<{ lat: number; lng: number }> }>({ count: 0, nearestKm: null, staff: [] });
  const storesLoadedFor = useRef<string | null>(null);
  const [services, setServices] = useState<CareService[] | null>(null);
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [visits, setVisits] = useState<CareBooking[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('ASAP');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listCareServices()
      .then((r) => { setServices(r.services); setSelected((s) => s ?? r.services.find((x) => x.category !== 'PACKAGE')?.serviceType ?? null); })
      .catch((e) => { setServices([]); setError(describeNetworkError(e)); });
    api.getHomeFeed().then(setFeed).catch(() => undefined);
  }, []);

  // Upcoming visit + "book again" (refresh whenever Home comes into focus).
  useFocusEffect(useCallback(() => {
    if (session?.kind !== 'patient') { setVisits([]); return; }
    api.getMyCareBookings().then((r) => setVisits(r.data || r.bookings || [])).catch(() => undefined);
  }, [session?.kind]));

  // Stores near me (reload only after moving ~1 km) + online staff (every 20 s).
  useEffect(() => {
    if (!point) return undefined;
    const key = `${point.lat.toFixed(2)},${point.lng.toFixed(2)}`;
    if (storesLoadedFor.current !== key) {
      storesLoadedFor.current = key;
      api.getNearbyVendors({ ...point, radiusKm: 10 }).then((r) => { setStores(r.vendors); setStoresChecked(true); }).catch(() => undefined);
    }
    const loadStaff = () => api.getNearbyStaff({ ...point, radiusKm: 10 }).then(setNearby).catch(() => undefined);
    loadStaff();
    const tm = setInterval(loadStaff, 20_000);
    return () => clearInterval(tm);
  }, [point]);

  const pins = useMemo<MapPin[]>(() => [
    ...stores.map((s) => ({
      id: s._id, kind: 'store' as const, label: s.name,
      lat: s.location?.coordinates?.[1] ?? 0, lng: s.location?.coordinates?.[0] ?? 0
    })),
    ...nearby.staff.map((s, i) => ({ id: `staff-${i}`, kind: 'staff' as const, label: 'Medical staff online', lat: s.lat, lng: s.lng }))
  ], [stores, nearby]);

  const nursing = (services || []).filter((s) => s.category !== 'PACKAGE');
  const q = query.trim().toLowerCase();
  const shown = q ? nursing.filter((s) => `${s.displayName} ${s.name} ${s.shortDescription || ''}`.toLowerCase().includes(q)) : nursing;
  const service = nursing.find((s) => s.serviceType === selected) || null;
  const upcoming = visits.find((v) => ACTIVE.includes(v.status));
  const again = useMemo(() => {
    const seen = new Set<string>();
    return visits.filter((v) => v.status === 'COMPLETED' && !seen.has(v.serviceType) && seen.add(v.serviceType))
      .map((v) => nursing.find((s) => s.serviceType === v.serviceType)).filter(Boolean).slice(0, 4) as CareService[];
  }, [visits, nursing]);
  // Book now only makes sense when someone is online.
  const effectiveMode: Mode = nearby.count ? mode : 'SCHEDULED';

  function book(s: CareService | null = service, m: Mode = effectiveMode) {
    if (!s || !point) return;
    router.push({ pathname: '/book', params: { serviceType: s.serviceType, lat: String(point.lat), lng: String(point.lng), area, mode: s.category === 'PACKAGE' ? 'SCHEDULED' : m } });
  }

  function onBanner(b: HomeBanner) {
    if (b.action === 'plus') router.push('/account');
    else if (b.action === 'pharmacy') router.push('/pharmacy');
    else if (b.action === 'book') book();
  }

  const first = session?.name?.split(' ')[0];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[styles.mapWrap, { height: MAP_H + 40 }]}><LiveMap center={point} pins={pins} dark={IS_DARK} /></View>

      <Pressable onPress={chooseArea} style={[styles.where, { top: insets.top + 10 }]} accessibilityRole="button" accessibilityLabel="Change location">
        <View style={styles.dot} />
        <View style={{ flex: 1 }}>
          <Text style={ui.muted} numberOfLines={1}>
            {first ? `${t('home.hi', { name: first })} · ` : ''}{source === 'live' ? t('home.live') : t('home.careAt')}
          </Text>
          <Text style={ui.h3} numberOfLines={1}>{area}</Text>
        </View>
        {demoArea ? <View style={styles.demoPill}><Text style={styles.demoPillText}>DEMO</Text></View> : <Navigation size={18} color={C.brand} fill={C.brand} />}
      </Pressable>

      <ScrollView style={StyleSheet.absoluteFill} contentContainerStyle={{ paddingTop: MAP_H }} showsVerticalScrollIndicator={false}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Rise>
            <Text style={styles.title}>{upcoming ? 'Care, on its way.' : 'Care, in minutes.'}</Text>
            <View style={styles.searchBox}>
              <Search size={18} color={C.muted} />
              <TextInput value={query} onChangeText={setQuery} placeholder={t('home.search')} placeholderTextColor={C.muted} style={styles.searchInput} />
              {query ? <Pressable hitSlop={10} onPress={() => setQuery('')}><X size={16} color={C.muted} /></Pressable> : null}
            </View>
            <View style={[styles.chip, nearby.count ? { backgroundColor: C.mintSoft } : null]}>
              <Radio size={13} color={nearby.count ? C.mint : C.muted} />
              <Text style={[styles.chipText, nearby.count ? { color: C.mint } : null]} numberOfLines={2}>
                {nearby.count
                  ? `${t('home.online', { n: nearby.count })}${nearby.nearestKm !== null ? ` · nearest ${nearby.nearestKm} km` : ''}`
                  : t('home.offline')}
              </Text>
            </View>
          </Rise>

          {upcoming && (
            <Rise delay={60}>
              <PressScale style={styles.upcoming} onPress={() => router.push({ pathname: '/track', params: { id: upcoming._id } })}>
                <IconTile icon={serviceIcon(upcoming.serviceType)} bg="rgba(255,255,255,0.1)" color={C.onNight} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.upLabel}>{t('home.upcoming').toUpperCase()} · {STATUS_LINE[upcoming.status] || upcoming.status}</Text>
                  <Text style={styles.upTitle}>{upcoming.serviceType.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Text>
                  <Text style={styles.upSub}>{upcoming.dispatch?.mode === 'ASAP' ? 'Now' : `${String(upcoming.scheduledDate).slice(0, 10)} · ${upcoming.scheduledTime}`}</Text>
                </View>
                <View style={styles.upBtn}><Text style={styles.upBtnText}>{t('home.track')}</Text></View>
              </PressScale>
            </Rise>
          )}

          {error && <Text style={[ui.error, { marginTop: 12 }]}>{error}</Text>}

          {!demoArea && live.source !== 'fallback' && storesChecked && stores.length === 0 && (
            <PressScale style={styles.outside} onPress={chooseArea} disabled={!DEMO_AREA_ENABLED}>
              <MapPinIcon size={20} color={C.amber} />
              <View style={{ flex: 1 }}>
                <Text style={ui.h3}>Nabz isn’t in your area yet</Text>
                <Text style={ui.muted}>{DEMO_AREA_ENABLED ? 'We’re live in Jaipur. Tap to try the app in the Jaipur demo area.' : 'We’re live in Jaipur and coming to more cities soon.'}</Text>
              </View>
            </PressScale>
          )}

          {/* Book now vs schedule */}
          <View style={styles.segment}>
            {(['ASAP', 'SCHEDULED'] as Mode[]).map((m) => {
              const disabled = m === 'ASAP' && !nearby.count;
              const on = effectiveMode === m;
              return (
                <Pressable key={m} disabled={disabled} onPress={() => setMode(m)} style={[styles.segBtn, on && styles.segOn, disabled && { opacity: 0.45 }]}>
                  <Text style={[styles.segText, on && { color: C.onNight }]}>{m === 'ASAP' ? t('home.bookNow') : t('home.schedule')}</Text>
                </Pressable>
              );
            })}
          </View>

          {services === null ? (
            <View style={{ flexDirection: 'row', gap: 14, paddingVertical: 14 }}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} width={66} height={86} radius={20} />)}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 14 }}>
              {shown.map((s, i) => {
                const on = s.serviceType === selected;
                return (
                  <Pressable key={s.serviceType} onPress={() => setSelected(s.serviceType)} style={styles.cat}>
                    <View style={[styles.catRing, on && styles.catOn]}>
                      <IconTile icon={serviceIcon(s.serviceType)} bg={TONES[i % TONES.length].bg} color={TONES[i % TONES.length].fg} size={58} radius={20} />
                    </View>
                    <Text style={[styles.catText, on && { color: C.ink }]} numberOfLines={2}>{shortName(s)}</Text>
                  </Pressable>
                );
              })}
              {shown.length === 0 && <Text style={ui.muted}>No service matches “{query}”.</Text>}
            </ScrollView>
          )}

          {service && (
            <View style={styles.summary}>
              <View style={{ flex: 1 }}>
                <Text style={ui.h3}>{service.displayName || service.name}</Text>
                <Text style={ui.muted}>
                  {service.serviceDetails?.duration ? `${service.serviceDetails.duration} min · ` : ''}
                  {service.supplies?.length ? 'Supplies can be brought' : 'Brings own kit'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.price}>{inr(service.pricingPreview?.regular.totalAmount ?? service.pricing.basePrice)}</Text>
                <Text style={styles.priceNote}>incl. fee & GST</Text>
              </View>
            </View>
          )}

          <PressScale style={[ui.btnDark, { marginTop: 12 }, (!service || !point) && { opacity: 0.5 }]} disabled={!service || !point} onPress={() => book()}>
            <Text style={[ui.btnText, { color: C.onNight }]}>
              {service ? (effectiveMode === 'ASAP' ? `${t('home.bookNow')} · ${shortName(service)}` : `${t('home.schedule')} · ${shortName(service)}`) : 'Book'}
            </Text>
          </PressScale>

          {/* Offers (server sends only offers that are actually live) */}
          {feed?.banners?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={292} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingTop: 22 }}>
              {feed.banners.map((b) => {
                const look = BANNER_LOOK[b.kind] || BANNER_LOOK.TRUST;
                return (
                  <PressScale key={b.id} style={[styles.banner, { backgroundColor: look.bg }]} onPress={() => onBanner(b)}>
                    <look.icon size={22} color={look.fg} />
                    <Text style={[styles.bannerTitle, { color: look.ink }]}>{b.title}</Text>
                    <Text style={[styles.bannerSub, { color: look.ink, opacity: 0.75 }]} numberOfLines={2}>{b.subtitle}</Text>
                    <View style={styles.bannerCta}>
                      <Text style={[styles.bannerCtaText, { color: look.ink }]}>{b.cta}</Text>
                      <ChevronRight size={14} color={look.ink} />
                    </View>
                  </PressScale>
                );
              })}
            </ScrollView>
          ) : null}

          {again.length > 0 && (
            <>
              <Text style={ui.section}>{t('home.bookAgain')}</Text>
              <View style={{ gap: 8 }}>
                {again.map((s) => (
                  <PressScale key={s.serviceType} style={styles.row} onPress={() => book(s, effectiveMode)}>
                    <IconTile icon={serviceIcon(s.serviceType)} size={40} />
                    <Text style={[ui.h3, { flex: 1 }]}>{s.displayName || s.name}</Text>
                    <RotateCcw size={16} color={C.muted} />
                  </PressScale>
                ))}
              </View>
            </>
          )}

          {feed?.packages?.length ? (
            <>
              <Text style={ui.section}>{t('home.packages')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {feed.packages.map((p, i) => (
                  <PressScale key={p.serviceType} style={styles.pack} onPress={() => book(p, 'SCHEDULED')}>
                    <IconTile icon={serviceIcon(p.serviceType)} bg={TONES[(i + 2) % TONES.length].bg} color={TONES[(i + 2) % TONES.length].fg} size={42} />
                    <Text style={ui.h3} numberOfLines={2}>{p.displayName || p.name}</Text>
                    {p.shortDescription ? <Text style={ui.muted} numberOfLines={2}>{p.shortDescription}</Text> : null}
                    <Text style={styles.price}>{inr(p.pricing.basePrice)}</Text>
                  </PressScale>
                ))}
              </ScrollView>
            </>
          ) : null}

          {feed?.popular?.length ? (
            <>
              <Text style={ui.section}>{t('home.popular')}</Text>
              <View style={{ gap: 8 }}>
                {feed.popular.slice(0, 5).map((s, i) => (
                  <PressScale key={s.serviceType} style={styles.row} onPress={() => { setSelected(s.serviceType); book(s, effectiveMode); }}>
                    <IconTile icon={serviceIcon(s.serviceType)} bg={TONES[i % TONES.length].bg} color={TONES[i % TONES.length].fg} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={ui.h3}>{s.displayName || s.name}</Text>
                      {s.serviceDetails?.duration ? <Text style={ui.muted}>{s.serviceDetails.duration} min</Text> : null}
                    </View>
                    <Text style={styles.priceSmall}>{inr(s.pricing.basePrice)}</Text>
                  </PressScale>
                ))}
              </View>
            </>
          ) : null}

          {stores.length > 0 && (
            <View style={[styles.row, { marginTop: 18 }]}>
              <IconTile icon={Store} bg={C.mintSoft} color={C.mint} size={40} />
              <Text style={[ui.muted, { flex: 1 }]}>{stores.length} partner pharmacies near you supply your nurse.</Text>
            </View>
          )}
          <View style={{ height: 24 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  where: {
    position: 'absolute', left: 16, right: 16, zIndex: 5, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderRadius: 18, padding: 14, ...shadow, elevation: 8
  },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.brand, borderWidth: 3, borderColor: C.brandSoft },
  demoPill: { backgroundColor: C.amberSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  demoPillText: { color: C.amber, fontFamily: F.heavy, fontSize: 10, letterSpacing: 1 },
  outside: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.amberSoft, borderRadius: 18, padding: 14, marginTop: 14 },
  sheet: {
    backgroundColor: C.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 18, paddingTop: 10,
    minHeight: Dimensions.get('window').height - MAP_H, ...shadow, elevation: 20
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.border, marginBottom: 12 },
  title: { fontFamily: F.display, fontSize: 34, color: C.ink, letterSpacing: -0.3 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14,
    marginTop: 12, borderWidth: 1, borderColor: C.border
  },
  searchInput: { flex: 1, paddingVertical: 12, fontFamily: F.medium, fontSize: 14, color: C.ink },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start', backgroundColor: C.cardAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, maxWidth: '100%' },
  chipText: { fontFamily: F.semi, fontSize: 12, color: C.muted, flexShrink: 1 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.night, borderRadius: 22, padding: 14, marginTop: 14 },
  upLabel: { color: C.gold, fontFamily: F.heavy, fontSize: 10, letterSpacing: 1 },
  upTitle: { color: C.onNight, fontFamily: F.bold, fontSize: 15, marginTop: 2 },
  upSub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 12 },
  upBtn: { backgroundColor: C.onNight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  upBtnText: { color: '#0a0f24', fontFamily: F.heavy, fontSize: 12 },
  segment: { flexDirection: 'row', backgroundColor: C.cardAlt, borderRadius: 14, padding: 4, marginTop: 16 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  segOn: { backgroundColor: C.night },
  segText: { fontFamily: F.bold, color: C.muted, fontSize: 13 },
  cat: { width: 70, alignItems: 'center', gap: 6 },
  catRing: { padding: 2, borderRadius: 23, borderWidth: 2, borderColor: 'transparent' },
  catOn: { borderColor: C.ink },
  catText: { fontSize: 11, fontFamily: F.bold, color: C.muted, textAlign: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.border },
  price: { fontFamily: F.heavy, color: C.ink, fontSize: 17 },
  priceSmall: { fontFamily: F.bold, color: C.ink, fontSize: 14 },
  priceNote: { fontFamily: F.medium, color: C.muted, fontSize: 10 },
  banner: { width: 280, borderRadius: 22, padding: 16, gap: 6, minHeight: 150 },
  bannerTitle: { fontFamily: F.display, fontSize: 24, lineHeight: 27, marginTop: 4 },
  bannerSub: { fontFamily: F.medium, fontSize: 12, lineHeight: 17 },
  bannerCta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 'auto' },
  bannerCtaText: { fontFamily: F.heavy, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.border },
  pack: { width: 190, backgroundColor: C.card, borderRadius: 20, padding: 14, gap: 6, borderWidth: 1, borderColor: C.border }
});
