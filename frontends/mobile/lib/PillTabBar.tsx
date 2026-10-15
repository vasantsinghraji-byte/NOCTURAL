import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { tap } from './motion';
import { C, F } from './theme';

/**
 * Bottom tab bar shared by the customer and partner apps, docked to the
 * bottom edge like delivery apps: a flat surface with a hairline on top, an
 * icon and a label per tab, the active tab in brand red with a short bar
 * above it. (The file keeps its old name so the layouts don't change.)
 */
export const TAB_BAR_HEIGHT = 60;

/** Bottom space a tab screen leaves so its last item clears the bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom + 12;
}

export function PillTabBar({ state, descriptors, navigation, icons }: BottomTabBarProps & { icons: Record<string, LucideIcon> }) {
  const insets = useSafeAreaInsets();
  // Tabs hidden with `href: null` aren't shown.
  const routes = state.routes.filter((r) => (descriptors[r.key].options as { href?: unknown }).href !== null);
  return (
    <View style={[s.bar, { paddingBottom: insets.bottom, height: TAB_BAR_HEIGHT + insets.bottom }]} accessibilityRole="tablist">
      {routes.map((route) => {
        const focused = state.routes[state.index]?.key === route.key;
        const { options } = descriptors[route.key];
        const label = String(options.title ?? route.name);
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) { tap(); navigation.navigate(route.name, route.params); }
        };
        return <TabButton key={route.key} icon={icons[route.name]} label={label} focused={focused} onPress={onPress} />;
      })}
    </View>
  );
}

function TabButton({ icon: Icon, label, focused, onPress }: { icon?: LucideIcon; label: string; focused: boolean; onPress: () => void }) {
  const color = focused ? C.brand : C.muted;
  // Every tab keeps its word under the icon: icons alone are easy to misread.
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}
      style={({ pressed }) => [s.tab, pressed && { backgroundColor: C.cardAlt }]}>
      <View style={[s.indicator, focused && { backgroundColor: C.brand }]} />
      {Icon ? <Icon size={22} color={color} strokeWidth={focused ? 2.2 : 1.8} /> : null}
      <Text style={[s.label, { color }, focused && { fontFamily: F.bold }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row',
    backgroundColor: C.tabBar, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: TAB_BAR_HEIGHT },
  indicator: { position: 'absolute', top: 0, width: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: 'transparent' },
  label: { fontFamily: F.semi, fontSize: 11 }
});
