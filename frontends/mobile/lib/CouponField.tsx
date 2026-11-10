import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { TicketPercent, X } from 'lucide-react-native';
import type { CouponPreview, CouponService } from '@medrush/shared';
import { Text } from '@/lib/T';
import { api, describeNetworkError } from '@/lib/api';
import { C, F, R } from '@/lib/theme';

/**
 * "Have a coupon?" at checkout. A preview only: the server checks the code
 * again when the order is placed. A changed amount re-checks the code.
 */
export function CouponField({ service, amount, value, onChange }: {
  service: CouponService;
  amount: number;
  value: CouponPreview | null;
  onChange: (coupon: CouponPreview | null) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(raw: string) {
    const clean = raw.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      onChange((await api.checkCoupon(clean, service, amount)).coupon);
    } catch (e) {
      onChange(null);
      setError(describeNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  const appliedCode = value?.code;
  useEffect(() => {
    if (appliedCode) apply(appliedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  if (value) {
    return (
      <View style={styles.applied} accessibilityRole="summary">
        <TicketPercent size={18} color={C.mint} />
        <Text style={styles.appliedText}><Text style={styles.bold}>{value.code}</Text> applied · you save ₹{value.discount}</Text>
        <Pressable onPress={() => { onChange(null); setCode(''); }} accessibilityRole="button" accessibilityLabel={`Remove code ${value.code}`} hitSlop={10}>
          <X size={18} color={C.muted} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(t) => { setCode(t.toUpperCase().replace(/\s/g, '')); setError(null); }}
          placeholder="Have a coupon? Enter code"
          placeholderTextColor={C.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          returnKeyType="done"
          onSubmitEditing={() => apply(code)}
          accessibilityLabel="Coupon code"
        />
        <Pressable style={[styles.btn, (!code.trim() || busy) && { opacity: 0.5 }]} disabled={!code.trim() || busy} onPress={() => apply(code)} accessibilityRole="button">
          {busy ? <ActivityIndicator color={C.brand} /> : <Text style={styles.btnText}>Apply</Text>}
        </Pressable>
      </View>
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, color: C.ink, fontFamily: F.semi, fontSize: 15, letterSpacing: 1 },
  btn: { borderRadius: R.md, borderWidth: 1.5, borderColor: C.brand, paddingHorizontal: 16, paddingVertical: 11, minWidth: 80, alignItems: 'center' },
  btnText: { fontFamily: F.bold, color: C.brand, fontSize: 15 },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.mintSoft, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10 },
  appliedText: { flex: 1, color: C.ink, fontFamily: F.medium, fontSize: 14 },
  bold: { fontFamily: F.bold },
  error: { color: C.rose, fontFamily: F.medium, fontSize: 13 }
});
