import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarSpace } from '@/lib/PillTabBar';
import { router, useFocusEffect } from 'expo-router';
import {
  Activity, CalendarClock, ChevronDown, ChevronRight, Crown, FlaskConical, LayoutGrid, Map as MapIcon, MapPin as MapPinIcon, PackageCheck, Pill, Radio,
  RotateCcw, Search, ShieldCheck, Truck, X, Zap, type LucideIcon
} from 'lucide-react-native';
import type { CareBooking, CareService, HomeBanner, HomeFeed, PharmacyVendor } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useLiveLocation } from '@/lib/useLiveLocation';
import { DEMO_AREA_ENABLED } from '@/lib/variant';
import { DEMO_POINT, shortName } from '@/lib/care';
import { IconTile, serviceIcon } from '@/lib/icons';
import { inr as money } from '@/lib/market';
import { BottomSheet } from '@/lib/marketUI';
import { PressScale, Rise, Skeleton } from '@/lib/motion';
import { C, F, clay, ui } from '@/lib/theme';
import { appAlert } from '@/lib/dialog';
import { UpdatesFeed } from '@/lib/updatesFeed';
import { EasyHome } from '@/lib/EasyHome';
import { useEasyMode } from '@/lib/easyMode';

type Mode = 'ASAP' | 'SCHEDULED';
const DEMO_AREA_KEY = 'nabz.demoArea';
// Services shown on Home before "See all" (two rows of four).
const GRID_MAX = 8;
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

/**
 * Home (Zomato / Blinkit style): address and search up top, a one-line "who's
 * online" with the map a tap away, every nursing service in a grid, then the
 * rest of Nabz as big tiles. Easy mode swaps in the simpler EasyHome.
 */
export default function HomeTab() {
  const { easy } = useEasyMode();
  return easy ? <EasyHome /> : <BookHome />;
}

function BookHome() {
  const { suggest: easySuggest, setEasy, dismissSuggestion } = useEasyMode();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
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
    appAlert('Where should we send care?', 'Nabz is live in Jaipur. Outside Jaipur you can try the app in the Jaipur demo area.', [
      { text: 'My live location', onPress: () => { setDemoArea(false); SecureStore.deleteItemAsync(DEMO_AREA_KEY).catch(() => undefined); } },
      { text: 'Jaipur demo area', onPress: () => { setDemoArea(true); SecureStore.setItemAsync(DEMO_AREA_KEY, '1').catch(() => undefined); } },
      { text: 'Cancel', style: 'cancel' }
    ]);
  }
  const [stores, setStores] = useState<PharmacyVendor[]>([]);
  const [storesChecked, setStoresChecked] = useState(false);
  const [nearby, setNearby] = useState<{ count: number; nearestKm: number | null }>({ count: 0, nearestKm: null });
  const storesLoadedFor = useRef<string | null>(null);
  const [services, setServices] = useState<CareService[] | null>(null);
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [visits, setVisits] = useState<CareBooking[]>([]);
  const [picked, setPicked] = useState<CareService | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listCareServices().then((r) => setServices(r.services)).catch((e) => { setServices([]); setError(describeNetworkError(e)); });
    api.getHomeFeed().then(setFeed).catch(() => undefined);
  }, []);

  // Upcoming visit + "book again" (refresh whenever Home comes into focus).
  useFocusEffect(useCallback(() => {
    if (session?.kind !== 'patient') { setVisits([]); return; }
    api.getMyCareBookings().then((r) => setVisits(r.data || r.bookings || [])).catch(() => undefined);
  }, [session?.kind]));

  // Stores near me (reload only after moving ~1 km) + staff online (every 20 s).
  useEffect(() => {
    if (!point) return undefined;
    const key = `${point.lat.toFixed(2)},${point.lng.toFixed(2)}`;
    if (storesLoadedFor.current !== key) {
      storesLoadedFor.current = key;
      api.getNearbyVendors({ ...point, radiusKm: 10 }).then((r) => { setStores(r.vendors); setStoresChecked(true); }).catch(() => undefined);
    }
    const loadStaff = () => api.getNearbyStaff({ ...point, radiusKm: 10 }).then((r) => setNearby({ count: r.count, nearestKm: r.nearestKm })).catch(() => undefined);
    loadStaff();
    const tm = setInterval(loadStaff, 20_000);
    return () => clearInterval(tm);
  }, [point]);

  const nursing = useMemo(() => (services || []).filter((s) => s.category !== 'PACKAGE'), [services]);
  const packages = useMemo(() => (services || []).filter((s) => s.category === 'PACKAGE'), [services]);
  const q = query.trim().toLowerCase();
  const matches = q ? nursing.filter((s) => `${s.displayName} ${s.name} ${s.shortDescription || ''}`.toLowerCase().includes(q)) : nursing;
  // Two rows of four: seven services + "See all" when there are more.
  const hasMore = !q && matches.length > GRID_MAX;
  const gridItems = hasMore ? matches.slice(0, GRID_MAX - 1) : matches;
  const upcoming = visits.find((v) => ACTIVE.includes(v.status));
  const again = useMemo(() => {
    const seen = new Set<string>();
    return visits.filter((v) => v.status === 'COMPLETED' && !seen.has(v.serviceType) && seen.add(v.serviceType))
      .map((v) => nursing.find((s) => s.serviceType === v.serviceType)).filter(Boolean).slice(0, 3) as CareService[];
  }, [visits, nursing]);

  function book(s: CareService, m: Mode) {
    if (!point) return;
    setPicked(null);
    setAllOpen(false);
    router.push({ pathname: '/book', params: { serviceType: s.serviceType, lat: String(point.lat), lng: String(point.lng), area, mode: s.category === 'PACKAGE' ? 'SCHEDULED' : m } });
  }
  // Packages are always planned ahead; single services ask "now or later?" first.
  const pick = (s: CareService) => { setAllOpen(false); if (s.category === 'PACKAGE') book(s, 'SCHEDULED'); else setPicked(s); };
  const openMap = () => { if (point) router.push({ pathname: '/map', params: { lat: String(point.lat), lng: String(point.lng), area } }); };

  function onBanner(b: HomeBanner) {
    if (b.action === 'plus') router.push('/account');
    else if (b.action === 'pharmacy') router.push('/pharmacy');
    else if (b.action === 'book' && nursing[0]) pick(nursing[0]);
  }

  const first = session?.name?.split(' ')[0];
  const liveLine = nearby.count
    ? `${t('home.online', { n: nearby.count })}${nearby.nearestKm !== null ? ` · nearest ${nearby.nearestKm} km` : ''}`
    : t('home.offline');

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: tabSpace }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Where: the address first, like every delivery app; the map is one tap away */}
        <View style={styles.header}>
          <Pressable onPress={chooseArea} style={styles.where} accessibilityRole="button" accessibilityLabel={`Care at ${area}. Change location`}>
            <View style={styles.dot} />
            <View style={{ flex: 1 }}>
              <Text style={ui.muted} numberOfLines={1}>{first ? `${t('home.hi', { name: first })} · ` : ''}{source === 'live' ? t('home.live') : t('home.careAt')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[ui.h3, { flexShrink: 1 }]} numberOfLines={1}>{area}</Text>
                {DEMO_AREA_ENABLED ? <ChevronDown size={16} color={C.ink} /> : null}
              </View>
            </View>
            {demoArea ? <View style={styles.demoPill}><Text style={styles.demoPillText}>DEMO</Text></View> : null}
          </Pressable>
          <PressScale onPress={openMap} style={styles.mapBtn} accessibilityRole="button" accessibilityLabel="See professionals, clinics and pharmacies on the map">
            <MapIcon size={22} color={C.brand} />
          </PressScale>
        </View>

        <View style={styles.searchBox}>
          <Search size={18} color={C.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder={t('home.search')} placeholderTextColor={C.muted} style={styles.searchInput} accessibilityLabel="Search services" returnKeyType="search" />
          {query ? <Pressable hitSlop={10} onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search"><X size={16} color={C.muted} /></Pressable> : null}
        </View>

        <Pressable onPress={openMap} style={[styles.live, nearby.count ? { backgroundColor: C.mintSoft } : null]} accessibilityRole="button" accessibilityLabel={`${liveLine}. Open the map`}>
          <Radio size={14} color={nearby.count ? C.mint : C.muted} />
          <Text style={[styles.liveText, nearby.count ? { color: C.mint } : null]} numberOfLines={2}>{liveLine}</Text>
          <Text style={[styles.liveLink, nearby.count ? { color: C.mint } : null]}>Map</Text>
          <ChevronRight size={14} color={nearby.count ? C.mint : C.muted} />
        </Pressable>

        {easySuggest && (
          <Rise delay={40}>
            <View style={styles.easyOffer}>
              <Text style={ui.h3}>Prefer bigger buttons and fewer choices?</Text>
              <Text style={ui.muted}>Easy mode shows a simple home with large text. You can switch back any time in Account.</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <PressScale style={[ui.btn, { flex: 1, paddingVertical: 12 }]} onPress={() => setEasy(true)}><Text style={ui.btnText}>Turn On Easy Mode</Text></PressScale>
                <PressScale style={[ui.btnOutline, { paddingHorizontal: 18, paddingVertical: 12 }]} onPress={dismissSuggestion}><Text style={ui.btnOutlineText}>No Thanks</Text></PressScale>
              </View>
            </View>
          </Rise>
        )}

        {upcoming && (
          <Rise delay={60}>
            <PressScale style={styles.upcoming} onPress={() => router.push({ pathname: '/track', params: { id: upcoming._id } })}>
              <IconTile icon={serviceIcon(upcoming.serviceType)} bg="rgba(255,255,255,0.1)" color={C.onNight} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={styles.upLabel}>{t('home.upcoming').toUpperCase()} · {STATUS_LINE[upcoming.status] || upcoming.status}</Text>
                <Text style={styles.upTitle}>{upcoming.serviceType.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Text>
                {typeof upcoming.serviceProvider === 'object' && upcoming.serviceProvider?.name ? <Text style={styles.upSub}>{upcoming.serviceProvider.name} is coming</Text> : null}
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

        {/* Home nursing: everything visible at once, two rows of four */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle} numberOfLines={1}>{q ? `Results for “${query.trim()}”` : 'Nurse at home'}</Text>
          {!q && nursing.length > 0 ? <Pressable onPress={() => setAllOpen(true)} hitSlop={10} accessibilityRole="button"><Text style={styles.sectionLink}>See all</Text></Pressable> : null}
        </View>
        {services === null ? (
          <View style={styles.grid}>
            {Array.from({ length: GRID_MAX }).map((_, i) => <View key={i} style={styles.cell}><Skeleton width={64} height={64} radius={20} /><Skeleton width={54} height={10} radius={5} /></View>)}
          </View>
        ) : (
          <View style={styles.grid}>
            {gridItems.map((s) => <ServiceTile key={s.serviceType} service={s} onPress={() => pick(s)} />)}
            {hasMore ? (
              <Pressable onPress={() => setAllOpen(true)} style={styles.cell} accessibilityRole="button" accessibilityLabel={`See all ${nursing.length} services`}>
                <View style={[styles.tile, { backgroundColor: C.cardAlt }]}><LayoutGrid size={26} color={C.inkSoft} /></View>
                <Text style={styles.tileText}>See all</Text>
              </Pressable>
            ) : null}
            {q && matches.length === 0 ? <Text style={[ui.muted, { padding: 8 }]}>No service matches “{query.trim()}”.</Text> : null}
          </View>
        )}

        {/* The rest of Nabz: one big tile each (like Instamart / Dineout) */}
        <View style={styles.more}>
          <MoreTile icon={Pill} title="Pharmacy" sub="Medicines in 30 min" tone={C.mintSoft} fg={C.mint} onPress={() => router.push('/pharmacy')} />
          <MoreTile icon={FlaskConical} title="Lab tests" sub="Sample from home" tone={C.skySoft} fg={C.sky} onPress={() => router.push('/labs')} />
          <MoreTile icon={Activity} title="Physio & care" sub="Compare near you" tone={C.violetSoft} fg={C.violet} onPress={() => router.push('/care')} />
        </View>

        {/* Offers (server sends only offers that are actually live) */}
        {feed?.banners?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={292} decelerationRate="fast" style={{ marginHorizontal: -18 }} contentContainerStyle={{ gap: 12, paddingTop: 22, paddingHorizontal: 18 }}>
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

        {session?.kind === 'patient' && <UpdatesFeed audience="customer" />}

        {again.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 10 }]}>{t('home.bookAgain')}</Text>
            <View style={{ gap: 8 }}>
              {again.map((s) => (
                <PressScale key={s.serviceType} style={styles.row} onPress={() => pick(s)}>
                  <IconTile icon={serviceIcon(s.serviceType)} size={40} />
                  <Text style={[ui.h3, { flex: 1 }]}>{s.displayName || s.name}</Text>
                  <RotateCcw size={16} color={C.muted} />
                </PressScale>
              ))}
            </View>
          </>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Step 1 of booking: now or later? */}
      <BottomSheet visible={!!picked} onClose={() => setPicked(null)} title={picked ? (picked.displayName || picked.name) : ''}>
        {picked ? (
          <View style={{ gap: 10 }}>
            <Text style={ui.muted}>
              {picked.serviceDetails?.duration ? `${picked.serviceDetails.duration} min · ` : ''}
              {money(picked.pricingPreview?.regular.totalAmount ?? picked.pricing.basePrice)} incl. fee & GST
            </Text>
            <WhenOption icon={Zap} title={t('home.bookNow')} disabled={!nearby.count}
              sub={nearby.count ? `Nearest professional${nearby.nearestKm !== null ? ` is ${nearby.nearestKm} km away` : ' is online'}` : 'No one is online nearby right now'}
              onPress={() => book(picked, 'ASAP')} />
            <WhenOption icon={CalendarClock} title="Pick a time" sub="Choose a day and time that suits you" onPress={() => book(picked, 'SCHEDULED')} />
          </View>
        ) : null}
      </BottomSheet>

      {/* Every service, grouped */}
      <BottomSheet visible={allOpen} onClose={() => setAllOpen(false)} title="All services">
        <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.62 }} contentContainerStyle={{ gap: 6 }}>
          <Text style={styles.sheetGroup}>Nurse at home</Text>
          <View style={styles.grid}>{nursing.map((s) => <ServiceTile key={s.serviceType} service={s} onPress={() => pick(s)} />)}</View>
          {packages.length ? (
            <>
              <Text style={styles.sheetGroup}>{t('home.packages')}</Text>
              <View style={styles.grid}>{packages.map((s) => <ServiceTile key={s.serviceType} service={s} onPress={() => pick(s)} />)}</View>
            </>
          ) : null}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

function ServiceTile({ service, onPress }: { service: CareService; onPress: () => void }) {
  const Icon = serviceIcon(service.serviceType);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.cell, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]} accessibilityRole="button" accessibilityLabel={service.displayName || service.name}>
      <View style={styles.tile}><Icon size={28} color={C.brand} strokeWidth={1.9} /></View>
      <Text style={styles.tileText} numberOfLines={2}>{shortName(service)}</Text>
    </Pressable>
  );
}

function MoreTile({ icon: Icon, title, sub, tone, fg, onPress }: { icon: LucideIcon; title: string; sub: string; tone: string; fg: string; onPress: () => void }) {
  return (
    <PressScale style={[styles.moreTile, { backgroundColor: tone }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
      <Icon size={26} color={fg} />
      <Text style={styles.moreTitle} numberOfLines={2}>{title}</Text>
      <Text style={styles.moreSub} numberOfLines={2}>{sub}</Text>
    </PressScale>
  );
}

function WhenOption({ icon: Icon, title, sub, onPress, disabled }: { icon: LucideIcon; title: string; sub: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} accessibilityLabel={`${title}. ${sub}`}
      style={({ pressed }) => [styles.when, disabled && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.99 }], borderColor: C.brand }]}>
      <View style={styles.whenIcon}><Icon size={22} color={C.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={ui.h3}>{title}</Text>
        <Text style={ui.muted}>{sub}</Text>
      </View>
      <ChevronRight size={20} color={C.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  where: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  mapBtn: { width: 50, height: 50, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...clay },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.brand, borderWidth: 3, borderColor: C.brandSoft },
  demoPill: { backgroundColor: C.amberSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  demoPillText: { color: C.amber, fontFamily: F.heavy, fontSize: 10, letterSpacing: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, marginTop: 12, minHeight: 50, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, paddingVertical: 12, fontFamily: F.medium, fontSize: 15, color: C.ink },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: C.cardAlt, minHeight: 44 },
  liveText: { flex: 1, fontFamily: F.semi, fontSize: 13, color: C.muted },
  liveLink: { fontFamily: F.bold, fontSize: 13, color: C.muted },
  easyOffer: { backgroundColor: C.card, borderRadius: 22, padding: 16, gap: 4, marginTop: 14, borderWidth: 1.5, borderColor: C.brandSoft },
  outside: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.amberSoft, borderRadius: 18, padding: 14, marginTop: 14 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.night, borderRadius: 22, padding: 14, marginTop: 14 },
  upLabel: { color: C.gold, fontFamily: F.heavy, fontSize: 10, letterSpacing: 1 },
  upTitle: { color: C.onNight, fontFamily: F.bold, fontSize: 15, marginTop: 2 },
  upSub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 12 },
  upBtn: { backgroundColor: C.onNight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  upBtnText: { color: '#2a2523', fontFamily: F.heavy, fontSize: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 22, marginBottom: 6 },
  sectionTitle: { flexShrink: 1, fontFamily: F.display, fontSize: 20, color: C.ink, letterSpacing: -0.3 },
  sectionLink: { fontFamily: F.bold, fontSize: 14, color: C.brand },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '25%', alignItems: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 4, minHeight: 112 },
  tile: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 12.5, lineHeight: 16, fontFamily: F.bold, color: C.ink, textAlign: 'center' },
  more: { flexDirection: 'row', gap: 10, marginTop: 14 },
  moreTile: { flex: 1, borderRadius: 20, padding: 12, gap: 4, minHeight: 112 },
  moreTitle: { fontFamily: F.display, fontSize: 15, lineHeight: 19, color: C.ink, marginTop: 4 },
  moreSub: { fontFamily: F.medium, fontSize: 12, lineHeight: 16, color: C.inkSoft },
  when: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 14, minHeight: 72, borderWidth: 1.5, borderColor: C.border },
  whenIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  sheetGroup: { fontFamily: F.bold, fontSize: 14, color: C.inkSoft, marginTop: 6 },
  banner: { width: 280, borderRadius: 22, padding: 16, gap: 6, minHeight: 150 },
  bannerTitle: { fontFamily: F.display, fontSize: 24, lineHeight: 27, marginTop: 4 },
  bannerSub: { fontFamily: F.medium, fontSize: 12, lineHeight: 17 },
  bannerCta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 'auto' },
  bannerCtaText: { fontFamily: F.heavy, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.border }
});
