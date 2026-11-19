import { Pressable, StyleSheet, View } from 'react-native';
import type { StorefrontItem } from '@medrush/shared';
import { Text } from '@/lib/T';
import { MedicineArt } from './MedicineArt';
import { AddToCart } from './AddToCart';
import { inr } from './market';
import { C, F, R } from './theme';

/** One medicine as a list row: art, name, salt, price and the add control. Tap opens the product. */
export function ProductRow({ item, qty, onAdd, onRemove, onOpen, note }: {
  item: StorefrontItem; qty: number; onAdd: () => void; onRemove: () => void; onOpen: () => void; note?: string;
}) {
  const m = item.medicine;
  const off = item.mrp > item.sellingPrice ? Math.round(((item.mrp - item.sellingPrice) / item.mrp) * 100) : 0;
  return (
    <View style={s.row}>
      <Pressable onPress={onOpen} style={({ pressed }) => [s.main, pressed && { opacity: 0.7 }]} accessibilityRole="button"
        accessibilityLabel={`${m.name}, ${inr(item.sellingPrice)}${m.requiresPrescription ? ', prescription needed' : ''}. Open details`}>
        <MedicineArt name={m.name} form={m.form} category={m.category} height={64} style={s.art} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.name} numberOfLines={2}>{m.name}</Text>
          {m.genericName ? <Text style={s.meta} numberOfLines={1}>{m.genericName}</Text> : null}
          <View style={s.priceRow}>
            <Text style={s.price}>{inr(item.sellingPrice)}</Text>
            {off >= 5 ? <Text style={s.mrp}>{inr(item.mrp)}</Text> : null}
            {off >= 5 ? <Text style={s.off}>{off}% off</Text> : null}
            {m.requiresPrescription ? <Text style={s.rx}>Rx</Text> : null}
          </View>
          {note ? <Text style={s.note} numberOfLines={1}>{note}</Text> : null}
        </View>
      </Pressable>
      <View style={{ width: 96 }}>
        {item.inStock
          ? <AddToCart qty={qty} name={m.name} onAdd={onAdd} onRemove={onRemove} />
          : <Text style={s.out}>Out of stock</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  art: { width: 72, borderRadius: R.md },
  name: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  meta: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  price: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  mrp: { fontFamily: F.regular, fontSize: 12, color: C.muted, textDecorationLine: 'line-through' },
  off: { fontFamily: F.bold, fontSize: 11.5, color: C.mint },
  rx: { fontFamily: F.bold, fontSize: 10.5, color: C.brand, borderWidth: 1, borderColor: C.border, borderRadius: 4, paddingHorizontal: 4, overflow: 'hidden' },
  note: { fontFamily: F.semi, fontSize: 11.5, color: C.mint },
  out: { fontFamily: F.semi, fontSize: 12, color: C.muted, textAlign: 'center' }
});
