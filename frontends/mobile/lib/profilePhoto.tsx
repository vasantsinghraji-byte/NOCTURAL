import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { api, describeNetworkError, getAuthToken } from './api';
import { appAlert } from './dialog';
import { C, F } from './theme';

/**
 * Profile picture for customers and partners (same as the website). Photos are
 * private: the image request carries the signed-in token. Tap to change.
 */
export function PhotoAvatar({ name, url, size = 60, editable = false, onChange }: {
  name: string;
  url?: string | null;
  size?: number;
  editable?: boolean;
  onChange?: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);
  const token = getAuthToken();

  async function upload(camera: boolean) {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { appAlert(camera ? 'Camera access needed' : 'Photo access needed', 'Allow it in Settings to add a profile photo.'); return; }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setBusy(true);
    try {
      const name = a.fileName || 'photo.jpg';
      const r = await api.uploadProfilePhoto({ uri: a.uri, name, type: a.mimeType || 'image/jpeg' }, name);
      setBroken(false);
      onChange?.(r.profilePhoto.url);
    } catch (e) {
      appAlert('Could not upload', describeNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try { await api.removeProfilePhoto(); onChange?.(null); } catch (e) { appAlert('Could not remove', describeNetworkError(e)); }
  }

  function choose() {
    appAlert(url ? 'Change profile photo' : 'Add a profile photo', undefined, [
      { text: 'Take photo', onPress: () => upload(true) },
      { text: 'Choose from gallery', onPress: () => upload(false) },
      ...(url ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: remove }] : []),
      { text: 'Cancel', style: 'cancel' as const }
    ]);
  }

  const circle = { width: size, height: size, borderRadius: size / 2 };
  const face = url && !broken
    ? <Image source={{ uri: api.absoluteUrl(url), headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={[circle, styles.img]} onError={() => setBroken(true)} accessibilityIgnoresInvertColors />
    : <View style={[circle, styles.initialBox]}><Text style={[styles.initial, { fontSize: size * 0.42 }]}>{(name || '?').charAt(0).toUpperCase()}</Text></View>;

  if (!editable) return face;
  return (
    <Pressable onPress={choose} disabled={busy} accessibilityRole="button" accessibilityLabel={url ? 'Change profile photo' : 'Add profile photo'} hitSlop={6}>
      {face}
      <View style={styles.badge}>{busy ? <ActivityIndicator size="small" color="#5a2a14" /> : <Camera size={13} color="#5a2a14" />}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: 'rgba(255,255,255,0.12)' },
  initialBox: { backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  initial: { color: C.onNight, fontFamily: F.heavy },
  badge: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.night }
});
