import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { api, describeNetworkError } from './api';
import { appAlert } from './dialog';

/** What the customer attached: shown back to them before ordering. */
export interface UploadedPrescription { key: string; url: string; uri: string; kind: 'image' | 'pdf'; name: string }

const MAX_BYTES = 9.5 * 1024 * 1024; // server limit is 10 MB
// The only formats the server accepts (it also checks the file's real contents).
const ACCEPTED = ['image/jpeg', 'image/png', 'application/pdf'];

/** Ask where the prescription comes from. Resolves null when the user cancels. */
function chooseSource(): Promise<'camera' | 'library' | 'file' | null> {
  return new Promise((resolve) => {
    appAlert('Attach prescription', 'Take a clear photo of the whole prescription, pick one from your gallery, or choose a PDF. JPG, PNG or PDF, up to 10 MB.', [
      { text: 'Camera', onPress: () => resolve('camera') },
      { text: 'Gallery', onPress: () => resolve('library') },
      { text: 'PDF file', onPress: () => resolve('file') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) }
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}

/** Photos are re-encoded by the picker (quality < 1), so anything but PNG arrives as JPEG. */
function photoFile(asset: ImagePicker.ImagePickerAsset): { name: string; type: string; ext: string } {
  const png = (asset.mimeType || '').toLowerCase() === 'image/png';
  const ext = png ? 'png' : 'jpg';
  return { name: `prescription-${Date.now()}.${ext}`, type: png ? 'image/png' : 'image/jpeg', ext };
}

async function pickPhoto(source: 'camera' | 'library'): Promise<{ uri: string; size?: number; name: string; type: string } | null> {
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      appAlert('Camera permission needed', 'Allow the camera to photograph your prescription, or choose Gallery instead.', [
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
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const { name, type } = photoFile(asset);
  return { uri: asset.uri, size: asset.fileSize, name, type };
}

async function pickFile(): Promise<{ uri: string; size?: number; name: string; type: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ACCEPTED, copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const type = (asset.mimeType || '').toLowerCase().replace('image/jpg', 'image/jpeg');
  if (!ACCEPTED.includes(type)) {
    appAlert('Use JPG, PNG or PDF', 'That file type can’t be sent to the pharmacy. Choose a JPG, PNG or PDF, or take a photo instead.');
    return null;
  }
  const ext = type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg';
  return { uri: asset.uri, size: asset.size, name: `prescription-${Date.now()}.${ext}`, type };
}

/**
 * Camera / gallery / PDF → upload → { key, url }. Every failure is explained to
 * the user (permission, no camera app, wrong type, too large, network) instead
 * of failing silently. Returns null if the user cancels at any step.
 */
export async function pickAndUploadPrescription(): Promise<UploadedPrescription | null> {
  const source = await chooseSource();
  if (!source) return null;

  let file: Awaited<ReturnType<typeof pickFile>>;
  try {
    file = source === 'file' ? await pickFile() : await pickPhoto(source);
  } catch (e) {
    appAlert(`Couldn’t open the ${source === 'camera' ? 'camera' : source === 'library' ? 'gallery' : 'files'}`, e instanceof Error ? e.message : String(e));
    return null;
  }
  if (!file) return null;
  if (file.size && file.size > MAX_BYTES) {
    appAlert('File too large', source === 'file' ? 'Choose a file under 10 MB.' : 'Please retake the photo a little further away (max 10 MB).');
    return null;
  }

  try {
    const up = await api.uploadPrescription({ uri: file.uri, name: file.name, type: file.type }, file.name);
    return { key: up.key, url: up.url, uri: file.uri, kind: file.type === 'application/pdf' ? 'pdf' : 'image', name: file.name };
  } catch (e) {
    appAlert('Upload failed', describeNetworkError(e));
    return null;
  }
}
