import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { Text } from '@/lib/T';
import { Gloss } from './Skeuo';
import { useReducedMotion } from './motion';
import { C, F, R, depth } from './theme';

/**
 * ADD → − 1 + in one control. Adding the first unit pops the stepper in; every
 * change makes the number bounce, so the tap is felt and seen. Haptics come from
 * the cart (lib/cart.tsx). Respects the system "reduce motion".
 */
export function AddToCart({ qty, name, onAdd, onRemove, disabled, size = 'md', style }: {
  qty: number; name: string; onAdd: () => void; onRemove: () => void; disabled?: boolean; size?: 'md' | 'lg'; style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const bump = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const last = useRef(qty);
  useEffect(() => {
    if (qty !== last.current && qty > 0 && !reduce) {
      if (last.current === 0) {
        pop.setValue(0.85);
        Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 240, mass: 1 }).start();
      }
      Animated.sequence([
        Animated.timing(bump, { toValue: 1.28, duration: 90, useNativeDriver: true }),
        Animated.spring(bump, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 260, mass: 1 })
      ]).start();
    }
    last.current = qty;
  }, [qty, reduce, bump, pop]);
  const h = size === 'lg' ? 48 : 36;

  if (!qty) {
    return (
      <View style={style}>
        <Pressable onPress={onAdd} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Add ${name}`} accessibilityState={{ disabled: !!disabled }}
          style={({ pressed }) => [s.add, { minHeight: h }, pressed && s.addPressed, disabled && { opacity: 0.5 }]}>
          <Text style={[s.addText, size === 'lg' && { fontSize: 15 }]}>ADD</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <Animated.View style={[s.stepper, { minHeight: h }, style, { transform: [{ scale: pop }] }]} accessibilityLabel={`${name}, ${qty} in cart`}>
      <Gloss radius={R.sm} />
      <Pressable onPress={onRemove} hitSlop={6} style={[s.btn, { minHeight: h }]} accessibilityRole="button" accessibilityLabel={`Remove one ${name}`}>
        <Minus size={size === 'lg' ? 18 : 16} color={C.onBrand} strokeWidth={2.4} />
      </Pressable>
      <Animated.View style={{ transform: [{ scale: bump }] }}>
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
