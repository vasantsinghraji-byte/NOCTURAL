import { Redirect, Tabs } from 'expo-router';
import { FlaskConical, Megaphone, Store, Stethoscope, UserRound, type LucideIcon } from 'lucide-react-native';
import { STAFF_ROLES, homeForRole, useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/lib/LoadingScreen';
import { PillTabBar } from '@/lib/PillTabBar';

const ICONS: Record<string, LucideIcon> = { staff: Stethoscope, lab: FlaskConical, shop: Store, 'partner-ads': Megaphone, me: UserRound };
const LAB_ROLES = ['lab_partner', 'phlebotomist'];

/**
 * Partner app home: everything up front in a bottom bar instead of behind
 * header buttons. Nurses and physios get Visits; labs get the Lab desk. Shop
 * owners also get My Shop and Ads (a phlebotomist works inside a lab's shop).
 */
export default function PartnerTabs() {
  const { ready, session } = useAuth();
  if (!ready) return <LoadingScreen />;
  if (!session) return <Redirect href="/partner" />;
  const lab = LAB_ROLES.includes(session.role);
  const staff = STAFF_ROLES.includes(session.role);
  if (!lab && !staff) return <Redirect href={homeForRole(session.role)} />;
  const owner = session.role !== 'phlebotomist';

  return (
    <Tabs
      initialRouteName={lab ? 'lab' : 'staff'}
      tabBar={(props) => <PillTabBar {...props} icons={ICONS} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="staff" options={{ title: 'Visits', href: staff ? undefined : null }} />
      <Tabs.Screen name="lab" options={{ title: 'Lab desk', href: lab ? undefined : null }} />
      <Tabs.Screen name="shop" options={{ title: 'My Shop', href: owner ? undefined : null }} />
      <Tabs.Screen name="partner-ads" options={{ title: 'Ads', href: owner ? undefined : null }} />
      <Tabs.Screen name="me" options={{ title: 'Account' }} />
    </Tabs>
  );
}
