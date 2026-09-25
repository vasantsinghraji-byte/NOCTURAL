import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banknote, ChevronRight, CreditCard, Landmark, Smartphone } from 'lucide-react-native';
import { PAY_METHOD_LABELS, type PayMethod } from '@medrush/shared';
import { inr } from './care';
import { C, F, clay } from './theme';

const UPI_APPS: Array<{ method: PayMethod; initial: string; tint: string }> = [
  { method: 'gpay', initial: 'G', tint: '#4285f4' },
  { method: 'phonepe', initial: 'Pe', tint: '#5f259f' },
  { method: 'paytm', initial: 'P', tint: '#00b9f1' }
];

/**
 * Nabz checkout sheet: pick how to pay before paying (UPI apps first, like
 * quick-commerce apps). Online rows only appear when the server has online
 * payment switched on; cash only when the order allows it.
 */
export function PaymentSheet({ visible, amount, online, allowCash = true, onPick, onClose }: {
  visible: boolean;
  /** Known total (e.g. paying an existing order); omitted before the order exists. */
  amount?: number;
  online: boolean;
  allowCash?: boolean;
  onPick: (method: PayMethod) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const Row = ({ method, icon, sub }: { method: PayMethod; icon: ReactNode; sub?: string }) => (
    <Pressable onPress={() => onPick(method)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="button" accessibilityLabel={`Pay with ${PAY_METHOD_LABELS[method]}`}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowText}>{PAY_METHOD_LABELS[method]}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <ChevronRight size={18} color={C.muted} />
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => undefined}>
          <View style={styles.grabber} />
          <Text style={styles.title}>{amount !== undefined ? `Pay ${inr(amount)}` : 'How would you like to pay?'}</Text>
          <ScrollView contentContainerStyle={{ gap: 10 }} style={{ maxHeight: 520 }}>
            {online && (
              <>
                <Text style={styles.section}>UPI</Text>
                <View style={styles.appsRow}>
                  {UPI_APPS.map((a) => (
                    <Pressable key={a.method} onPress={() => onPick(a.method)} style={({ pressed }) => [styles.app, pressed && { opacity: 0.85 }]}
                      accessibilityRole="button" accessibilityLabel={`Pay with ${PAY_METHOD_LABELS[a.method]}`}>
                      <View style={[styles.appBadge, { backgroundColor: a.tint }]}><Text style={styles.appInitial}>{a.initial}</Text></View>
                      <Text style={styles.appName} numberOfLines={1}>{PAY_METHOD_LABELS[a.method]}</Text>
                    </Pressable>
                  ))}
                </View>
                <Row method="upi" icon={<Smartphone size={20} color={C.brand} />} sub="BHIM, Cred, bank apps and more" />
                <Text style={styles.section}>Cards and banks</Text>
                <Row method="card" icon={<CreditCard size={20} color={C.brand} />} sub="Visa, Mastercard, RuPay" />
                <Row method="netbanking" icon={<Landmark size={20} color={C.brand} />} />
              </>
            )}
            {allowCash && (
              <>
                <Text style={styles.section}>Pay later</Text>
                <Row method="cod" icon={<Banknote size={20} color={C.brand} />} sub="Cash or UPI to the delivery person" />
              </>
            )}
            {!online && <Text style={styles.note}>Online payment isn’t switched on yet. You can pay on delivery.</Text>}
          </ScrollView>
          <Pressable onPress={onClose} style={{ alignItems: 'center', padding: 6 }}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.border },
  title: { fontFamily: F.display, fontSize: 28, lineHeight: 32, color: C.ink },
  section: { fontFamily: F.heavy, fontSize: 12, color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 4 },
  appsRow: { flexDirection: 'row', gap: 10 },
  app: { flex: 1, alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 6, ...clay },
  appBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  appInitial: { color: '#ffffff', fontFamily: F.heavy, fontSize: 16 },
  appName: { fontFamily: F.bold, fontSize: 12, color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 14, ...clay },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  rowSub: { fontFamily: F.medium, fontSize: 12, color: C.muted, marginTop: 2 },
  note: { fontFamily: F.medium, fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 6 },
  cancel: { fontFamily: F.bold, color: C.muted, fontSize: 15 }
});
