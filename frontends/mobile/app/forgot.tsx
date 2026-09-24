import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, MailCheck } from 'lucide-react-native';
import { api, describeNetworkError } from '@/lib/api';
import { IconTile } from '@/lib/icons';
import { PressScale, Rise, success } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

/**
 * Forgot password (customers and partners). The emailed link opens the Nabz
 * website, where the new password is chosen; then sign in here as usual.
 */
export default function ForgotPassword() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email.'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api.forgotPassword(email.trim());
      success();
      setSent(r.message);
    } catch (e) {
      setError(describeNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, flex: 1 }}>
        <Pressable hitSlop={12} onPress={() => router.back()} style={styles.back}><ArrowLeft size={22} color={C.ink} /></Pressable>

        {sent ? (
          <Rise style={{ alignItems: 'center', gap: 14, marginTop: 30 }}>
            <IconTile icon={MailCheck} bg={C.mintSoft} color={C.mint} size={84} radius={42} />
            <Text style={[ui.display, { textAlign: 'center' }]}>Check your email</Text>
            <Text style={[ui.body, { textAlign: 'center' }]}>{sent}</Text>
            <Text style={[ui.muted, { textAlign: 'center' }]}>Open the link on this phone or any computer, choose a new password, then sign in here.</Text>
          </Rise>
        ) : (
          <Rise style={{ gap: 12 }}>
            <Text style={ui.display}>Forgot password?</Text>
            <Text style={ui.body}>Enter the email on your account. We’ll send a link to choose a new password.</Text>
            <TextInput
              style={[ui.input, { marginTop: 6 }]} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={C.faint}
              autoCapitalize="none" keyboardType="email-address" autoComplete="email" autoFocus
            />
            {error && <Text style={ui.error}>{error}</Text>}
          </Rise>
        )}

        <View style={{ flex: 1 }} />
        <PressScale
          style={[ui.btnDark, { marginBottom: insets.bottom + 16 }, busy && { opacity: 0.7 }]}
          disabled={busy}
          onPress={sent ? () => router.back() : submit}
        >
          {busy ? <ActivityIndicator color={C.onNight} /> : <Text style={[ui.btnText, { color: C.onNight }]}>{sent ? 'Back to sign in' : 'Send reset link'}</Text>}
        </PressScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', marginBottom: 18, borderWidth: 1, borderColor: C.border },
  label: { fontFamily: F.bold }
});
