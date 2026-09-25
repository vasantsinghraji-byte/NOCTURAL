import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import {
  Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold
} from '@expo-google-fonts/manrope';
// Registers the Partner background task before anything renders (must be top-level).
import '@/lib/partnerOnline';
import { AuthProvider } from '@/lib/auth';
import { DialogHost } from '@/lib/dialog';
import { LangProvider } from '@/lib/i18n';
import { C, F, IS_DARK } from '@/lib/theme';

export default function RootLayout() {
  // Fonts ship inside the app bundle (no network at runtime).
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold
  });
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: C.night }} />;

  return (
    <SafeAreaProvider>
      <LangProvider>
        <AuthProvider>
          <StatusBar style={IS_DARK ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: C.bg },
              headerTintColor: C.ink,
              headerTitleStyle: { fontFamily: F.heavy },
              headerTitleAlign: 'center',
              headerShadowVisible: false,
              contentStyle: { backgroundColor: C.bg },
              animation: 'slide_from_right'
            }}
          >
            {/* Customer app */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="phone" options={{ headerShown: false }} />
            <Stack.Screen name="book" options={{ headerShown: false }} />
            <Stack.Screen name="track" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ title: 'Sign in' }} />
            <Stack.Screen name="forgot" options={{ headerShown: false }} />
            <Stack.Screen name="permissions" options={{ title: 'Permissions' }} />
            {/* Partner app (Nabz Partner build) */}
            <Stack.Screen name="partner" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="partner-apply" options={{ title: 'Join Nabz Partner' }} />
            <Stack.Screen name="vendor" options={{ title: 'Store orders', headerBackVisible: false }} />
            <Stack.Screen name="staff" options={{ headerShown: false }} />
            <Stack.Screen name="lab" options={{ title: 'Path lab partner', headerBackVisible: false }} />
          </Stack>
          <DialogHost />
        </AuthProvider>
      </LangProvider>
    </SafeAreaProvider>
  );
}
