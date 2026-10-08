import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import {
  Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold
} from '@expo-google-fonts/manrope';
// Registers the Partner background task before anything renders (must be top-level).
import '@/lib/partnerOnline';
import { AuthProvider } from '@/lib/auth';
import { DialogHost } from '@/lib/dialog';
import { LangProvider } from '@/lib/i18n';
import { LoadingScreen } from '@/lib/LoadingScreen';
import { EasyModeProvider } from '@/lib/easyMode';
import { C, F, IS_DARK } from '@/lib/theme';

export default function RootLayout() {
  // Fonts ship inside the app bundle (no network at runtime).
  const [fontsLoaded, fontError] = useFonts({
    Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold
  });
  if (!fontsLoaded && !fontError) return <LoadingScreen fontsReady={false} />;

  return (
    <SafeAreaProvider>
      <LangProvider>
        <AuthProvider>
          <EasyModeProvider>
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
            {/* Care marketplace (physio, home care, labs) */}
            <Stack.Screen name="care/[kind]" options={{ headerShown: false }} />
            <Stack.Screen name="care/shop/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="care/book" options={{ headerShown: false }} />
            <Stack.Screen name="care/plan/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="care/plans" options={{ headerShown: false }} />
            <Stack.Screen name="labs/index" options={{ headerShown: false }} />
            <Stack.Screen name="labs/orders" options={{ headerShown: false }} />
            <Stack.Screen name="labs/order/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="addresses" options={{ headerShown: false }} />
            <Stack.Screen name="family/index" options={{ headerShown: false }} />
            <Stack.Screen name="family/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="care-log/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="care-log/staff/[id]" options={{ headerShown: false }} />
            {/* Partner app (Nabz Partner build) */}
            <Stack.Screen name="partner" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="partner-apply" options={{ title: 'Join Nabz Partner' }} />
            <Stack.Screen name="vendor" options={{ title: 'Store orders', headerBackVisible: false }} />
            <Stack.Screen name="(partner)" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="partner-account" options={{ headerShown: false }} />
            <Stack.Screen name="verification" options={{ headerShown: false }} />
          </Stack>
          <DialogHost />
          </EasyModeProvider>
        </AuthProvider>
      </LangProvider>
    </SafeAreaProvider>
  );
}
