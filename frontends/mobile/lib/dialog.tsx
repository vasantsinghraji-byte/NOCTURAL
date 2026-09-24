import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { C, F, IS_DARK, clay } from './theme';

/**
 * Nabz-styled replacement for Alert.alert (the grey system dialog):
 *   appAlert(title, message?, buttons?, options?)  same shape as Alert.alert
 *   appPrompt({ title, message, placeholder, ... }) → Promise<string | null>
 * One <DialogHost /> is mounted in app/_layout.tsx; dialogs queue up.
 */

export type DialogButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
type Dialog = {
  title: string;
  message?: string;
  buttons: DialogButton[];
  onDismiss?: () => void;
  input?: { placeholder?: string; keyboardType?: KeyboardTypeOptions; maxLength?: number; resolve: (value: string | null) => void };
};

const queue: Dialog[] = [];
let wake: (() => void) | null = null;

function enqueue(d: Dialog) {
  queue.push(d);
  wake?.();
}

export function appAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: { cancelable?: boolean; onDismiss?: () => void }
) {
  enqueue({ title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }], onDismiss: options?.onDismiss });
}

export function appPrompt(opts: {
  title: string; message?: string; placeholder?: string; confirmText?: string; cancelText?: string;
  keyboardType?: KeyboardTypeOptions; maxLength?: number;
}): Promise<string | null> {
  return new Promise((resolve) => {
    enqueue({
      title: opts.title,
      message: opts.message,
      buttons: [{ text: opts.cancelText || 'Cancel', style: 'cancel' }, { text: opts.confirmText || 'Confirm' }],
      input: { placeholder: opts.placeholder, keyboardType: opts.keyboardType, maxLength: opts.maxLength, resolve }
    });
  });
}

export function DialogHost() {
  const [current, setCurrent] = useState<Dialog | null>(null);
  const [value, setValue] = useState('');
  const currentRef = useRef<Dialog | null>(null);

  useEffect(() => {
    const next = () => {
      if (currentRef.current || queue.length === 0) return;
      const d = queue.shift() || null;
      currentRef.current = d;
      setValue('');
      setCurrent(d);
    };
    wake = next;
    next();
    return () => { wake = null; };
  }, []);

  function close(button?: DialogButton) {
    const d = currentRef.current;
    currentRef.current = null;
    setCurrent(null);
    if (d?.input) d.input.resolve(button && button.style !== 'cancel' ? value.trim() : null);
    else if (!button) d?.onDismiss?.();
    // Let the modal close before running the action (it may open another dialog).
    setTimeout(() => {
      button?.onPress?.();
      wake?.();
    }, 60);
  }

  if (!current) return null;
  const cancelBtn = current.buttons.find((b) => b.style === 'cancel');
  const stacked = current.buttons.length > 2 || current.buttons.some((b) => b.text.length > 16);

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent onRequestClose={() => close(cancelBtn)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => (cancelBtn ? close(cancelBtn) : current.buttons.length === 1 ? close(current.buttons[0]) : undefined)} />
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          {current.input && (
            <TextInput
              autoFocus
              value={value}
              onChangeText={setValue}
              placeholder={current.input.placeholder}
              placeholderTextColor={C.faint}
              keyboardType={current.input.keyboardType}
              maxLength={current.input.maxLength}
              style={styles.input}
            />
          )}
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            {(stacked ? [...current.buttons.filter((x) => x.style !== 'cancel'), ...current.buttons.filter((x) => x.style === 'cancel')] : current.buttons).map((b) => {
              const kind = b.style === 'cancel' ? 'ghost' : b.style === 'destructive' ? 'danger' : 'primary';
              return (
                <Pressable
                  key={b.text}
                  onPress={() => close(b)}
                  style={({ pressed }) => [styles.btn, !stacked && { flex: 1 }, styles[kind], pressed && { opacity: 0.85 }]}
                >
                  <Text style={[styles.btnText, kind === 'ghost' ? { color: C.inkSoft } : { color: C.onNight }]} numberOfLines={2}>{b.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: IS_DARK ? 'rgba(0,0,0,0.6)' : 'rgba(42,37,35,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 420, backgroundColor: C.card, borderRadius: 28, padding: 22, gap: 10, ...clay },
  title: { fontFamily: F.display, fontSize: 26, lineHeight: 30, color: C.ink },
  message: { fontFamily: F.medium, fontSize: 15, lineHeight: 22, color: C.inkSoft },
  input: {
    marginTop: 4, backgroundColor: C.cardAlt, borderRadius: 16, borderWidth: 1.5, borderColor: C.border,
    paddingLeft: 18, paddingRight: 18, paddingVertical: 13, fontSize: 18, letterSpacing: 2, color: C.ink, fontFamily: F.bold
  },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  buttonsStacked: { flexDirection: 'column' },
  btn: { minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  primary: { backgroundColor: C.brand },
  danger: { backgroundColor: C.night },
  ghost: { backgroundColor: C.cardAlt },
  btnText: { fontFamily: F.heavy, fontSize: 15, textAlign: 'center' }
});
