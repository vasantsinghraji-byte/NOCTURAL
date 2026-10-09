import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import type { MapShop, PharmacyVendor, ShopKind } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { LiveMap, PIN_LOOK, pinKindForRole, type MapPin, type PinKind } from '@/lib/MapView';
import { DEMO_POINT } from '@/lib/care';
import { C, F, IS_DARK, shadow } from '@/lib/theme';

const SHOP_PIN: Record<ShopKind, PinKind> = { PHYSIO: 'physio', LAB: 'lab', HOMECARE: 'caregiver', NURSING: 'nurse' };

/**
 * Full-screen "near you" map, opened from Home: every service has its own pin
 * (nurse, physio, caregiver, lab, pharmacy), professionals online pulse, and
 * sponsored pins (admin-controlled) are labelled "Ad".
 */
export default function NearbyMap() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; area?: string }>();
  const point = useMemo(() => {
    const lat = Number(params.lat); const lng = Number(params.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : DEMO_POINT;
  }, [params.lat, params.lng]);
  const [stores, setStores] = useState<PharmacyVendor[]>([]);
  const [shops, setShops] = useState<{ shops: MapShop[]; sponsored: Array<MapShop & { token: string; store: string }> }>({ shops: [], sponsored: [] });
  const [staff, setStaff] = useState<Array<{ role?: string; lat: number; lng: number }>>([]);

  useEffect(() => {
    api.getNearbyVendors({ ...point, radiusKm: 10 }).then((r) => setStores(r.vendors)).catch(() => undefined);
    api.marketMap({ ...point, radiusKm: 8 }).then((r) => setShops({ shops: r.shops, sponsored: r.sponsored })).catch(() => undefined);
    const loadStaff = () => api.getNearbyStaff({ ...point, radiusKm: 10 }).then((r) => setStaff(r.staff)).catch(() => undefined);
    loadStaff();
    const t = setInterval(loadStaff, 20_000);
    return () => clearInterval(t);
  }, [point]);

  const pins = useMemo<MapPin[]>(() => [
    ...stores.map((s) => ({ id: `store:${s._id}`, kind: 'pharmacy' as const, label: s.name, lat: s.location?.coordinates?.[1] ?? 0, lng: s.location?.coordinates?.[0] ?? 0 })),
    ...shops.shops.map((sh) => ({ id: `shop:${sh._id}`, kind: SHOP_PIN[sh.kind], label: sh.name, lat: sh.lat, lng: sh.lng })),
    ...shops.sponsored.map((sh) => ({ id: `ad:${sh.store}`, kind: SHOP_PIN[sh.kind], label: `${sh.name} · Ad`, lat: sh.lat, lng: sh.lng, sponsored: true })),
    ...staff.map((s, i) => {
      const kind = pinKindForRole(s.role);
      return { id: `staff:${i}`, kind, live: true, label: `${PIN_LOOK[kind === 'store' ? 'pharmacy' : kind].label} online nearby`, lat: s.lat, lng: s.lng };
    })
  ], [stores, shops, staff]);

  // What's on the map, with counts, as the legend.
  const legend = useMemo(() => {
    const counts = new Map<keyof typeof PIN_LOOK, number>();
    for (const p of pins) {
      const k = (p.kind === 'store' ? 'pharmacy' : p.kind) as keyof typeof PIN_LOOK;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [...counts.entries()];
  }, [pins]);

  const onPin = (pin: MapPin) => {
    const [type, ref] = pin.id.split(':');
    if (type === 'ad') {
      const ad = shops.sponsored.find((a) => String(a.store) === ref);
      if (ad) api.adClick(ad.token).catch(() => undefined);
      router.push(`/care/shop/${ref}`);
    } else if (type === 'shop') {
      if (pin.kind === 'lab') router.push('/labs'); else router.push(`/care/shop/${ref}`);
    } else if (type === 'store') {
      router.push('/pharmacy');
    } else {
      appAlert(pin.label, 'Exact positions are hidden for their safety. Book a visit and we send the nearest free professional.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LiveMap center={point} pins={pins} dark={IS_DARK} onPinPress={onPin} />
      <View style={[s.top, { top: insets.top + 10 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
          <ArrowLeft size={22} color={C.ink} />
        </Pressable>
        <View style={s.where}>
          <Text style={s.whereLabel}>Near you</Text>
          <Text style={s.whereText} numberOfLines={1}>{params.area || 'Your location'}</Text>
        </View>
      </View>
      {legend.length > 0 ? (
        <View style={[s.legend, { bottom: insets.bottom + 18 }]} accessibilityLabel={`On the map: ${legend.map(([k, n]) => `${n} ${PIN_LOOK[k].label}`).join(', ')}`}>
          {legend.map(([k, n]) => (
            <View key={k} style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: PIN_LOOK[k].color }]} />
              <Text style={s.legendText}>{n} {PIN_LOOK[k].label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  where: { flex: 1, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, ...shadow },
  whereLabel: { fontFamily: F.semi, fontSize: 12, color: C.muted },
  whereText: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  legend: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, ...shadow },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: F.bold, fontSize: 13, color: C.ink }
});
