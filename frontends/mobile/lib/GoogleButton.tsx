import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import Svg, { Path } from 'react-native-svg';
import type { SocialSignInResult } from '@medrush/shared';
import { api, describeNetworkError } from './api';
import { PressScale } from './motion';
import { GOOGLE_CLIENT_IDS } from './variant';
import { C, F } from './theme';

WebBrowser.maybeCompleteAuthSession();

type Props = {
  label: string;
  onResult: (res: SocialSignInResult) => void;
  onError: (message: string) => void;
};

/**
 * "Continue with Google". Render only when GOOGLE_CONFIGURED. The server
 * verifies the ID token (audience = GOOGLE_OAUTH_CLIENT_IDS) before creating
 * any session.
 *
 * Android uses native Google sign-in (the system account picker): no browser
 * and no custom-scheme redirect, which Google blocks for new Android clients.
 * The token is issued for the web client id; Google checks this app's package
 * name and signing key against the Android client.
 */
export function GoogleButton(props: Props) {
  return Platform.OS === 'android' ? <NativeGoogleButton {...props} /> : <BrowserGoogleButton {...props} />;
}

function NativeGoogleButton({ label, onResult, onError }: Props) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({ webClientId: GOOGLE_CLIENT_IDS.web, scopes: ['email', 'profile'], offlineAccess: false });
  }, []);

  async function signIn() {
    if (!GOOGLE_CLIENT_IDS.web) { onError('Google sign-in isn’t set up in this build.'); return; }
    setBusy(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (!isSuccessResponse(res)) return; // closed the picker
      const idToken = res.data.idToken;
      // Our own session takes over; forget Google's so the picker shows next time.
      GoogleSignin.signOut().catch(() => undefined);
      if (!idToken) { onError('Google did not return a sign-in token.'); return; }
      onResult(await api.googleSignIn(idToken));
    } catch (e) {
      if (isErrorWithCode(e)) {
        if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return;
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) { onError('Google Play services are needed for Google sign-in on this phone.'); return; }
        // DEVELOPER_ERROR (10): package name / signing key don't match the Android client.
        onError(String(e.code) === '10' ? 'Google sign-in isn’t set up for this app version yet.' : 'Google sign-in failed. Please try again.');
        return;
      }
      onError(describeNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  return <ButtonFace label={label} busy={busy} disabled={busy} onPress={signIn} />;
}

function BrowserGoogleButton({ label, onResult, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: GOOGLE_CLIENT_IDS.android || undefined,
    iosClientId: GOOGLE_CLIENT_IDS.ios || undefined,
    webClientId: GOOGLE_CLIENT_IDS.web || undefined
  });

  useEffect(() => {
    if (!response) return;
    if (response.type !== 'success') { setBusy(false); return; }
    const idToken = response.params?.id_token;
    if (!idToken) { setBusy(false); onError('Google did not return a sign-in token.'); return; }
    api.googleSignIn(idToken)
      .then(onResult)
      .catch((e) => onError(describeNetworkError(e)))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return <ButtonFace label={label} busy={busy} disabled={!request || busy} onPress={() => { setBusy(true); promptAsync().catch(() => setBusy(false)); }} />;
}

function ButtonFace({ label, busy, disabled, onPress }: { label: string; busy: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <PressScale style={styles.btn} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy, disabled }}>
      {busy ? <ActivityIndicator color={C.onNight} /> : (
        <View style={styles.row}>
          <Svg width={18} height={18} viewBox="0 0 48 48">
            <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </Svg>
          <Text style={styles.text}>{label}</Text>
        </View>
      )}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { color: C.onNight, fontFamily: F.bold, fontSize: 15 }
});
