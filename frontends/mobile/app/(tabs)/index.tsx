import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/lib/T';
import * as SecureStore from 'expo-secure-store';
import { useTabBarSpace } from '@/lib/PillTabBar';
import { router, useFocusEffect } from 'expo-router';
import {
  Activity, CalendarClock, ChevronDown, ChevronRight, Clock, Crown, FlaskConical, LayoutGrid, Map as MapIcon, MapPin as MapPinIcon, PackageCheck, Pill,
  RotateCcw, Search, ShieldCheck, Syringe, Truck, X, Zap, type LucideIcon
} from 'lucide-react-native';
import type { CareBooking, CareService, HomeBanner, HomeFeed, PharmacyOrder, PharmacyVendor } from '@medrush/shared';
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
import { C, F, R, depth, ui } from '@/lib/theme';
import { BrandHeader } from '@/lib/BrandHeader';
import { EmbossTile, Gloss } from '@/lib/Skeuo';
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
  PLUS: { icon: Crown, bg: C.wine2, fg: C.plus, ink: '#ffffff' },
  SUPPLIES: { icon: PackageCheck, bg: C.night, fg: C.brand, ink: C.onNight },
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
  // Back to the real location (the way out of the demo area, always on screen while in it).
  function exitDemo() {
    setDemoArea(false);
    SecureStore.deleteItemAsync(DEMO_AREA_KEY).catch(() => undefined);
  }
  function chooseArea() {
    if (!DEMO_AREA_ENABLED) return;
    appAlert('Where should we send care?', 'Nabz is live in Jaipur. Outside Jaipur you can try the app in the Jaipur demo area.', [
      { text: 'My live location', onPress: exitDemo },
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
  // Search suggestions open in a dropdown under the box (measured on screen).
  const [searchOpen, setSearchOpen] = useState(false);
  const [dropTop, setDropTop] = useState(0);
  const searchRef = useRef<View>(null);
  const measureSearch = () => searchRef.current?.measureInWindow((_x, y, _w, h) => setDropTop(y + h + 6));
  const closeSearch = () => { setSearchOpen(false); Keyboard.dismiss(); };
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<PharmacyOrder[]>([]);

  useEffect(() => {
    api.listCareServices().then((r) => setServices(r.services)).catch((e) => { setServices([]); setError(describeNetworkError(e)); });
    api.getHomeFeed().then(setFeed).catch(() => undefined);
  }, []);

  // Upcoming visit + "book again" (refresh whenever Home comes into focus).
  useFocusEffect(useCallback(() => {
    if (session?.kind !== 'patient') { setVisits([]); return; }
    api.getMyCareBookings().then((r) => setVisits(r.data || r.bookings || [])).catch(() => undefined);
    api.getMyOrders({ status: 'DELIVERED', limit: 5 }).then((r) => setOrders(r.orders || [])).catch(() => undefined);
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
  // Suggestions: every service (packages too) whose name or description matches.
  const suggestions = useMemo(() => (q ? (services || []).filter((s) => `${s.displayName} ${s.name} ${s.shortDescription || ''}`.toLowerCase().includes(q)).slice(0, 6) : []), [q, services]);
  const wantsMedicine = q.length > 1 && !suggestions.length;
  // Two rows of four: seven services + "See all" when there are more.
  const hasMore = nursing.length > GRID_MAX;
  const gridItems = hasMore ? nursing.slice(0, GRID_MAX - 1) : nursing;
  const upcoming = visits.find((v) => ACTIVE.includes(v.status));
  // Medicines bought before (no prescription items: those need a fresh upload).
  const buyAgain = useMemo(() => {
    const seen = new Set<string>();
    const out: { medicine: string; name: string; pack?: string; price: number; mrp?: number; store: string }[] = [];
    for (const o of orders) {
      const store = typeof o.vendor === 'string' ? o.vendor : o.vendor?._id;
      for (const it of o.items || []) {
        if (!store || it.requiresPrescription || seen.has(String(it.medicine))) continue;
        seen.add(String(it.medicine));
        out.push({ medicine: String(it.medicine), name: it.name, pack: it.packSize, price: it.unitPrice, mrp: it.mrp, store: String(store) });
      }
    }
    return out.slice(0, 8);
  }, [orders]);
  // Delivery promise from the nearest store that can deliver here.
  const etaMinutes = useMemo(() => {
    const e = stores[0]?.eta;
    return e ? Math.max(e.assignmentMinutes, e.prepMinutes) + e.lastMileMinutes : null;
  }, [stores]);
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

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: tabSpace }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => { if (searchOpen) closeSearch(); }}>
        {/* Brand header: where, search and who's online, on the logo gradient */}
        <BrandHeader bleed={18} style={{ paddingHorizontal: 18 }}>
        <View style={styles.header}>
          <Pressable onPress={chooseArea} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Delivery to ${area}. Change location`}>
            <View style={styles.etaLabelRow}>
              <Clock size={13} color={C.onHeaderMuted} />
              <Text style={styles.etaLabel}>{first ? `HI ${first.toUpperCase()} · ` : ''}DELIVERY IN</Text>
            </View>
            <Text style={styles.eta} numberOfLines={1}>{etaMinutes ? `${etaMinutes} minutes` : '30 minutes'}<Text style={{ color: C.coral }}>.</Text></Text>
            <View style={styles.whereRow}>
              <MapPinIcon size={15} color={C.onHeader} />
              <Text style={styles.whereText} numberOfLines={1}>{source === 'live' ? 'Here · ' : ''}{area}</Text>
              {DEMO_AREA_ENABLED ? <ChevronDown size={16} color={C.onHeader} /> : null}
              {demoArea ? <View style={styles.demoPill}><Text style={styles.demoPillText}>DEMO</Text></View> : null}
              {demoArea ? (
                <Pressable onPress={exitDemo} hitSlop={10} style={styles.exitDemo} accessibilityRole="button" accessibilityLabel="Exit demo area and use my location">
                  <X size={12} color={C.onHeader} /><Text style={styles.exitDemoText}>Exit demo</Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
          <PressScale onPress={openMap} style={styles.mapBtn} accessibilityRole="button" accessibilityLabel="See professionals, clinics and pharmacies on the map">
            <MapIcon size={22} color={C.onHeader} />
          </PressScale>
        </View>

        <View ref={searchRef} style={styles.searchBox} onLayout={measureSearch}>
          <Search size={18} color={C.muted} />
          <TextInput value={query} onChangeText={(v) => { setQuery(v); setSearchOpen(true); measureSearch(); }} onFocus={() => { measureSearch(); setSearchOpen(true); }}
            placeholder={t('home.search')} placeholderTextColor={C.muted} style={styles.searchInput} accessibilityLabel="Search services" returnKeyType="search"
            onSubmitEditing={() => { if (suggestions[0]) { closeSearch(); setQuery(''); pick(suggestions[0]); } }} />
          {query ? <Pressable hitSlop={10} onPress={() => { setQuery(''); closeSearch(); }} accessibilityRole="button" accessibilityLabel="Clear search"><X size={16} color={C.muted} /></Pressable> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, marginHorizontal: -18 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}>
          {[
            { label: 'All', on: true, go: () => undefined },
            { label: 'Medicines', go: () => router.push('/pharmacy') },
            { label: 'Lab tests', go: () => router.push('/labs') },
            { label: 'Nurse', go: () => setAllOpen(true) },
            { label: 'Physio', go: () => router.push('/care') }
          ].map((c) => (
            <Pressable key={c.label} onPress={c.go} accessibilityRole="button" accessibilityState={{ selected: !!c.on }} style={[styles.chip, c.on && styles.chipOn]}>
              <Text style={[styles.chipText, c.on && styles.chipTextOn]}>{c.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        </BrandHeader>

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
              <IconTile icon={serviceIcon(upcoming.serviceType)} bg={C.card} color={C.brand} size={46} />
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

        <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 12 }]}>What do you need?</Text>
        <View style={styles.needRow}>
          <NeedTile icon={Pill} label="Pharmacy" badge={etaMinutes ? `${etaMinutes} min` : '30 min'} onPress={() => router.push('/pharmacy')} />
          <NeedTile icon={FlaskConical} label="Lab tests" tone="green" onPress={() => router.push('/labs')} />
          <NeedTile icon={Syringe} label="Nurse at home" tone="coral" badge={nearby.count ? `${nearby.count} online` : undefined} onPress={() => setAllOpen(true)} />
          <NeedTile icon={Activity} label="Physio & care" tone="ink" onPress={() => router.push('/care')} />
        </View>

        {buyAgain.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Buy again</Text>
              <Pressable onPress={() => router.push('/pharmacy')} hitSlop={10} accessibilityRole="button"><Text style={styles.sectionLink}>See all</Text></Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 18, paddingVertical: 6 }}>
              {buyAgain.map((m) => {
                const off = m.mrp && m.mrp > m.price ? Math.round(((m.mrp - m.price) / m.mrp) * 100) : 0;
                return (
                  <View key={m.medicine} style={styles.prod}>
                    <View style={styles.prodImg}>
                      <Pill size={28} color={C.faint} strokeWidth={1.6} />
                      {off >= 5 ? <Text style={styles.prodOff}>{off}% OFF</Text> : null}
                    </View>
                    <Text style={styles.prodName} numberOfLines={2}>{m.name}</Text>
                    {m.pack ? <Text style={styles.prodPack} numberOfLines={1}>{m.pack}</Text> : null}
                    <View style={styles.prodRow}>
                      <View>
                        <Text style={styles.prodPrice}>{money(m.price)}</Text>
                        {off >= 5 ? <Text style={styles.prodMrp}>{money(m.mrp as number)}</Text> : null}
                      </View>
                      <Pressable onPress={() => router.push({ pathname: '/pharmacy', params: { store: m.store, add: m.medicine } })} accessibilityRole="button" accessibilityLabel={`Add ${m.name}`}
                        style={({ pressed }) => [styles.addBtn, pressed && { backgroundColor: C.brandSoft }]}>
                        <Text style={styles.addText}>ADD</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Home nursing: everything visible at once, two rows of four */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle} numberOfLines={1}>Nurse at home</Text>
          {nursing.length > 0 ? <Pressable onPress={() => setAllOpen(true)} hitSlop={10} accessibilityRole="button"><Text style={styles.sectionLink}>See all</Text></Pressable> : null}
        </View>
        {services === null ? (
          <View style={styles.grid}>
            {Array.from({ length: GRID_MAX }).map((_, i) => <View key={i} style={styles.cell}><Skeleton width={64} height={64} radius={16} /><Skeleton width={54} height={10} radius={5} /></View>)}
          </View>
        ) : (
          <View style={styles.grid}>
            {gridItems.map((s) => <ServiceTile key={s.serviceType} service={s} onPress={() => pick(s)} />)}
            {hasMore ? (
              <Pressable onPress={() => setAllOpen(true)} style={styles.cell} accessibilityRole="button" accessibilityLabel={`See all ${nursing.length} services`}>
                <EmbossTile size={66} radius={20}><LayoutGrid size={26} color={C.inkSoft} /></EmbossTile>
                <Text style={styles.tileText}>See all</Text>
              </Pressable>
            ) : null}
          </View>
        )}

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

      {/* Search dropdown: over the page, closes on a tap outside or a choice */}
      {searchOpen && q ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSearch} accessibilityLabel="Close search" />
          <View style={[styles.dropdown, { top: dropTop }]} accessibilityRole="menu">
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
              {suggestions.map((s) => (
                <Pressable key={s.serviceType} style={({ pressed }) => [styles.dropRow, pressed && { backgroundColor: C.brandSoft }]} accessibilityRole="menuitem"
                  onPress={() => { closeSearch(); setQuery(''); pick(s); }}>
                  <IconTile icon={serviceIcon(s.serviceType)} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropTitle} numberOfLines={1}>{s.displayName || s.name}</Text>
                    {s.shortDescription ? <Text style={ui.muted} numberOfLines={1}>{s.shortDescription}</Text> : null}
                  </View>
                  {s.pricingPreview ? <Text style={styles.dropPrice}>{money(s.pricingPreview.regular.totalAmount)}</Text> : null}
                </Pressable>
              ))}
              {!suggestions.length ? <Text style={[ui.muted, { padding: 14 }]}>No service matches “{query.trim()}”.</Text> : null}
              <Pressable style={({ pressed }) => [styles.dropRow, styles.dropLink, pressed && { backgroundColor: C.brandSoft }]} accessibilityRole="menuitem"
                onPress={() => { closeSearch(); router.push('/pharmacy'); }}>
                <IconTile icon={Pill} size={36} />
                <Text style={[styles.dropTitle, { flex: 1 }]}>{wantsMedicine ? 'Search medicines in Pharmacy' : 'Medicines'}</Text>
                <ChevronRight size={16} color={C.muted} />
              </Pressable>
              <Pressable style={({ pressed }) => [styles.dropRow, pressed && { backgroundColor: C.brandSoft }]} accessibilityRole="menuitem"
                onPress={() => { closeSearch(); router.push('/labs'); }}>
                <IconTile icon={FlaskConical} size={36} />
                <Text style={[styles.dropTitle, { flex: 1 }]}>Lab tests</Text>
                <ChevronRight size={16} color={C.muted} />
              </Pressable>
            </ScrollView>
          </View>
        </>
      ) : null}

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
      <EmbossTile size={66} radius={20}><Icon size={28} color={C.brand} strokeWidth={1.9} /></EmbossTile>
      <Text style={styles.tileText} numberOfLines={2}>{shortName(service)}</Text>
    </Pressable>
  );
}

/** The four big "What do you need?" tiles: embossed icon, label, optional badge. */
function NeedTile({ icon: Icon, label, badge, tone = 'brand', onPress }: { icon: LucideIcon; label: string; badge?: string; tone?: 'brand' | 'green' | 'coral' | 'ink'; onPress: () => void }) {
  const look = { brand: { fg: C.brand, tint: C.brandSoft }, green: { fg: C.mint, tint: C.mintSoft }, coral: { fg: C.coralInk, tint: C.coralSoft }, ink: { fg: C.ink, tint: C.cardAlt } }[tone];
  return (
    <PressScale onPress={onPress} style={styles.need} accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge}` : label}>
      <EmbossTile size={72} radius={22} tint={look.tint}><Icon size={30} color={look.fg} strokeWidth={1.8} /></EmbossTile>
      {badge ? <View style={styles.needBadge}><Gloss radius={999} strength={0.8} /><Text style={styles.needBadgeText}>{badge}</Text></View> : null}
      <Text style={styles.needText} numberOfLines={2}>{label}</Text>
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
  mapBtn: { width: 50, height: 50, borderRadius: 16, backgroundColor: C.headerGlass, borderWidth: 1, borderColor: C.headerGlassBorder, alignItems: 'center', justifyContent: 'center' },
  etaLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  etaLabel: { fontFamily: F.bold, fontSize: 11.5, letterSpacing: 1, color: C.onHeaderMuted },
  eta: { fontFamily: F.displayHeavy, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: C.onHeader, marginTop: 2 },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  whereText: { flexShrink: 1, fontFamily: F.semi, fontSize: 14, color: C.onHeader },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: C.headerGlass, borderWidth: 1, borderColor: C.headerGlassBorder },
  chipOn: { backgroundColor: '#ffffff', borderColor: '#ffffff', boxShadow: '0 6px 12px -6px rgba(0,0,0,0.35)' },
  chipText: { fontFamily: F.bold, fontSize: 13, color: C.onHeader },
  chipTextOn: { color: C.brand },
  needRow: { flexDirection: 'row', justifyContent: 'space-between' },
  need: { width: '24%', alignItems: 'center', gap: 8 },
  needBadge: { position: 'absolute', top: -8, right: -2, backgroundColor: C.coral, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, ...depth.button },
  needBadgeText: { fontFamily: F.heavy, fontSize: 10, color: C.ink },
  needText: { fontFamily: F.bold, fontSize: 12.5, lineHeight: 16, color: C.ink, textAlign: 'center' },
  prod: { width: 132, backgroundColor: C.card, borderRadius: R.lg, padding: 8, ...depth.card },
  prodImg: { height: 84, borderRadius: R.md, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center', boxShadow: `inset 0 -6px 12px rgba(${C.tint},0.06)` },
  prodOff: { position: 'absolute', top: 0, left: 0, backgroundColor: C.mint, color: '#ffffff', fontFamily: F.heavy, fontSize: 10, paddingHorizontal: 6, paddingVertical: 3, borderTopLeftRadius: R.md, borderBottomRightRadius: 8, overflow: 'hidden' },
  prodName: { fontFamily: F.bold, fontSize: 13, lineHeight: 17, color: C.ink, marginTop: 8, minHeight: 34 },
  prodPack: { fontFamily: F.medium, fontSize: 11.5, color: C.muted, marginTop: 2 },
  prodRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 },
  prodPrice: { fontFamily: F.heavy, fontSize: 14, color: C.ink },
  prodMrp: { fontFamily: F.medium, fontSize: 11, color: C.muted, textDecorationLine: 'line-through' },
  addBtn: { borderWidth: 1.5, borderColor: C.brand, backgroundColor: C.card, borderRadius: R.sm, minHeight: 34, minWidth: 58, alignItems: 'center', justifyContent: 'center', boxShadow: `inset 0 -2px 0 rgba(${C.tint},0.12), 0 4px 10px -6px rgba(${C.tint},0.5)` },
  addText: { fontFamily: F.heavy, fontSize: 13, letterSpacing: 0.6, color: C.brand },
  demoPill: { backgroundColor: C.amberSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  demoPillText: { color: C.amber, fontFamily: F.heavy, fontSize: 10, letterSpacing: 1 },
  exitDemo: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: C.headerGlass, borderWidth: 1, borderColor: C.headerGlassBorder },
  exitDemoText: { color: C.onHeader, fontFamily: F.bold, fontSize: 11 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 14, marginTop: 14, minHeight: 50, ...depth.raised },
  searchInput: { flex: 1, paddingVertical: 12, fontFamily: F.medium, fontSize: 15, color: C.ink },
  dropdown: { position: 'absolute', left: 18, right: 18, backgroundColor: C.card, borderRadius: 16, paddingVertical: 6, overflow: 'hidden', ...depth.raised },
  dropRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9 },
  dropLink: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, marginTop: 4 },
  dropTitle: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  dropPrice: { fontFamily: F.bold, fontSize: 13, color: C.brand },
  easyOffer: { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 4, marginTop: 14, borderWidth: 1.5, borderColor: C.brandSoft },
  outside: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.amberSoft, borderRadius: 16, padding: 14, marginTop: 14 },
  upcoming: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.night, borderRadius: 16, padding: 14, marginTop: 14 },
  upLabel: { color: C.gold, fontFamily: F.heavy, fontSize: 10, letterSpacing: 1 },
  upTitle: { color: C.onNight, fontFamily: F.bold, fontSize: 15, marginTop: 2 },
  upSub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 12 },
  upBtn: { backgroundColor: C.brand, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, ...depth.button },
  upBtnText: { color: C.onBrand, fontFamily: F.heavy, fontSize: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 22, marginBottom: 6 },
  sectionTitle: { flexShrink: 1, fontFamily: F.display, fontSize: 20, color: C.ink, letterSpacing: -0.3 },
  sectionLink: { fontFamily: F.bold, fontSize: 14, color: C.brand },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '25%', alignItems: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 4, minHeight: 112 },
  tileText: { fontSize: 12.5, lineHeight: 16, fontFamily: F.semi, color: C.ink, textAlign: 'center' },
  when: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 14, minHeight: 72, borderWidth: 1.5, borderColor: C.border },
  whenIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  sheetGroup: { fontFamily: F.bold, fontSize: 14, color: C.inkSoft, marginTop: 6 },
  banner: { width: 280, borderRadius: 16, padding: 16, gap: 6, minHeight: 150 },
  bannerTitle: { fontFamily: F.display, fontSize: 24, lineHeight: 27, marginTop: 4 },
  bannerSub: { fontFamily: F.medium, fontSize: 12, lineHeight: 17 },
  bannerCta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 'auto' },
  bannerCtaText: { fontFamily: F.heavy, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 12, ...depth.card }
});
