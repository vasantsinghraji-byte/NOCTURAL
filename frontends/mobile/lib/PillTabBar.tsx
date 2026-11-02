import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { tap } from './motion';
import { C, F, IS_DARK } from './theme';
import { isHiddenTab } from './partnerTabs';

/**
 * Bottom tab bar shared by the customer and partner apps, docked to the
 * bottom edge like delivery apps: a flat surface with a hairline on top, an
 * icon and a label per tab, the active tab in the brand colour on a soft
 * pill (raspberry in Nabz, green in Nabz Partner). (The file keeps its old name so the layouts don't change.)
 */
export const TAB_BAR_HEIGHT = 60;

/** Bottom space a tab screen leaves so its last item clears the bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + insets.bottom + 12;
}

export function PillTabBar({ state, descriptors, navigation, icons }: BottomTabBarProps & { icons: Record<string, LucideIcon> }) {
  const insets = useSafeAreaInsets();
  // Tabs hidden with `href: null` aren't shown. expo-router removes `href`
  // from the options and marks hidden tabs with display: 'none' instead
  // (checking `href` let every tab through: nurses saw the pharmacy tabs).
  const routes = state.routes.filter((r) => !isHiddenTab(descriptors[r.key].options));
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
      style={({ pressed }) => [s.tab, pressed && { opacity: 0.7 }]}>
      <View style={[s.pill, focused && { backgroundColor: C.brandSoft }]}>
        {Icon ? <Icon size={22} color={color} strokeWidth={focused ? 2.2 : 1.8} /> : null}
      </View>
      <Text style={[s.label, { color }, focused && { fontFamily: F.bold }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row',
    backgroundColor: C.tabBar, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
    boxShadow: IS_DARK ? '0 -8px 20px rgba(0,0,0,0.5)' : `0 -8px 24px -10px rgba(${C.tint},0.18)`
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: TAB_BAR_HEIGHT },
  pill: { paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 },
  label: { fontFamily: F.semi, fontSize: 11 }
});
