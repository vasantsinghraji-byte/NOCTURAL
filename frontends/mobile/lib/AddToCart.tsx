import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Minus, Plus } from 'lucide-react-native';
import { Text } from '@/lib/T';
import { Gloss } from './Skeuo';
import { C, F, R, depth } from './theme';

/**
 * ADD → − 1 + in one control. Adding the first unit morphs the button into the
 * stepper; every change makes the number bounce, so the tap is felt and seen.
 * Haptics come from the cart (lib/cart.tsx). Respects the system "reduce motion".
 * Pass `still` inside a Modal: Reanimated enter/exit animations there can lay the
 * whole modal out at 0,0 on Android when it is reopened.
 */
export function AddToCart({ qty, name, onAdd, onRemove, disabled, size = 'md', style, still }: {
  qty: number; name: string; onAdd: () => void; onRemove: () => void; disabled?: boolean; size?: 'md' | 'lg'; style?: StyleProp<ViewStyle>; still?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const reduce = reduceMotion || !!still;
  const bump = useSharedValue(1);
  const last = useRef(qty);
  useEffect(() => {
    if (qty !== last.current && qty > 0 && !reduceMotion) {
      bump.value = withSequence(withTiming(1.28, { duration: 90 }), withSpring(1, { damping: 9, stiffness: 260 }));
    }
    last.current = qty;
  }, [qty, reduceMotion, bump]);
  const qtyStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const h = size === 'lg' ? 48 : 36;

  if (!qty) {
    return (
      <Animated.View entering={reduce ? undefined : FadeIn.duration(150)} style={style}>
        <Pressable onPress={onAdd} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Add ${name}`} accessibilityState={{ disabled: !!disabled }}
          style={({ pressed }) => [s.add, { minHeight: h }, pressed && s.addPressed, disabled && { opacity: 0.5 }]}>
          <Text style={[s.addText, size === 'lg' && { fontSize: 15 }]}>ADD</Text>
        </Pressable>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={reduce ? undefined : ZoomIn.springify().damping(14).stiffness(240)} exiting={reduce ? undefined : FadeOut.duration(120)}
      style={[s.stepper, { minHeight: h }, style]} accessibilityLabel={`${name}, ${qty} in cart`}>
      <Gloss radius={R.sm} />
      <Pressable onPress={onRemove} hitSlop={6} style={[s.btn, { minHeight: h }]} accessibilityRole="button" accessibilityLabel={`Remove one ${name}`}>
        <Minus size={size === 'lg' ? 18 : 16} color={C.onBrand} strokeWidth={2.4} />
      </Pressable>
      <Animated.View style={qtyStyle}>
        <Text style={[s.qty, size === 'lg' && { fontSize: 16 }]}>{qty}</Text>
      </Animated.View>
      <Pressable onPress={onAdd} disabled={disabled} hitSlop={6} style={[s.btn, { minHeight: h }]} accessibilityRole="button" accessibilityLabel={`Add one more ${name}`}>
        <Plus size={size === 'lg' ? 18 : 16} color={C.onBrand} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  );
}

/** A placeholder of the same height, while the storefront loads. */
export function AddToCartPlaceholder({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return <View style={{ minHeight: size === 'lg' ? 48 : 36, borderRadius: R.sm, backgroundColor: C.cardAlt }} />;
}

const s = StyleSheet.create({
  add: { borderRadius: R.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.brand, backgroundColor: C.card, boxShadow: `inset 0 -2px 0 rgba(${C.tint},0.12), 0 4px 10px -6px rgba(${C.tint},0.5)` },
  addPressed: { backgroundColor: C.brandSoft, boxShadow: 'none', transform: [{ scale: 0.97 }] },
  addText: { color: C.brand, fontFamily: F.heavy, fontSize: 13, letterSpacing: 0.6 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: R.sm, backgroundColor: C.brand, ...depth.button },
  btn: { width: 36, alignItems: 'center', justifyContent: 'center' },
  qty: { color: C.onBrand, fontFamily: F.bold, fontSize: 14, minWidth: 18, textAlign: 'center' }
});
