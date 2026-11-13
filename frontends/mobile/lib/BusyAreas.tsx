import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/lib/T';
import { useFocusEffect } from 'expo-router';
import { Flame, Navigation } from 'lucide-react-native';
import type { BusyArea } from '@medrush/shared';
import { api } from '@/lib/api';
import { C, F, clay } from '@/lib/theme';

// One hue, light to dark: how short of people the area is (matches the admin heat map).
const HEAT = ['#eef0f3', '#fbdde2', '#f19aa8', '#dc4c63', '#a50d26'];
const HEAT_LABEL = ['', 'A little busy', 'Busy', 'Very busy', 'Busiest'];

function goTo(lat: number, lng: number) {
  const url = Platform.OS === 'android' ? `google.navigation:q=${lat},${lng}` : `http://maps.apple.com/?daddr=${lat},${lng}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`));
}

/**
 * "Busy near you": areas within a short ride where orders (riders) or home
 * visits (nurses) are coming in and few partners are online. Only shown while
 * online; refreshes every minute. Moving there is the partner's choice.
 */
export default function BusyAreas({ kind, online }: { kind: 'rider' | 'staff'; online: boolean }) {
  const [areas, setAreas] = useState<BusyArea[] | null>(null);
  const load = useCallback(() => {
    if (!online) { setAreas(null); return; }
    (kind === 'rider' ? api.riderBusyAreas() : api.staffBusyAreas()).then((r) => setAreas(r.areas)).catch(() => setAreas([]));
  }, [kind, online]);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]));

  if (!online || !areas || !areas.length) return null;
  const what = kind === 'rider' ? 'orders' : 'visit requests';
  return (
    <View style={s.card} accessibilityRole="summary">
      <View style={s.head}>
        <Flame size={18} color={C.brand} />
        <Text style={s.title}>Busy near you</Text>
      </View>
      <Text style={s.sub}>More {what} than partners here right now. Waiting nearby gets you the next one sooner.</Text>
      {areas.map((a) => (
        <Pressable
          key={`${a.lat},${a.lng}`}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
          onPress={() => goTo(a.lat, a.lng)}
          accessibilityRole="button"
          accessibilityLabel={`${HEAT_LABEL[a.heat]}, ${a.distanceKm} kilometres, about ${a.rideMinutes} minutes. Navigate.`}
        >
          <View style={[s.swatch, { backgroundColor: HEAT[a.heat] }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{HEAT_LABEL[a.heat]} · {a.demand} {a.demand === 1 ? (kind === 'rider' ? 'order' : 'visit request') : what}</Text>
            <Text style={s.rowSub}>{a.distanceKm} km · about {a.rideMinutes} min away</Text>
          </View>
          <Navigation size={18} color={C.brand} />
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, gap: 10, ...clay },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: F.display, fontSize: 18, color: C.ink },
  sub: { fontFamily: F.medium, fontSize: 13, color: C.muted, marginTop: -4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.cardAlt, borderRadius: 14, padding: 12, minHeight: 48 },
  swatch: { width: 14, height: 36, borderRadius: 4 },
  rowTitle: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  rowSub: { fontFamily: F.medium, fontSize: 12, color: C.muted }
});
