import { Vibration } from 'react-native';
import { Audio } from 'expo-av';

/**
 * Call-style ringing for a visit offer while the Partner app is on screen:
 * the ringtone loops at full volume with a repeating vibration until the
 * partner accepts, declines or the offer expires.
 */
let sound: Audio.Sound | null = null;
let starting: Promise<void> | null = null;

export function startRinging(): Promise<void> {
  if (sound || starting) return starting || Promise.resolve();
  starting = (async () => {
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: false, staysActiveInBackground: false });
      const created = await Audio.Sound.createAsync(
        require('../assets/sounds/visit_ring.wav'),
        { isLooping: true, volume: 1.0, shouldPlay: true }
      );
      sound = created.sound;
    } catch {
      // No audio (e.g. silent hardware switch): the vibration still alerts.
    }
    Vibration.vibrate([0, 800, 400, 800, 1200], true);
  })().finally(() => { starting = null; });
  return starting;
}

export async function stopRinging(): Promise<void> {
  if (starting) await starting;
  Vibration.cancel();
  const current = sound;
  sound = null;
  if (current) {
    await current.stopAsync().catch(() => undefined);
    await current.unloadAsync().catch(() => undefined);
  }
}
