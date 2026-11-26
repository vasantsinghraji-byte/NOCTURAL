import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { connection } from '@medrush/shared';
import { Text } from '@/lib/T';
import { api } from './api';
import { C, F, R } from './theme';

/**
 * A thin bar at the top while the app can't reach Nabz (no internet or the
 * server is down). It goes away by itself on the next request that gets through;
 * meanwhile it re-checks every 15 seconds, and "Retry" checks at once.
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(connection.isOnline());
  const [checking, setChecking] = useState(false);
  useEffect(() => connection.subscribe(setOnline), []);
  useEffect(() => connection.startRecheck(() => api.health()), []);
  if (online) return null;
  const retry = () => {
    setChecking(true);
    api.health().catch(() => undefined).finally(() => setChecking(false));
  };
  return (
    <View style={[s.bar, { paddingTop: insets.top + 6 }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <WifiOff size={16} color={C.amber} />
      <Text style={s.text} numberOfLines={2}>No connection to Nabz. What you see may be out of date.</Text>
      <Pressable onPress={retry} disabled={checking} hitSlop={8} style={s.btn} accessibilityRole="button" accessibilityLabel="Retry connection">
        <Text style={s.btnText}>{checking ? 'Checking…' : 'Retry'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingBottom: 8,
    backgroundColor: C.amberSoft, borderBottomWidth: 1, borderBottomColor: C.border
  },
  text: { flex: 1, color: C.ink, fontFamily: F.semi, fontSize: 13, lineHeight: 18 },
  btn: { paddingHorizontal: 12, minHeight: 32, justifyContent: 'center', borderRadius: R.full, borderWidth: 1, borderColor: C.amber },
  btnText: { color: C.amber, fontFamily: F.bold, fontSize: 13 }
});
