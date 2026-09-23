import { View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { CalendarDays, House, ShoppingBag, UserRound, type LucideIcon } from 'lucide-react-native';
import { homeForRole, useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { IS_PARTNER_APP } from '@/lib/variant';
import { C, F, IS_DARK } from '@/lib/theme';

// SVG line icons (no icon-font loading); thicker stroke + dot when active.
const icon = (Icon: LucideIcon) =>
  ({ color, focused }: { color: string; focused: boolean }) => (
    <View style={{ alignItems: 'center' }}>
      <Icon size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
    </View>
  );

/** Customer app: Home books medical staff (Uber/Rapido style); the rest live in the tab bar. */
export default function TabsLayout() {
  const { ready, session, explored } = useAuth();
  const { t } = useT();

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.night }} />;

  // Nabz Partner build: no customer tabs at all.
  if (IS_PARTNER_APP) return <Redirect href={session ? homeForRole(session.role) : '/partner'} />;

  // First launch: welcome (sign in / continue with phone / explore first).
  if (!session && !explored) return <Redirect href="/welcome" />;

  // A partner account signed in on the customer app goes to its own area.
  if (session && session.role !== 'patient') {
    const home = homeForRole(session.role);
    if (home !== '/') return <Redirect href={home} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: C.faint,
        tabBarLabelStyle: { fontFamily: F.bold, fontSize: 11, marginBottom: 4 },
        tabBarStyle: {
          height: 66, paddingTop: 6, backgroundColor: C.card, borderTopWidth: IS_DARK ? 1 : 0, borderTopColor: C.border,
          elevation: 16, shadowOpacity: 0.08
        }
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: icon(House) }} />
      <Tabs.Screen name="pharmacy" options={{ title: t('tab.pharmacy'), tabBarIcon: icon(ShoppingBag) }} />
      <Tabs.Screen name="bookings" options={{ title: t('tab.bookings'), tabBarIcon: icon(CalendarDays) }} />
      <Tabs.Screen name="account" options={{ title: t('tab.account'), tabBarIcon: icon(UserRound) }} />
    </Tabs>
  );
}
