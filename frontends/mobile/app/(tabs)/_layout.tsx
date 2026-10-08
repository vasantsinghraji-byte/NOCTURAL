import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, HeartPulse, House, ShoppingBag, UserRound, type LucideIcon } from 'lucide-react-native';
import { homeForRole, useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { tap } from '@/lib/motion';
import { IS_PARTNER_APP } from '@/lib/variant';
import { C, F } from '@/lib/theme';

const ICONS: Record<string, LucideIcon> = { index: House, care: HeartPulse, pharmacy: ShoppingBag, bookings: CalendarDays, account: UserRound };

/** Floating dark pill: the active tab grows into a red pill with its label. */
function PillTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 10) + 2 }]}>
      <View style={s.bar} accessibilityRole="tablist">
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const { options } = descriptors[route.key];
          const label = String(options.title ?? route.name);
          const onPress = () => {
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) { tap(); navigation.navigate(route.name, route.params); }
          };
          return <TabButton key={route.key} icon={ICONS[route.name] || House} label={label} focused={focused} onPress={onPress} />;
        })}
      </View>
    </View>
  );
}

function TabButton({ icon: Icon, label, focused, onPress }: { icon: LucideIcon; label: string; focused: boolean; onPress: () => void }) {
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: focused ? 1 : 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [focused, v]);
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={{ flexGrow: focused ? 1.6 : 1, alignItems: 'center' }} hitSlop={4}>
      <Animated.View style={[s.tab, {
        backgroundColor: v.interpolate({ inputRange: [0, 1], outputRange: ['rgba(194,31,61,0)', 'rgba(194,31,61,1)'] }),
        paddingHorizontal: v.interpolate({ inputRange: [0, 1], outputRange: [12, 16] })
      }]}>
        <Icon size={21} color={focused ? '#ffffff' : 'rgba(255,255,255,0.62)'} strokeWidth={focused ? 2.4 : 1.9} />
        {focused ? <Text style={s.label} numberOfLines={1}>{label}</Text> : null}
      </Animated.View>
    </Pressable>
  );
}

/** Customer app: Home books medical staff (Uber/Rapido style); Care is the physio / home care / lab marketplace. */
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
    <Tabs tabBar={(props) => <PillTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('tab.home') }} />
      <Tabs.Screen name="care" options={{ title: t('tab.care') }} />
      <Tabs.Screen name="pharmacy" options={{ title: t('tab.pharmacy') }} />
      <Tabs.Screen name="bookings" options={{ title: t('tab.bookings') }} />
      <Tabs.Screen name="account" options={{ title: t('tab.account') }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  // In the layout flow (not absolute) so screens with bottom bars, like the cart, sit above it.
  wrap: { paddingHorizontal: 14, paddingTop: 6, alignItems: 'center', backgroundColor: C.bg },
  bar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.tabBar, borderRadius: 999, padding: 7, gap: 2, width: '100%', maxWidth: 460,
    boxShadow: '0 14px 30px -10px rgba(31,10,18,0.55)'
  },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 48, borderRadius: 999 },
  label: { color: '#ffffff', fontFamily: F.heavy, fontSize: 13 }
});
