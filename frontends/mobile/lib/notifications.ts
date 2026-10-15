import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

export const ORDERS_CHANNEL = 'orders';

// Show new-order alerts even while the app is open (a store keeps it open all day).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

/** Loud, high-priority Android channel so a busy shop hears new orders. */
export async function ensureOrdersChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ORDERS_CHANNEL, {
    name: 'New orders',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC
  });
}

export async function getNotificationPermission() {
  return (await Notifications.getPermissionsAsync()).status;
}

/** Android 13+ shows the system prompt (POST_NOTIFICATIONS). */
export async function requestNotificationPermission() {
  await ensureOrdersChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  return (await Notifications.requestPermissionsAsync()).status;
}

/** Show a notification from inside the app (used for polling + the self-test). */
export async function notifyLocal(title: string, body: string, data: Record<string, string> = {}) {
  await ensureOrdersChannel();
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: 'default' },
    trigger: Platform.OS === 'android' ? { channelId: ORDERS_CHANNEL, seconds: 1 } as Notifications.NotificationTriggerInput : null
  });
}

let registeredToken: string | null = null;

/** Called on logout so a shared store phone stops getting that account's pushes. */
export async function unregisterServerPush() {
  if (!registeredToken) return;
  try { await api.unregisterPushDevice(registeredToken); } catch { /* best effort */ }
  registeredToken = null;
}

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/**
 * Register this phone's FCM token with the API so the server can push orders
 * even when the app is closed. Needs a real device/emulator with Google Play
 * services and a build that includes google-services.json.
 */
export async function registerForServerPush(): Promise<PushRegistration> {
  if (!Device.isDevice && Platform.OS === 'ios') return { ok: false, reason: 'iOS simulator cannot receive push' };
  if ((await requestNotificationPermission()) !== 'granted') {
    return { ok: false, reason: 'Notification permission not granted' };
  }
  try {
    const device = await Notifications.getDevicePushTokenAsync();
    const token = String(device.data);
    await api.registerPushDevice(token, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = token;
    return { ok: true, token };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: /firebase|google-services|FirebaseApp/i.test(message)
        ? 'Server push needs Firebase (google-services.json). In-app alerts still work.'
        : message
    };
  }
}
