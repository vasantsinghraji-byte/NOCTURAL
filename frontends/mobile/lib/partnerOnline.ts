/**
 * Nabz Partner "online" mode that survives the app going to the background.
 *
 * While a nurse/physio is online we run a location foreground service (the
 * persistent "You're online" notification, like Uber/Rapido partner apps).
 * Every location update (~15 s) the task:
 *   1. heartbeats availability, so dispatch keeps offering them visits;
 *   2. shares their position on any live visit (customer tracking);
 *   3. checks for a new visit offer and rings the loud "visit requests"
 *      channel when the app isn't on screen (on screen, staff.tsx rings).
 *
 * Works without Firebase: everything is pulled from the API by the task.
 * The task may run in a fresh JS context after Android restarts it, so it
 * reads the saved session and refreshes the access token itself.
 */

import { AppState, Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { ApiError } from '@medrush/shared';
import { api, getAuthToken, loadServerUrl, setAuthToken } from './api';
import { DEMO_POINT } from './care';

export const ONLINE_TASK = 'nabz-partner-online';
// Android fixes a channel's sound when it's first created, so a new sound
// needs a new channel id.
export const VISIT_CHANNEL = 'visit-requests-v1';
export const VISIT_RING = 'visit_ring.wav';
export const PARTNER_DEMO_KEY = 'nabz.partnerDemoArea';
export const LIVE_VISITS_KEY = 'nabz.liveVisitIds';
const SESSION_KEY = 'medrush.session';
const LAST_RUNG_KEY = 'nabz.lastOfferRung';

/** Loud, ringtone-style channel for visit offers (plays even on the lock screen). */
export async function ensureVisitChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(VISIT_CHANNEL, {
    name: 'Visit requests',
    description: 'Rings when a patient near you needs a visit',
    importance: Notifications.AndroidImportance.MAX,
    sound: VISIT_RING,
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION
    }
  });
}

/** Headless-safe auth: restore the saved token, refresh once on 401. */
async function withAuth<T>(call: () => Promise<T>): Promise<T> {
  if (!getAuthToken()) {
    await loadServerUrl().catch(() => undefined);
    const raw = await SecureStore.getItemAsync(SESSION_KEY).catch(() => null);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved || !saved.token) throw new Error('Not signed in');
    setAuthToken(saved.token);
  }
  try {
    return await call();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    const raw = await SecureStore.getItemAsync(SESSION_KEY).catch(() => null);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved || !saved.refreshToken) throw err;
    const res = await api.refreshSession(saved.refreshToken);
    if (!res.tokens) throw err;
    const next = { ...saved, token: res.tokens.accessToken, refreshToken: res.tokens.refreshToken };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
    setAuthToken(next.token);
    return call();
  }
}

TaskManager.defineTask(ONLINE_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations || [];
  const last = locations[locations.length - 1];
  try {
    const demo = (await SecureStore.getItemAsync(PARTNER_DEMO_KEY).catch(() => null)) === '1';
    const coords = demo || !last ? DEMO_POINT : { lat: last.coords.latitude, lng: last.coords.longitude };
    if (!demo && !last) return;
    await withAuth(() => api.setStaffAvailability(true, coords));

    const live = JSON.parse((await SecureStore.getItemAsync(LIVE_VISITS_KEY).catch(() => null)) || '[]') as string[];
    await Promise.all(live.map((id) => api.shareVisitLocation(id, coords.lat, coords.lng).catch(() => undefined)));

    const { offer } = await withAuth(() => api.getMyOffer());
    if (!offer) return;
    const rung = await SecureStore.getItemAsync(LAST_RUNG_KEY).catch(() => null);
    if (rung === String(offer.bookingId)) return;
    await SecureStore.setItemAsync(LAST_RUNG_KEY, String(offer.bookingId)).catch(() => undefined);
    if (AppState.currentState === 'active') return; // the open screen rings itself
    await ensureVisitChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'New visit request',
        body: `${String(offer.serviceType).replace(/_/g, ' ').toLowerCase()} · ${offer.distanceKm !== null && offer.distanceKm !== undefined ? `${offer.distanceKm} km · ` : ''}earn ₹${offer.earnings}. Open to accept.`,
        sound: VISIT_RING,
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: { type: 'CARE_VISIT_REQUEST', bookingId: String(offer.bookingId) }
      },
      trigger: Platform.OS === 'android' ? ({ channelId: VISIT_CHANNEL, seconds: 1 } as Notifications.NotificationTriggerInput) : null
    });
  } catch {
    // Never throw from a background task; the next location update retries.
  }
});

/**
 * Start background online mode. Needs "Allow all the time" location on
 * Android 10+; returns false if the partner declined (the caller then falls
 * back to foreground-only heartbeats and tells them to keep the app open).
 */
export async function startBackgroundOnline(): Promise<boolean> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (!bg.granted) return false;
    await ensureVisitChannel();
    if (await Location.hasStartedLocationUpdatesAsync(ONLINE_TASK).catch(() => false)) return true;
    await Location.startLocationUpdatesAsync(ONLINE_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15_000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "You're online on Nabz Partner",
        notificationBody: 'You will get visit requests near you. Go offline in the app to stop.',
        notificationColor: '#2f7d5b',
        killServiceOnDestroy: false
      }
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundOnline() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(ONLINE_TASK)) {
      await Location.stopLocationUpdatesAsync(ONLINE_TASK);
    }
  } catch {
    /* already stopped */
  }
  await SecureStore.deleteItemAsync(LAST_RUNG_KEY).catch(() => undefined);
}

export async function isBackgroundOnline() {
  return Location.hasStartedLocationUpdatesAsync(ONLINE_TASK).catch(() => false);
}
