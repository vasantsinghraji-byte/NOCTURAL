import { Redirect, Tabs } from 'expo-router';
import { Bike, ClipboardList, FlaskConical, House, Megaphone, Package, Store, Stethoscope, UserRound, Wallet, type LucideIcon } from 'lucide-react-native';
import { homeForRole, useAuth } from '@/lib/auth';
import { LoadingScreen } from '@/lib/LoadingScreen';
import { PillTabBar } from '@/lib/PillTabBar';
import { initialPartnerTab, isPartnerRole, partnerTabsFor, type PartnerTab } from '@/lib/partnerTabs';

const ICONS: Record<string, LucideIcon> = {
  staff: Stethoscope, lab: FlaskConical, rider: Bike, shop: Store, 'partner-ads': Megaphone, me: UserRound,
  store: House, vendor: ClipboardList, stock: Package, earnings: Wallet
};

/**
 * Partner app home: everything up front in a bottom bar instead of behind
 * header buttons. Which tabs each role sees lives in lib/partnerTabs.ts
 * (unit-tested): nurses and physios get Visits, labs the Lab desk, riders
 * Deliveries, pharmacies Today / Orders / Stock / Money; shop owners also get
 * My Shop and Ads.
 */
export default function PartnerTabs() {
  const { ready, session } = useAuth();
  if (!ready) return <LoadingScreen />;
  if (!session) return <Redirect href="/partner" />;
  if (!isPartnerRole(session.role)) return <Redirect href={homeForRole(session.role)} />;
  const visible = new Set<PartnerTab>(partnerTabsFor(session.role));
  const tab = (name: PartnerTab) => (visible.has(name) ? undefined : null);

  return (
    <Tabs
      initialRouteName={initialPartnerTab(session.role)}
      tabBar={(props) => <PillTabBar {...props} icons={ICONS} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="store" options={{ title: 'Today', href: tab('store') }} />
      <Tabs.Screen name="vendor" options={{ title: 'Orders', href: tab('vendor') }} />
      <Tabs.Screen name="stock" options={{ title: 'Stock', href: tab('stock') }} />
      <Tabs.Screen name="earnings" options={{ title: 'Money', href: tab('earnings') }} />
      <Tabs.Screen name="staff" options={{ title: 'Visits', href: tab('staff') }} />
      <Tabs.Screen name="lab" options={{ title: 'Lab desk', href: tab('lab') }} />
      <Tabs.Screen name="rider" options={{ title: 'Deliveries', href: tab('rider') }} />
      <Tabs.Screen name="shop" options={{ title: 'My Shop', href: tab('shop') }} />
      <Tabs.Screen name="partner-ads" options={{ title: 'Ads', href: tab('partner-ads') }} />
      <Tabs.Screen name="me" options={{ title: 'Account', href: tab('me') }} />
    </Tabs>
  );
}
