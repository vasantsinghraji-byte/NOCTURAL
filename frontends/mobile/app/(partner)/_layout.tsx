import { Redirect, Tabs } from 'expo-router';
import { Bike, ClipboardList, FlaskConical, House, Megaphone, Package, Store, Stethoscope, UserRound, Wallet, type LucideIcon } from 'lucide-react-native';
import { STAFF_ROLES, homeForRole, useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/lib/LoadingScreen';
import { PillTabBar } from '@/lib/PillTabBar';

const ICONS: Record<string, LucideIcon> = {
  staff: Stethoscope, lab: FlaskConical, rider: Bike, shop: Store, 'partner-ads': Megaphone, me: UserRound,
  store: House, vendor: ClipboardList, stock: Package, earnings: Wallet
};
const LAB_ROLES = ['lab_partner', 'phlebotomist'];

/**
 * Partner app home: everything up front in a bottom bar instead of behind
 * header buttons. Nurses and physios get Visits; labs get the Lab desk. Shop
 * owners also get My Shop and Ads (a phlebotomist works inside a lab's shop);
 * delivery partners get Deliveries. Pharmacy stores get Today, Orders, Stock
 * and Money.
 */
export default function PartnerTabs() {
  const { ready, session } = useAuth();
  if (!ready) return <LoadingScreen />;
  if (!session) return <Redirect href="/partner" />;
  const lab = LAB_ROLES.includes(session.role);
  const staff = STAFF_ROLES.includes(session.role);
  const rider = session.role === 'delivery_partner';
  const pharmacy = session.role === 'pharmacy_vendor';
  if (!lab && !staff && !rider && !pharmacy) return <Redirect href={homeForRole(session.role)} />;
  // Riders don't run a care shop; a phlebotomist works inside a lab's shop.
  const owner = !rider && !pharmacy && session.role !== 'phlebotomist';
  const tab = (on: boolean) => (on ? undefined : null);

  return (
    <Tabs
      initialRouteName={pharmacy ? 'store' : rider ? 'rider' : lab ? 'lab' : 'staff'}
      tabBar={(props) => <PillTabBar {...props} icons={ICONS} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="store" options={{ title: 'Today', href: tab(pharmacy) }} />
      <Tabs.Screen name="vendor" options={{ title: 'Orders', href: tab(pharmacy) }} />
      <Tabs.Screen name="stock" options={{ title: 'Stock', href: tab(pharmacy) }} />
      <Tabs.Screen name="earnings" options={{ title: 'Money', href: tab(pharmacy) }} />
      <Tabs.Screen name="staff" options={{ title: 'Visits', href: tab(staff) }} />
      <Tabs.Screen name="lab" options={{ title: 'Lab desk', href: tab(lab) }} />
      <Tabs.Screen name="rider" options={{ title: 'Deliveries', href: tab(rider) }} />
      <Tabs.Screen name="shop" options={{ title: 'My Shop', href: tab(owner) }} />
      <Tabs.Screen name="partner-ads" options={{ title: 'Ads', href: tab(owner) }} />
      <Tabs.Screen name="me" options={{ title: 'Account' }} />
    </Tabs>
  );
}
