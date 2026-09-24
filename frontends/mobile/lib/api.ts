import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createApiClient, type MedRushApi } from '@medrush/shared';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string; allowServerOverride?: boolean };

/** Testers may point a preview APK at another server (never in production builds). */
export const ALLOW_SERVER_OVERRIDE = __DEV__ || extra.allowServerOverride === true;

// Android emulator reaches the laptop's localhost at 10.0.2.2. A physical phone
// needs the laptop's LAN IP (e.g. http://192.168.1.20:5000) — set it on the login screen.
const PLATFORM_DEFAULT = Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';

export const DEFAULT_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || extra.apiBaseUrl || PLATFORM_DEFAULT;

const SERVER_KEY = 'medrush.apiBaseUrl';

// React Native has no cookie jar; the app uses bearer tokens (kept in SecureStore).
let authToken: string | null = null;
export const setAuthToken = (t: string | null) => { authToken = t; };

export const api: MedRushApi = createApiClient({
  baseUrl: DEFAULT_API_BASE_URL,
  credentials: 'omit',
  // Tells the API this is the native app, so login returns bearer tokens.
  headers: { 'X-Nocturnal-Mobile': 'expo' },
  getToken: () => authToken
});

export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '').replace(/\/api(\/v\d+)?$/i, '');
  if (!/^https?:\/\/[^\s/]+/i.test(trimmed)) {
    throw new Error('Enter a URL like http://192.168.1.20:5000');
  }
  return trimmed;
}

/**
 * Restore a tester's saved server (preview builds only). The override remembers
 * which built-in server it replaced: after installing a build that points at a
 * different server (e.g. laptop → AWS), an old override is dropped instead of
 * silently keeping the app on a stale address.
 */
export async function loadServerUrl(): Promise<string> {
  if (ALLOW_SERVER_OVERRIDE) {
    const raw = await SecureStore.getItemAsync(SERVER_KEY).catch(() => null);
    let saved: { url?: string; forDefault?: string } | null = null;
    try { saved = raw ? JSON.parse(raw) : null; } catch { saved = null; } // legacy plain-string value
    if (saved?.url && saved.forDefault === DEFAULT_API_BASE_URL) api.setBaseUrl(saved.url);
    else if (raw) await SecureStore.deleteItemAsync(SERVER_KEY).catch(() => undefined);
  }
  return api.getBaseUrl();
}

export async function saveServerUrl(input: string): Promise<string> {
  if (!ALLOW_SERVER_OVERRIDE) return api.getBaseUrl();
  const url = normalizeServerUrl(input);
  api.setBaseUrl(url);
  if (url === DEFAULT_API_BASE_URL) await SecureStore.deleteItemAsync(SERVER_KEY).catch(() => undefined);
  else await SecureStore.setItemAsync(SERVER_KEY, JSON.stringify({ url, forDefault: DEFAULT_API_BASE_URL }));
  return url;
}

/** Human hint for the most common "can't reach the server" causes. */
export function describeNetworkError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/network request failed|failed to fetch|timeout/i.test(message)) {
    // Cloud server: it's the phone's connection, not a laptop setup problem.
    if (api.getBaseUrl().startsWith('https://')) {
      return 'Can’t reach Nabz right now. Check your internet connection and try again.';
    }
    return `Can't reach ${api.getBaseUrl()}. Emulator: use http://10.0.2.2:5000. Phone: use your laptop's Wi-Fi IP, `
      + 'same Wi-Fi network, and allow port 5000 in Windows Firewall.';
  }
  return message;
}
