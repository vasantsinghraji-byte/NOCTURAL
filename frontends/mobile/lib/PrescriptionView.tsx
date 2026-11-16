import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { router } from 'expo-router';
import { Eye, FileText, Maximize2, X } from 'lucide-react-native';
import type { PrescriptionLink } from '@medrush/shared';
import { Text } from '@/lib/T';
import { api, describeNetworkError, getAuthToken } from './api';
import { appAlert } from './dialog';
import { useSecureView } from './secureView';
import { C, F, R } from './theme';

type Source = { uri: string; headers?: Record<string, string> };

const FLAG_GRANT_READ_URI_PERMISSION = 1;

/**
 * Show a PDF in the phone's PDF viewer. Android: a browser tab can't render a
 * local file (it shows a blank page), so the file is handed to the viewer app
 * with a content:// link and read-only permission. iOS: the in-app browser shows PDFs.
 * Resolves when the viewer is closed (Android) so a temporary copy can be deleted.
 */
async function showPdfFile(fileUri: string): Promise<void> {
  if (Platform.OS !== 'android') {
    await WebBrowser.openBrowserAsync(fileUri);
    return;
  }
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri, type: 'application/pdf', flags: FLAG_GRANT_READ_URI_PERMISSION
  });
}

/** A PDF couldn't be shown: say why and offer to try again. */
function pdfProblem(err: unknown, retry: () => void) {
  const msg = err instanceof Error ? err.message : String(err);
  const noViewer = /No Activity found|ActivityNotFound|no app/i.test(msg);
  appAlert(
    noViewer ? 'No PDF viewer on this phone' : 'Couldn’t open the PDF',
    noViewer
      ? 'Install a PDF viewer (for example Google Drive or Adobe Acrobat) and tap Try again. A photo of the prescription works too.'
      : `${describeNetworkError(err)}\n\nCheck your connection and try again.`,
    [{ text: 'Try again', onPress: retry }, { text: 'OK', style: 'cancel' }]
  );
}

/**
 * One prescription, the same way everywhere: a photo you can tap to read full
 * screen, or a PDF tile that opens the phone's PDF viewer. `secure` blocks
 * screenshots while it is on screen (order and store views).
 */
function PrescriptionTile({ id, source, kind, name, height, onOpenPdf, secure, opening, onZoom }: {
  id: string; source: Source; kind: 'image' | 'pdf'; name?: string; height: number; onOpenPdf: () => void; secure: boolean; opening?: boolean;
  /** Open the zoomed photo as a full screen (covered by the screenshot block) instead of a pop-up. */
  onZoom?: () => void;
}) {
  const [full, setFull] = useState(false);
  useSecureView(`rx-${id}`, secure);
  if (kind === 'pdf') {
    return (
      <Pressable style={styles.pdf} onPress={onOpenPdf} disabled={opening} accessibilityRole="button" accessibilityLabel="Open prescription PDF">
        <FileText size={26} color={C.brand} />
        <View style={{ flex: 1 }}>
          <Text style={styles.pdfTitle}>Prescription (PDF)</Text>
          <Text style={styles.meta} numberOfLines={1}>{name || 'Opens in your PDF viewer'}</Text>
        </View>
        {opening ? <ActivityIndicator color={C.brand} /> : <Text style={styles.link}>Open</Text>}
      </Pressable>
    );
  }
  return (
    <>
      <Pressable onPress={() => (onZoom ? onZoom() : setFull(true))} accessibilityRole="imagebutton" accessibilityLabel="Prescription photo. Tap to see it full screen">
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

/**
 * The file the customer just picked, before the order is placed. It is their own
 * file in the cart sheet, so no screenshot block (it would only black out the screen behind the sheet).
 */
export function LocalPrescription({ uri, kind, name, height = 160 }: { uri: string; kind: 'image' | 'pdf'; name?: string; height?: number }) {
  const open = () => { showPdfFile(uri).catch((e) => pdfProblem(e, open)); };
  return <PrescriptionTile id={`local-${uri}`} source={{ uri }} kind={kind} name={name} height={height} onOpenPdf={open} secure={false} />;
}

/**
 * An order's prescription (customer or the order's store). Hidden behind
 * "View prescription" so the rest of the screen stays usable and capturable;
 * screenshots are blocked only while it is shown.
 */
export function OrderPrescription({ orderId, as, height = 220, startOpen = false }: { orderId: string; as: 'patient' | 'vendor'; height?: number; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  if (!open) {
    return (
      <Pressable style={styles.reveal} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="View prescription">
        <Eye size={18} color={C.brand} />
        <Text style={[styles.link, { flex: 1 }]}>View prescription</Text>
        <Text style={styles.meta}>Private</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <LoadedPrescription orderId={orderId} as={as} height={height} />
      <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
        <Text style={styles.link}>Hide prescription</Text>
      </Pressable>
    </View>
  );
}

function LoadedPrescription({ orderId, as, height }: { orderId: string; as: 'patient' | 'vendor'; height: number }) {
  const [link, setLink] = useState<PrescriptionLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

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
    setOpening(true);
    // A private copy in the app's cache, removed as soon as the viewer closes.
    const file = `${FileSystem.cacheDirectory}rx-${as}-${orderId}.pdf`;
    try {
      const fresh = link.needsAuth ? link : await api.prescriptionFile(orderId, as); // links last a few minutes
      await FileSystem.deleteAsync(file, { idempotent: true });
      const res = await FileSystem.downloadAsync(fresh.url, file, fresh.needsAuth && token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      if (res.status !== 200) throw new Error(`The file could not be downloaded (HTTP ${res.status})`);
      setOpening(false);
      await showPdfFile(res.uri);
    } catch (e) {
      setOpening(false);
      pdfProblem(e, openPdf);
    } finally {
      FileSystem.deleteAsync(file, { idempotent: true }).catch(() => undefined);
    }
  };
  // Pop-up windows aren't covered by the screenshot block, so the zoomed photo is a full screen.
  const zoom = () => router.push({ pathname: '/rx/[id]', params: { id: orderId, as } });
  return <PrescriptionTile id={`${as}-${orderId}`} source={source} kind={link.kind} height={height} onOpenPdf={openPdf} secure opening={opening} onZoom={zoom} />;
}

const styles = StyleSheet.create({
  image: { width: '100%', borderRadius: R.md, backgroundColor: C.cardAlt },
  zoom: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  zoomText: { color: C.onBrand, fontFamily: F.semi, fontSize: 11 },
  pdf: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.md, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  reveal: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 48, borderRadius: R.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  pdfTitle: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  meta: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  link: { fontFamily: F.bold, fontSize: 14, color: C.brand },
  fullBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '85%' },
  close: { position: 'absolute', top: 48, right: 20, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' }
});
