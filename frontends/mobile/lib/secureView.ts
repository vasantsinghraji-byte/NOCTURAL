import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * Block screenshots, screen recording and the recent-apps preview while
 * something private is on screen: a prescription, the visit / collection code,
 * a lab report. On Android this sets FLAG_SECURE; it is lifted as soon as the
 * view closes, so the rest of the app can still be screenshotted (support).
 * Each caller passes its own key so two open views don't unblock each other.
 */
export function useSecureView(key: string, on = true) {
  useEffect(() => {
    if (!on) return undefined;
    ScreenCapture.preventScreenCaptureAsync(key).catch(() => undefined);
    return () => { ScreenCapture.allowScreenCaptureAsync(key).catch(() => undefined); };
  }, [key, on]);
}
