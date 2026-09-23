import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  variant?: 'customer' | 'partner';
  webBaseUrl?: string;
  google?: { androidClientId?: string; iosClientId?: string; webClientId?: string };
};

/** Which of the two apps this build is (APP_VARIANT at build time). */
export const IS_PARTNER_APP = extra.variant === 'partner';
export const APP_NAME = IS_PARTNER_APP ? 'Nabz Partner' : 'Nabz';

/** Website origin for shareable family-tracking links (falls back to the API origin). */
export const WEB_BASE_URL = (extra.webBaseUrl || '').replace(/\/+$/, '');

export const GOOGLE_CLIENT_IDS = {
  android: extra.google?.androidClientId || '',
  ios: extra.google?.iosClientId || '',
  web: extra.google?.webClientId || ''
};
export const GOOGLE_CONFIGURED = !!(GOOGLE_CLIENT_IDS.android || GOOGLE_CLIENT_IDS.ios || GOOGLE_CLIENT_IDS.web);
