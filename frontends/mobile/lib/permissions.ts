import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { getNotificationPermission, requestNotificationPermission } from './notifications';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface AppPermission {
  key: 'location' | 'notifications' | 'camera' | 'photos';
  title: string;
  why: string;
  check: () => Promise<PermissionStatus>;
  request: () => Promise<PermissionStatus>;
}

const norm = (s: string): PermissionStatus =>
  s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'undetermined';

/** Every runtime permission the app uses — and nothing more. */
export const APP_PERMISSIONS: AppPermission[] = [
  {
    key: 'location',
    title: 'Location',
    why: 'Find pharmacies that deliver to you and set your delivery point.',
    check: async () => norm((await Location.getForegroundPermissionsAsync()).status),
    request: async () => norm((await Location.requestForegroundPermissionsAsync()).status)
  },
  {
    key: 'notifications',
    title: 'Notifications',
    why: 'Stores: hear new orders instantly. Customers: order status updates.',
    check: async () => norm(await getNotificationPermission()),
    request: async () => norm(await requestNotificationPermission())
  },
  {
    key: 'camera',
    title: 'Camera',
    why: 'Photograph a prescription for Rx medicines.',
    check: async () => norm((await ImagePicker.getCameraPermissionsAsync()).status),
    request: async () => norm((await ImagePicker.requestCameraPermissionsAsync()).status)
  },
  {
    key: 'photos',
    title: 'Photos',
    why: 'Attach a prescription image from your gallery.',
    check: async () => norm((await ImagePicker.getMediaLibraryPermissionsAsync()).status),
    request: async () => norm((await ImagePicker.requestMediaLibraryPermissionsAsync()).status)
  }
];
