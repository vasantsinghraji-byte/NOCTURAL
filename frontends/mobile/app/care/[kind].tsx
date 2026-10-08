import { useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, Building2, Clock, Home, MapPin, ShieldCheck, Star, Tag } from 'lucide-react-native';
import type { CareMode, MarketService, ShopCard as Shop } from '@medrush/shared';
import { api } from '@/lib/api';
import { KINDS, inr, problem, useMe, useVisitPlace, type CareKind } from '@/lib/market';
import { Badge, Chip, Chips, Empty, Meta, MkHero, Note, PlaceCard, Screen, Seg, TopBar, mk } from '@/lib/marketUI';
import { PressScale, Rise, Skeleton } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

const SORTS = [['recommended', 'Recommended'], ['price', 'Price'], ['distance', 'Nearest'], ['rating', 'Rating']] as const;
type Sort = typeof SORTS[number][0];

/** Shops for one kind (physio, home care, nursing), Zomato-style: each with its own price. */
export default function KindBrowser() {
  const params = useLocalSearchParams<{ kind: string; service?: string }>();
  const kind = (['PHYSIO', 'HOMECARE', 'NURSING'].includes(String(params.kind)) ? params.kind : 'PHYSIO') as CareKind;
  const meta = KINDS[kind];
  const homeOnly = kind === 'HOMECARE';
  const { me, signedIn } = useMe();
  const { place, setPlace, useMyLocation, locating } = useVisitPlace(me?.savedAddresses);

  const [serviceId, setServiceId] = useState(params.service || '');
  const [mode, setMode] = useState<CareMode>('HOME');
  const [sort, setSort] = useState<Sort>('recommended');
  const [gender, setGender] = useState<'' | 'FEMALE' | 'MALE'>('');
  const [services, setServices] = useState<MarketService[] | null>(null);
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { api.marketServices(kind).then((r) => setServices(r.services)).catch((e) => setError(problem(e).message)); }, [kind]);
  useEffect(() => {
    if (mode === 'HOME' && !place.coords) { setShops([]); return; }
    let live = true;
    setShops(null);
    setError('');
    api.marketStores({ kind, serviceId: serviceId || undefined, mode, sort, gender: gender || undefined, lat: place.coords?.lat, lng: place.coords?.lng })
      .then((r) => { if (live) setShops(r.stores); })
      .catch((e) => { if (live) { setError(problem(e).message); setShops([]); } });
    return () => { live = false; };
  }, [kind, serviceId, mode, sort, gender, place.coords]);

  const chosen = useMemo(() => services?.find((x) => x._id === serviceId), [services, serviceId]);
  const effectiveMode: CareMode = homeOnly ? 'HOME' : mode;

  return (
    <Screen header={<TopBar title={meta.label} />}>
      <Rise>
        <MkHero title={meta.label} subtitle={chosen?.fromPrice != null ? `${chosen.displayName}: from ${inr(chosen.fromPrice)} per ${meta.unit}` : meta.pitch} art={meta.art} />
      </Rise>

      <Chips>
        <Chip label="All" on={!serviceId} onPress={() => setServiceId('')} />
        {(services || []).map((sv) => <Chip key={sv._id} label={sv.displayName} on={serviceId === sv._id} onPress={() => setServiceId(sv._id)} />)}
      </Chips>
      {chosen?.shortDescription ? <Meta>{chosen.shortDescription}</Meta> : null}

      {!homeOnly
        ? <Seg value={mode} onChange={setMode} options={[{ value: 'HOME', label: 'At Home', icon: Home }, { value: 'CLINIC', label: 'At Clinic', icon: Building2 }]} />
        : <Badge tone="red" icon={Home} label="At your home" />}
      <Chips>
        {SORTS.map(([v, label]) => <Chip key={v} label={label} on={sort === v} onPress={() => setSort(v)} />)}
        <Chip label="Female" on={gender === 'FEMALE'} onPress={() => setGender(gender === 'FEMALE' ? '' : 'FEMALE')} />
        <Chip label="Male" on={gender === 'MALE'} onPress={() => setGender(gender === 'MALE' ? '' : 'MALE')} />
      </Chips>

      <PlaceCard saved={me?.savedAddresses || []} place={place} onChange={setPlace} onLocate={useMyLocation} locating={locating} signedIn={signedIn} />

      {error ? <Note>{error}</Note> : null}
      {!shops && [0, 1, 2].map((i) => <Skeleton key={i} height={150} radius={24} />)}
      {shops && shops.length === 0 && !error && (
        <Empty
          title={effectiveMode === 'HOME' && !place.coords ? 'Choose the visit address first' : `No ${meta.plural} here yet`}
          text={effectiveMode === 'HOME' && !place.coords ? 'We use it to show who can come to you and the travel fee.' : 'Try another service, the clinic option, or a different address.'}
        />
      )}
      {shops?.map((shop, i) => (
        <Rise key={`${shop._id}${shop.sponsored ? '-ad' : ''}`} delay={Math.min(i, 6) * 50}>
          <ShopRow shop={shop} mode={effectiveMode} serviceId={serviceId} unit={meta.unit} />
        </Rise>
      ))}
    </Screen>
  );
}

function ShopRow({ shop, mode, serviceId, unit }: { shop: Shop; mode: CareMode; serviceId: string; unit: string }) {
  const open = () => {
    if (shop.sponsored && shop.token) api.adClick(shop.token).catch(() => undefined);
    router.push({ pathname: '/care/shop/[id]', params: { id: shop._id, mode, ...(serviceId ? { service: serviceId } : {}) } });
  };
  const initials = shop.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <PressScale onPress={open} style={[ui.card, { gap: 12 }]} accessibilityRole="button" accessibilityLabel={`${shop.name}${shop.price != null ? `, ${inr(shop.price)}` : ''}`}>
      <View style={mk.row}>
        {shop.photos?.[0]
          ? <Image source={{ uri: shop.photos[0] }} style={{ width: 56, height: 56, borderRadius: 18 }} accessibilityIgnoresInvertColors />
          : <View style={[mk.tile, { width: 56, height: 56, borderRadius: 18, backgroundColor: C.night }]}><Text style={{ color: '#ffffff', fontFamily: F.display, fontSize: 18 }}>{initials}</Text></View>}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontFamily: F.display, fontSize: 17, color: C.ink }} numberOfLines={1}>{shop.name}</Text>
          <Meta>{[shop.qualification, shop.experienceYears ? `${shop.experienceYears} yrs` : '', shop.languages?.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</Meta>
        </View>
        {shop.rating.count > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.mint, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
            <Text style={{ color: '#ffffff', fontFamily: F.heavy, fontSize: 12 }}>{shop.rating.avg.toFixed(1)}</Text>
            <Star size={11} color="#ffffff" fill="#ffffff" />
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {shop.sponsored ? <Badge tone="amber" label={shop.label || 'Sponsored'} /> : null}
        {shop.registered ? <Badge tone="green" icon={BadgeCheck} label="Verified" /> : null}
        {shop.reliable ? <Badge tone="green" icon={Clock} label="Reliable" /> : null}
        {shop.accredited ? <Badge tone="green" icon={ShieldCheck} label="NABL" /> : null}
        {Number.isFinite(shop.distanceKm) ? <Badge icon={MapPin} label={`${shop.distanceKm} km`} /> : null}
        {shop.item?.offer ? <Badge tone="red" icon={Tag} label={shop.item.offer.label} /> : null}
        {shop.isPaused ? <Badge tone="red" label="Not taking bookings today" /> : null}
      </View>
      <View style={[mk.row, { justifyContent: 'space-between' }]}>
        <View>
          {shop.price != null
            ? <Text style={mk.price}>{inr(shop.price)} <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.muted }}>per {unit}</Text></Text>
            : <Meta>See services and prices</Meta>}
          {mode === 'HOME' && shop.travel ? <Meta>+ travel {inr(shop.travel.fee)} ({shop.travel.roadKm} km)</Meta> : null}
          {mode === 'HOME' && shop.homeCovered === false ? <Meta style={{ color: C.brand }}>Outside their home-visit area</Meta> : null}
        </View>
        <View style={{ backgroundColor: C.brand, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ color: '#ffffff', fontFamily: F.heavy, fontSize: 13 }}>View</Text>
        </View>
      </View>
    </PressScale>
  );
}
