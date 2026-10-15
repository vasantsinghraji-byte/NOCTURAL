import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Check, Eye, EyeOff } from 'lucide-react-native';
import { WEB_BASE_URL } from './variant';
import { C, F, ui } from './theme';

/**
 * Multi-line input. Android ignores a multi-line TextInput's own side padding,
 * so the box (border, background, padding) is a View and the text sits inside it.
 */
export function TextArea({ minHeight = 90, style, ...props }: TextInputProps & { minHeight?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.box, { minHeight }, style]}>
      <TextInput {...props} multiline textAlignVertical="top" placeholderTextColor={props.placeholderTextColor || C.faint}
        style={[styles.inner, { minHeight: minHeight - 26 }]} />
    </View>
  );
}

/** Password input with a show / hide button. */
export function PasswordInput({ style, ...props }: TextInputProps & { style?: StyleProp<ViewStyle> }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.box, styles.row, style]}>
      <TextInput {...props} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false}
        placeholderTextColor={props.placeholderTextColor || C.faint} style={[styles.inner, { flex: 1 }]} />
      <Pressable onPress={() => setVisible((v) => !v)} hitSlop={10} style={styles.eye}
        accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
        {visible ? <EyeOff size={20} color={C.muted} /> : <Eye size={20} color={C.muted} />}
      </Pressable>
    </View>
  );
}

/** Opens the Terms and Conditions page (same page as the website). */
export function openTerms(section?: string) {
  const base = WEB_BASE_URL || 'https://79fkmxu8w3.ap-south-1.awsapprunner.com';
  WebBrowser.openBrowserAsync(`${base}/terms${section ? `#${section}` : ''}`).catch(() => undefined);
}

/** "I agree to the Terms" checkbox; the link opens the terms page. */
export function TermsCheckbox({ checked, onChange, section, label = 'I agree to the', linkText = 'Terms and Conditions', tone = 'light' }: {
  checked: boolean; onChange: (v: boolean) => void; section?: string; label?: string; linkText?: string; tone?: 'light' | 'dark';
}) {
  const ink = tone === 'dark' ? C.onNight : C.ink;
  return (
    <View style={styles.termsRow}>
      <Pressable onPress={() => onChange(!checked)} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked }}
        style={[styles.checkbox, { borderColor: tone === 'dark' ? C.onNightMuted : C.border }, checked && styles.checkboxOn]}>
        {checked ? <Check size={14} color="#ffffff" /> : null}
      </Pressable>
      <Text style={[styles.termsText, { color: ink }]} onPress={() => onChange(!checked)}>
        {label}{' '}
        <Text style={[styles.termsLink, { color: tone === 'dark' ? C.gold : C.brand }]} onPress={() => openTerms(section)} accessibilityRole="link">{linkText}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: C.brand, borderColor: C.brand },
  termsText: { flex: 1, fontFamily: F.medium, fontSize: 13, lineHeight: 19 },
  termsLink: { fontFamily: F.bold, textDecorationLine: 'underline' },
  // Same look as ui.input, padding on the wrapper instead of the TextInput.
  box: {
    backgroundColor: ui.input.backgroundColor, borderWidth: ui.input.borderWidth, borderColor: ui.input.borderColor,
    borderRadius: ui.input.borderRadius, paddingLeft: 18, paddingRight: 18, paddingVertical: 13
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 10 },
  inner: { padding: 0, margin: 0, fontSize: 15, color: C.ink, fontFamily: F.medium },
  eye: { paddingHorizontal: 6, paddingVertical: 2 }
});
