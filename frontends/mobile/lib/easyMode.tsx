import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, PixelRatio, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Easy mode: a simpler Home with a few big choices, one per row, and a "Call
 * me back" button always in reach. Meant for older customers and for anyone
 * who finds the full app busy. Remembered on the device.
 *
 * `suggest` is true when the phone already uses large text and the person
 * hasn't decided yet, so Home can offer Easy mode once.
 */
const KEY = 'nabz.easyMode'; // 'on' | 'off' (unset = not decided)

interface EasyState { easy: boolean; suggest: boolean; setEasy: (on: boolean) => void; dismissSuggestion: () => void }
const Ctx = createContext<EasyState>({ easy: false, suggest: false, setEasy: () => undefined, dismissSuggestion: () => undefined });

export function EasyModeProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<'on' | 'off' | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((v) => setValue(v === 'on' || v === 'off' ? v : null)).catch(() => undefined).finally(() => setLoaded(true));
  }, []);
  const save = useCallback((v: 'on' | 'off') => {
    setValue(v);
    SecureStore.setItemAsync(KEY, v).catch(() => undefined);
  }, []);
  const state = useMemo<EasyState>(() => ({
    easy: value === 'on',
    suggest: loaded && value === null && PixelRatio.getFontScale() >= 1.3,
    setEasy: (on) => save(on ? 'on' : 'off'),
    dismissSuggestion: () => save('off')
  }), [value, loaded, save]);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useEasyMode = () => useContext(Ctx);

/** Opens the phone's display settings, where text size is changed for every app. */
export function openTextSizeSettings() {
  if (Platform.OS === 'android') {
    Linking.sendIntent('android.settings.DISPLAY_SETTINGS').catch(() => Linking.openSettings().catch(() => undefined));
  } else {
    Linking.openSettings().catch(() => undefined);
  }
}
