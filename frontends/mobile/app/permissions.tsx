import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { APP_PERMISSIONS, type PermissionStatus } from '@/lib/permissions';
import { C, F } from '@/lib/theme';

const LABEL: Record<PermissionStatus, string> = { granted: 'Allowed', denied: 'Blocked', undetermined: 'Not asked yet' };

export default function Permissions() {
  const [status, setStatus] = useState<Record<string, PermissionStatus>>({});

  const refresh = useCallback(async () => {
    const entries = await Promise.all(APP_PERMISSIONS.map(async (p) => [p.key, await p.check()] as const));
    setStatus(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    refresh();
    // Coming back from system Settings → re-read.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  async function requestAll() {
    for (const p of APP_PERMISSIONS) {
      if ((await p.check()) !== 'granted') await p.request();
    }
    refresh();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Pressable style={styles.primary} onPress={requestAll}>
        <Text style={styles.primaryText}>Allow all permissions</Text>
      </Pressable>
      {APP_PERMISSIONS.map((p) => {
        const s = status[p.key] || 'undetermined';
        return (
          <View key={p.key} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{p.title}</Text>
              <Text style={styles.muted}>{p.why}</Text>
              <Text style={styles.state}>{LABEL[s]}</Text>
            </View>
            {s !== 'granted' && (
              <Pressable style={styles.btn} onPress={async () => {
                const next = await p.request();
                // Android stops showing the prompt after "Don't allow" twice → send to Settings.
                if (next !== 'granted') Linking.openSettings();
                refresh();
              }}>
                <Text style={styles.btnText}>{s === 'denied' ? 'Settings' : 'Allow'}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  primary: { backgroundColor: C.brand, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: C.onBrand, fontFamily: F.heavy },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border },
  title: { fontFamily: F.bold, color: C.ink, fontSize: 15 },
  muted: { color: C.muted, fontSize: 13, marginTop: 2, fontFamily: F.medium },
  state: { marginTop: 6, fontFamily: F.semi, color: C.ink },
  btn: { backgroundColor: C.brand, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  btnText: { color: C.onBrand, fontFamily: F.bold }
});
