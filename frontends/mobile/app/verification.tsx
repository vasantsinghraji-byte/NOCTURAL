import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, Camera, CircleCheck, CircleDashed, Clock, ImageUp, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import type { VerificationItem, VerificationStatus } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { C, F, clay, ui } from '@/lib/theme';

/**
 * Partner documents (same as the website's /partner/verification): what this
 * partner needs, status of each, upload a photo, Aadhaar from DigiLocker.
 */

const STATE: Record<VerificationItem['state'], { label: string; fg: string; bg: string; icon: typeof CircleCheck }> = {
  VERIFIED: { label: 'Verified', fg: C.mint, bg: C.mintSoft, icon: CircleCheck },
  APPROVED: { label: 'Verified', fg: C.mint, bg: C.mintSoft, icon: CircleCheck },
  EXPIRING: { label: 'Expiring soon', fg: C.amber, bg: C.amberSoft, icon: TriangleAlert },
  PENDING: { label: 'In review', fg: C.sky, bg: C.skySoft, icon: Clock },
  REJECTED: { label: 'Upload again', fg: C.roseInk, bg: C.roseSoft, icon: TriangleAlert },
  EXPIRED: { label: 'Expired', fg: C.roseInk, bg: C.roseSoft, icon: TriangleAlert },
  MISSING: { label: 'Not added', fg: C.muted, bg: C.cardAlt, icon: CircleDashed }
};
const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function VerificationScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ digilocker?: string }>();
  const [data, setData] = useState<VerificationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<VerificationItem | null>(null);

  const load = useCallback(() => {
    api.getMyVerification().then((r) => { setData(r.verification); setError(null); }).catch((e) => setError(describeNetworkError(e)));
  }, []);
  useFocusEffect(load);
  useEffect(() => {
    if (params.digilocker === 'ok') appAlert('Aadhaar received', 'Your Aadhaar was shared from DigiLocker.');
    else if (params.digilocker) appAlert('DigiLocker didn’t finish', 'Try again, or upload a masked Aadhaar photo.');
  }, [params.digilocker]);

  async function digilocker() {
    try {
      const r = await api.startDigilocker('app');
      const res = await WebBrowser.openAuthSessionAsync(r.url, 'nabzpartner://verification');
      if (res.type === 'success') load();
    } catch (e) {
      appAlert('Could not open DigiLocker', describeNetworkError(e));
    }
  }

  const done = data ? data.items.filter((i) => i.state === 'VERIFIED' || i.state === 'EXPIRING').length : 0;
  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <View style={[styles.head, { paddingTop: insets.top + 10 }]}>
        <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={C.onNight} />
        </Pressable>
        <Text style={styles.title}>Your documents</Text>
        <Text style={styles.sub}>We check every partner before they work with patients. Most checks take a working day.</Text>
        {data && (
          <View style={{ marginTop: 12, gap: 6 }}>
            <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round((done / Math.max(1, data.items.length)) * 100)}%` }]} /></View>
            <Text style={styles.sub}>{data.complete ? 'All required documents verified' : `${done} of ${data.items.length} verified`}{data.inReview ? `, ${data.inReview} in review` : ''}</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {error && <Text style={ui.error}>{error}</Text>}
        {!data && !error && <ActivityIndicator color={C.brand} style={{ marginTop: 20 }} />}
        {data?.items.map((item) => {
          const s = STATE[item.state];
          const doc = item.valid || item.latest;
          const canUpload = !item.latest || item.latest.status !== 'PENDING' || item.state === 'EXPIRING';
          return (
            <View key={item.kind} style={[styles.card, { gap: 8 }]}>
              <View style={styles.row}>
                <Text style={[ui.h3, { flex: 1 }]}>{item.label}{item.optional ? ' (optional)' : ''}</Text>
                <View style={[styles.pill, { backgroundColor: s.bg }]}>
                  <s.icon size={12} color={s.fg} />
                  <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
                </View>
              </View>
              {item.hint && <Text style={ui.muted}>{item.hint}</Text>}
              {doc && (
                <View style={{ gap: 2 }}>
                  {doc.source === 'DIGILOCKER' && <Text style={ui.body}>From DigiLocker{doc.digilocker ? `, ${doc.digilocker.name}` : ''}</Text>}
                  {doc.number && <Text style={ui.body}>{item.kind === 'AADHAAR' ? `Aadhaar XXXX XXXX ${doc.number}` : `No. ${doc.number}`}</Text>}
                  {doc.expiresAt && <Text style={ui.body}>Valid until {fmt(doc.expiresAt)}</Text>}
                </View>
              )}
              {item.latest?.status === 'REJECTED' && item.latest.note && <Text style={ui.error}>Reason: {item.latest.note}</Text>}
              {canUpload && (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {item.digilocker && data.digilocker.available && (
                    <Pressable style={[ui.btnDark, styles.smallBtn]} onPress={digilocker} accessibilityRole="button">
                      <View style={styles.row}><ShieldCheck size={16} color={C.onNight} /><Text style={[ui.btnText, { color: C.onNight }]}>DigiLocker</Text></View>
                    </Pressable>
                  )}
                  <Pressable style={[item.digilocker && data.digilocker.available ? ui.btnOutline : ui.btnDark, styles.smallBtn]} onPress={() => setUploading(item)} accessibilityRole="button">
                    <Text style={item.digilocker && data.digilocker.available ? ui.btnOutlineText : [ui.btnText, { color: C.onNight }]}>
                      {item.state === 'MISSING' ? (item.kind === 'AADHAAR' ? 'Upload masked Aadhaar' : 'Upload') : item.state === 'EXPIRING' ? 'Upload renewal' : 'Upload again'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
        <Text style={ui.muted}>Your documents are stored privately and only Nabz’s verification team can open them. We never store your full Aadhaar number.</Text>
      </View>

      <UploadSheet item={uploading} onClose={() => setUploading(null)} onDone={() => { setUploading(null); appAlert('Uploaded', 'We’ll review it within a working day.'); load(); }} />
    </ScrollView>
  );
}

/** DD/MM/YYYY → ISO date (end of that day), or null if invalid. */
function parseDate(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59);
  if (d.getDate() !== Number(m[1])) return null;
  return d.toISOString();
}

function UploadSheet({ item, onClose, onDone }: { item: VerificationItem | null; onClose: () => void; onDone: () => void }) {
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPhoto(null); setNumber(''); setExpiry(''); setError(null); }, [item?.kind]);
  if (!item) return null;
  const isAadhaar = item.kind === 'AADHAAR';

  async function pick(camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError(camera ? 'Allow camera access to take a photo.' : 'Allow photo access to choose a picture.'); return; }
    const res = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!res.canceled && res.assets[0]) { setPhoto(res.assets[0]); setError(null); }
  }

  async function submit() {
    if (!item) return;
    if (!photo) { setError('Add a photo of the document.'); return; }
    if (isAadhaar && !/^\d{4}$/.test(number)) { setError('Enter only the last 4 digits of your Aadhaar.'); return; }
    const iso = item.hasExpiry ? parseDate(expiry) : null;
    if (item.hasExpiry && !iso) { setError('Enter the expiry date as DD/MM/YYYY.'); return; }
    setBusy(true);
    setError(null);
    try {
      const name = photo.fileName || `${item.kind.toLowerCase()}.jpg`;
      await api.uploadPartnerDocument({
        kind: item.kind,
        number: number.trim() || undefined,
        expiresAt: iso || undefined,
        file: { uri: photo.uri, name, type: photo.mimeType || 'image/jpeg' },
        filename: name
      });
      onDone();
    } catch (e) {
      setError(describeNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <ScrollView style={styles.sheet} contentContainerStyle={{ gap: 10, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          <Text style={[ui.display, { fontSize: 26, lineHeight: 30 }]}>{item.label}</Text>
          {isAadhaar
            ? <Text style={[ui.body, styles.note]}>Cover the first 8 digits before you take the photo, so only the last 4 are visible. The Aadhaar app’s “masked Aadhaar” does this for you.</Text>
            : item.hint ? <Text style={ui.muted}>{item.hint}</Text> : null}
          {photo
            ? <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" accessibilityLabel="Photo of the document" />
            : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={[ui.btnOutline, { flex: 1 }]} onPress={() => pick(true)} accessibilityRole="button">
              <View style={styles.row}><Camera size={16} color={C.brand} /><Text style={ui.btnOutlineText}>{photo ? 'Retake' : 'Take photo'}</Text></View>
            </Pressable>
            <Pressable style={[ui.btnOutline, { flex: 1 }]} onPress={() => pick(false)} accessibilityRole="button">
              <View style={styles.row}><ImageUp size={16} color={C.brand} /><Text style={ui.btnOutlineText}>Gallery</Text></View>
            </Pressable>
          </View>
          {item.numberLabel && (
            <>
              <Text style={ui.label}>{item.numberLabel}{item.optional ? ' (optional)' : ''}</Text>
              <TextInput style={ui.input} value={number} autoCapitalize="characters" autoCorrect={false}
                keyboardType={isAadhaar ? 'number-pad' : 'default'} maxLength={isAadhaar ? 4 : 40}
                placeholder={isAadhaar ? '4 digits' : ''} placeholderTextColor={C.faint}
                onChangeText={(t) => setNumber(isAadhaar ? t.replace(/\D/g, '') : t.toUpperCase())} />
            </>
          )}
          {item.hasExpiry && (
            <>
              <Text style={ui.label}>Valid until</Text>
              <TextInput style={ui.input} value={expiry} onChangeText={setExpiry} placeholder="DD/MM/YYYY" placeholderTextColor={C.faint} keyboardType="numbers-and-punctuation" maxLength={10} />
            </>
          )}
          {error && <Text style={ui.error}>{error}</Text>}
          <Pressable style={[ui.btnDark, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit} accessibilityRole="button">
            {busy ? <ActivityIndicator color={C.onNight} /> : <Text style={[ui.btnText, { color: C.onNight }]}>Upload document</Text>}
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: 'center', padding: 8 }} accessibilityRole="button"><Text style={ui.muted}>Cancel</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { backgroundColor: C.night, paddingHorizontal: 18, paddingBottom: 22, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, gap: 4 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { color: C.onNight, fontFamily: F.display, fontSize: 34, lineHeight: 38 },
  sub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 14, lineHeight: 20 },
  bar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: C.gold },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, ...clay },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontFamily: F.heavy, fontSize: 11 },
  smallBtn: { paddingVertical: 12, paddingHorizontal: 16, flexGrow: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,12,16,0.55)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 },
  note: { backgroundColor: C.amberSoft, padding: 12, borderRadius: 14, overflow: 'hidden' },
  preview: { width: '100%', height: 180, borderRadius: 16, backgroundColor: C.cardAlt }
});
