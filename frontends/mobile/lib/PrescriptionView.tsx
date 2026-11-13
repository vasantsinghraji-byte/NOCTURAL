import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { FileText, Maximize2, X } from 'lucide-react-native';
import type { PrescriptionLink } from '@medrush/shared';
import { Text } from '@/lib/T';
import { api, describeNetworkError, getAuthToken } from './api';
import { appAlert } from './dialog';
import { useSecureView } from './secureView';
import { C, F, R } from './theme';

type Source = { uri: string; headers?: Record<string, string> };

/**
 * One prescription, the same way everywhere: a photo you can tap to read full
 * screen, or a PDF tile that opens the file. No screenshots while it's visible.
 */
function PrescriptionTile({ id, source, kind, name, height, onOpenPdf }: {
  id: string; source: Source; kind: 'image' | 'pdf'; name?: string; height: number; onOpenPdf: () => void;
}) {
  const [full, setFull] = useState(false);
  useSecureView(`rx-${id}`);
  if (kind === 'pdf') {
    return (
      <Pressable style={styles.pdf} onPress={onOpenPdf} accessibilityRole="button" accessibilityLabel="Open prescription PDF">
        <FileText size={26} color={C.brand} />
        <View style={{ flex: 1 }}>
          <Text style={styles.pdfTitle}>Prescription (PDF)</Text>
          {name ? <Text style={styles.meta} numberOfLines={1}>{name}</Text> : null}
        </View>
        <Text style={styles.link}>Open</Text>
      </Pressable>
    );
  }
  return (
    <>
      <Pressable onPress={() => setFull(true)} accessibilityRole="imagebutton" accessibilityLabel="Prescription photo. Tap to see it full screen">
        <Image source={source} style={[styles.image, { height }]} resizeMode="contain" />
        <View style={styles.zoom}><Maximize2 size={14} color={C.onBrand} /><Text style={styles.zoomText}>Tap to zoom</Text></View>
      </Pressable>
      <Modal visible={full} transparent animationType="fade" onRequestClose={() => setFull(false)}>
        <View style={styles.fullBg}>
          <Image source={source} style={styles.fullImage} resizeMode="contain" accessibilityLabel="Prescription photo" />
          <Pressable style={styles.close} onPress={() => setFull(false)} accessibilityRole="button" accessibilityLabel="Close">
            <X size={22} color="#ffffff" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/** The file the customer just picked, before the order is placed. */
export function LocalPrescription({ uri, kind, name, height = 160 }: { uri: string; kind: 'image' | 'pdf'; name?: string; height?: number }) {
  const openPdf = () => WebBrowser.openBrowserAsync(uri).catch(() => appAlert('Attached', 'Your PDF is attached. The pharmacist will read it.'));
  return <PrescriptionTile id={`local-${uri}`} source={{ uri }} kind={kind} name={name} height={height} onOpenPdf={openPdf} />;
}

/** An order's prescription, fetched as a short-lived link (customer or the order's store). */
export function OrderPrescription({ orderId, as, height = 220 }: { orderId: string; as: 'patient' | 'vendor'; height?: number }) {
  const [link, setLink] = useState<PrescriptionLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setLink(await api.prescriptionFile(orderId, as)); } catch (e) { setError(describeNetworkError(e)); }
  }, [orderId, as]);
  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <Pressable style={styles.pdf} onPress={load} accessibilityRole="button">
        <Text style={[styles.meta, { flex: 1 }]}>Couldn’t load the prescription. {error}</Text>
        <Text style={styles.link}>Retry</Text>
      </Pressable>
    );
  }
  if (!link) return <View style={[styles.image, { height, alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={C.brand} /></View>;

  const token = getAuthToken();
  const source: Source = { uri: link.url, headers: link.needsAuth && token ? { Authorization: `Bearer ${token}` } : undefined };
  const openPdf = async () => {
    if (link.needsAuth) { appAlert('Open on the website', 'This server keeps files locally; open the order on the website to read the PDF.'); return; }
    // Links last a few minutes: get a fresh one each time.
    try {
      const fresh = await api.prescriptionFile(orderId, as);
      await WebBrowser.openBrowserAsync(fresh.url);
    } catch (e) { appAlert('Couldn’t open the PDF', describeNetworkError(e)); }
  };
  return <PrescriptionTile id={`${as}-${orderId}`} source={source} kind={link.kind} height={height} onOpenPdf={openPdf} />;
}

const styles = StyleSheet.create({
  image: { width: '100%', borderRadius: R.md, backgroundColor: C.cardAlt },
  zoom: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  zoomText: { color: C.onBrand, fontFamily: F.semi, fontSize: 11 },
  pdf: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.md, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  pdfTitle: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  meta: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  link: { fontFamily: F.bold, fontSize: 14, color: C.brand },
  fullBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '85%' },
  close: { position: 'absolute', top: 48, right: 20, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' }
});
