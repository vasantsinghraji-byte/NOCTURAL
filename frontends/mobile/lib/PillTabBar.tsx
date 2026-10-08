import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { tap } from './motion';
import { C, F, IS_DARK } from './theme';

/**
 * Floating pill tab bar shared by the customer and partner apps: a light
 * surface in the app theme, floating over the content with nothing behind it.
 * Every tab shows its label; the active one sits in a crimson pill.
 */
export const TAB_BAR_HEIGHT = 70;

/** Bottom space a tab screen leaves so its last item clears the floating bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, 10) + 24;
}

export function PillTabBar({ state, descriptors, navigation, icons }: BottomTabBarProps & { icons: Record<string, LucideIcon> }) {
  const insets = useSafeAreaInsets();
  // Tabs hidden with `href: null` aren't shown.
  const routes = state.routes.filter((r) => (descriptors[r.key].options as { href?: unknown }).href !== null);
  return (
    <View style={[s.wrap, { bottom: Math.max(insets.bottom, 10) + 4 }]} pointerEvents="box-none">
      <View style={s.bar} accessibilityRole="tablist">
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
    </View>
  );
}

function TabButton({ icon: Icon, label, focused, onPress }: { icon?: LucideIcon; label: string; focused: boolean; onPress: () => void }) {
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: focused ? 1 : 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [focused, v]);
  // Every tab keeps its word under the icon: icons alone are easy to misread.
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} style={{ flex: 1, alignItems: 'center' }} hitSlop={4}>
      <Animated.View style={[s.tab, { backgroundColor: v.interpolate({ inputRange: [0, 1], outputRange: [IS_DARK ? 'rgba(255,92,120,0)' : 'rgba(194,31,61,0)', C.brand] }) }]}>
        {Icon ? <Icon size={22} color={focused ? '#ffffff' : C.inkSoft} strokeWidth={focused ? 2.4 : 2} /> : null}
        <Text style={[s.label, { color: focused ? '#ffffff' : C.inkSoft }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  // Absolutely positioned and transparent: only the pill itself is visible.
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', backgroundColor: 'transparent' },
  bar: {
    flexDirection: 'row', alignItems: 'center', height: TAB_BAR_HEIGHT, backgroundColor: C.card, borderRadius: 30, paddingHorizontal: 6, gap: 2,
    width: '100%', maxWidth: 480, borderWidth: IS_DARK ? 1 : 0, borderColor: C.border,
    boxShadow: IS_DARK ? '0 12px 28px -8px rgba(0,0,0,0.7)' : '0 12px 30px -10px rgba(92,13,34,0.28), 0 2px 6px rgba(92,13,34,0.06)'
  },
  tab: { alignItems: 'center', justifyContent: 'center', gap: 2, height: 56, minWidth: 60, paddingHorizontal: 8, borderRadius: 22 },
  label: { fontFamily: F.bold, fontSize: 11 }
});
