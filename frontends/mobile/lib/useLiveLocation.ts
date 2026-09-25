import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export type LatLng = { lat: number; lng: number };
export type LocationSource = 'live' | 'recent' | 'fallback';

const RECENT_MS = 2 * 60 * 1000; // a cached fix older than this may be another city
const FIX_TIMEOUT_MS = 10_000;
const REGEOCODE_AFTER_KM = 0.5;

const distanceKm = (a: LatLng, b: LatLng) => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

async function areaName(p: LatLng): Promise<string> {
  try {
    const [addr] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
    if (!addr) return 'Current location';
    return [addr.district || addr.subregion || addr.street || addr.name, addr.city].filter(Boolean).join(', ') || 'Current location';
  } catch {
    return 'Current location';
  }
}

/**
 * The device's live location (Uber-style): follows the phone while the screen is
 * mounted, refreshes the area name after real movement, and never trusts a
 * stale cached fix. Falls back to `fallback` until a real fix arrives.
 */
export function useLiveLocation(fallback: LatLng, fallbackLabel: string) {
  const [point, setPoint] = useState<LatLng | null>(null);
  const [area, setArea] = useState('Locating you…');
  const [source, setSource] = useState<LocationSource>('fallback');
  const [permission, setPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const geocodedAt = useRef<LatLng | null>(null);
  const gotFix = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let watcher: Location.LocationSubscription | null = null;

    const accept = (p: LatLng, from: LocationSource) => {
      if (cancelled) return;
      gotFix.current = true;
      setPoint(p);
      setSource(from);
      if (!geocodedAt.current || distanceKm(geocodedAt.current, p) >= REGEOCODE_AFTER_KM) {
        geocodedAt.current = p;
        areaName(p).then((name) => { if (!cancelled) setArea(name); });
      }
    };

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
      if (cancelled) return;
      setPermission(status === 'granted' ? 'granted' : 'denied');
      if (status !== 'granted') {
        setPoint(fallback);
        setArea(fallbackLabel);
        return;
      }

      // 1) A recent cached fix shows instantly (only if it's fresh).
      const recent = await Location.getLastKnownPositionAsync({ maxAge: RECENT_MS, requiredAccuracy: 500 }).catch(() => null);
      if (recent) accept({ lat: recent.coords.latitude, lng: recent.coords.longitude }, 'recent');

      // 2) Follow the device from here on.
      watcher = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 20 },
        (pos) => accept({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'live')
      ).catch(() => null);
      if (cancelled) { watcher?.remove(); return; }

      // 3) Ask for one fresh fix now; if nothing arrives in time, use the fallback
      //    (a later live fix still replaces it).
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .then((pos) => accept({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'live'))
        .catch(() => undefined);
      setTimeout(() => {
        if (!cancelled && !gotFix.current) {
          setPoint(fallback);
          setArea(fallbackLabel);
          setSource('fallback');
        }
      }, FIX_TIMEOUT_MS);
    })();

    return () => { cancelled = true; watcher?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { point, area, source, permission };
}
