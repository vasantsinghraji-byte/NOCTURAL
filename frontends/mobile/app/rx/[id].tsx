import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import type { PrescriptionLink } from '@medrush/shared';
import { Text } from '@/lib/T';
import { api, describeNetworkError, getAuthToken } from '@/lib/api';
import { useSecureView } from '@/lib/secureView';
import { C, F } from '@/lib/theme';

/**
 * An order's prescription photo, full screen. This is a screen in the app's own
 * window (not a pop-up), so the screenshot block covers it. Customer: as=patient;
 * the order's store: as=vendor (the server checks who may see it).
 */
export default function PrescriptionFullScreen() {
  const { id, as } = useLocalSearchParams<{ id: string; as?: string }>();
  const who: 'patient' | 'vendor' = as === 'vendor' ? 'vendor' : 'patient';
  const insets = useSafeAreaInsets();
  const [link, setLink] = useState<PrescriptionLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  useSecureView('rx-fullscreen');

  const load = useCallback(async () => {
    setError(null);
    try { setLink(await api.prescriptionFile(String(id), who)); } catch (e) { setError(describeNetworkError(e)); }
  }, [id, who]);
  useEffect(() => { load(); }, [load]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const token = getAuthToken();

  return (
    <View style={styles.bg}>
      {error ? (
        <Pressable style={styles.center} onPress={load} accessibilityRole="button">
          <Text style={styles.msg}>Couldn’t load the prescription. {error}</Text>
          <Text style={styles.retry}>Tap to try again</Text>
        </Pressable>
      ) : !link ? (
        <View style={styles.center}><ActivityIndicator color="#ffffff" /></View>
      ) : (
        <Image
          source={{ uri: link.url, headers: link.needsAuth && token ? { Authorization: `Bearer ${token}` } : undefined }}
          style={styles.image} resizeMode="contain" accessibilityLabel="Prescription photo"
        />
      )}
      <Pressable style={[styles.close, { top: insets.top + 12 }]} onPress={close} accessibilityRole="button" accessibilityLabel="Close">
        <X size={22} color="#ffffff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  msg: { color: '#ffffff', fontFamily: F.semi, fontSize: 14, textAlign: 'center' },
  retry: { color: C.brandSoft, fontFamily: F.bold, fontSize: 14 },
  image: { width: '100%', height: '85%' },
  close: { position: 'absolute', right: 20, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' }
});
