import { Redirect, Tabs } from 'expo-router';
import { CalendarDays, HeartPulse, House, ShoppingBag, UserRound, type LucideIcon } from 'lucide-react-native';
import { homeForRole, useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { LoadingScreen } from '@/lib/LoadingScreen';
import { PillTabBar } from '@/lib/PillTabBar';
import { IS_PARTNER_APP } from '@/lib/variant';

const ICONS: Record<string, LucideIcon> = { index: House, care: HeartPulse, pharmacy: ShoppingBag, bookings: CalendarDays, account: UserRound };

/** Customer app: Home books medical staff (Uber/Rapido style); Care is the physio / home care / lab marketplace. */
export default function TabsLayout() {
  const { ready, session, explored } = useAuth();
  const { t } = useT();

  if (!ready) return <LoadingScreen />;

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
    <Tabs tabBar={(props) => <PillTabBar {...props} icons={ICONS} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('tab.home') }} />
      <Tabs.Screen name="care" options={{ title: t('tab.care') }} />
      <Tabs.Screen name="pharmacy" options={{ title: t('tab.pharmacy') }} />
      <Tabs.Screen name="bookings" options={{ title: t('tab.bookings') }} />
      <Tabs.Screen name="account" options={{ title: t('tab.account') }} />
    </Tabs>
  );
}

