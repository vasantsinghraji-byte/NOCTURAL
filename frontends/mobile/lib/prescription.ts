import { Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, describeNetworkError } from './api';

export interface UploadedPrescription { key: string; url: string; uri: string }

const MAX_BYTES = 9.5 * 1024 * 1024; // server limit is 10 MB

/** Ask where the prescription comes from. Resolves null when the user cancels. */
function chooseSource(): Promise<'camera' | 'library' | null> {
  return new Promise((resolve) => {
    Alert.alert('Attach prescription', 'Take a clear photo of the whole prescription, or pick one from your gallery.', [
      { text: 'Camera', onPress: () => resolve('camera') },
      { text: 'Gallery', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) }
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

function fileNameFor(asset: ImagePicker.ImagePickerAsset): { name: string; type: string } {
  const type = asset.mimeType && /^image\/(jpe?g|png|webp)$/i.test(asset.mimeType) ? asset.mimeType.toLowerCase() : 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return { name: `prescription-${Date.now()}.${ext}`, type };
}

/**
 * Camera / gallery → upload → { key, url }. Every failure is explained to the
 * user (permission, no camera app, too large, network) instead of failing silently.
 * Returns null if the user cancels at any step.
 */
export async function pickAndUploadPrescription(): Promise<UploadedPrescription | null> {
  const source = await chooseSource();
  if (!source) return null;

  let result: ImagePicker.ImagePickerResult;
  try {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera permission needed', 'Allow the camera to photograph your prescription, or choose Gallery instead.', [
          { text: 'Open settings', onPress: () => Linking.openSettings() },
          { text: 'OK', style: 'cancel' }
        ]);
        return null;
      }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5, exif: false });
    } else {
      // Android 13+ uses the system photo picker (no storage permission needed).
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, exif: false, allowsMultipleSelection: false });
    }
  } catch (e) {
    Alert.alert('Couldn’t open the ' + (source === 'camera' ? 'camera' : 'gallery'), e instanceof Error ? e.message : String(e));
    return null;
  }

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (asset.fileSize && asset.fileSize > MAX_BYTES) {
    Alert.alert('Photo too large', 'Please retake the photo a little further away (max 10 MB).');
    return null;
  }

  const { name, type } = fileNameFor(asset);
  try {
    const up = await api.uploadPrescription({ uri: asset.uri, name, type }, name);
    return { key: up.key, url: up.url, uri: asset.uri };
  } catch (e) {
    Alert.alert('Upload failed', describeNetworkError(e));
    return null;
  }
}
