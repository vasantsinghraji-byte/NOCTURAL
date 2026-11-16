import { Platform } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Space taken by the stack's gradient top bar. A custom `headerBackground` makes
 * the native-stack header translucent, so screens with a visible top bar draw
 * underneath it and must start below it. The native stack reports a height of 0
 * for this header on Android (checked on an API 35 emulator), so fall back to the
 * standard bar height: status bar + 56 dp (Android) / 44 pt (iOS).
 */
export function useTopBarSpace(): number {
  const measured = useHeaderHeight();
  const { top } = useSafeAreaInsets();
  return Math.max(measured, top + (Platform.OS === 'ios' ? 44 : 56));
}
