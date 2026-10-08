import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StoreEarnings } from '@medrush/shared';
import { api } from '@/lib/api';
import { inr, problem } from '@/lib/market';
import { Note, Seg, Title } from '@/lib/marketUI';
import { PayoutsCard } from '@/lib/payoutsCard';
import { useTabBarSpace } from '@/lib/PillTabBar';
import { C, F, clay, ui } from '@/lib/theme';

type Span = '7' | '30' | '90';
const SPANS: Array<{ value: Span; label: string }> = [{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }];
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/**
 * Money tab: what the shop sold, Nabz's commission, what it earned and the cash
 * it already holds from cash-on-delivery, day by day and per order. Withdraw
 * from the same screen.
 */
export default function StoreMoney() {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const [span, setSpan] = useState<Span>('7');
  const [data, setData] = useState<StoreEarnings | null>(null);
  const [error, setError] = useState('');

  const load = useCallback((s: Span = span) => {
    api.vendorEarnings(Number(s)).then((r) => { setData(r.earnings); setError(''); }).catch((e) => setError(problem(e).message));
  }, [span]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const t = data?.totals;
  const peak = data ? Math.max(1, ...data.daily.map((d) => d.sales)) : 1;

  return (
    <View style={ui.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 10, gap: 14, paddingBottom: tabSpace }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => load()} tintColor={C.brand} />}>
        <Text style={s.title}>Money</Text>
        <Seg options={SPANS} value={span} onChange={(v) => { setSpan(v); setData(null); load(v); }} />
        {error ? <Note>{error}</Note> : null}
        {!data || !t ? <ActivityIndicator color={C.brand} /> : (
          <>
            <View style={s.hero} accessible accessibilityLabel={`You earned ${inr(t.payout)} from ${t.orders} orders`}>
              <Text style={s.heroLabel}>You earned</Text>
              <Text style={s.heroValue}>{inr(t.payout)}</Text>
              <Text style={s.heroSub}>from {t.orders} delivered order{t.orders === 1 ? '' : 's'}</Text>
            </View>
            <View style={s.grid}>
              <Stat label="Sales" value={inr(t.sales)} note="medicines sold" />
              <Stat label="Nabz commission" value={inr(t.commission)} note={data.orders[0]?.rate ? `${Math.round(data.orders[0].rate * 100)}% of sales` : 'per order'} />
              <Stat label="Cash you collected" value={inr(t.cashCollected)} note="cash orders, already with you" />
              <Stat label="Paid to your bank" value={inr(t.paidOut)} note="settled" />
            </View>

            <Title size={18}>Sales by day</Title>
            <View style={s.chart} accessible accessibilityLabel={`Sales by day, highest ${inr(peak)}`}>
              <View style={s.bars}>
                {data.daily.map((d) => (
                  <View key={d.date} style={s.barSlot}>
                    <View style={[s.bar, { height: `${Math.max(d.sales > 0 ? 4 : 1, (d.sales / peak) * 100)}%` }, d.sales === 0 && { backgroundColor: C.border }]} />
                  </View>
                ))}
              </View>
              <View style={s.axis}>
                <Text style={s.axisText}>{day(data.daily[0].date)}</Text>
                <Text style={s.axisText}>Best day {inr(peak === 1 ? 0 : peak)}</Text>
                <Text style={s.axisText}>{day(data.daily[data.daily.length - 1].date)}</Text>
              </View>
            </View>

            <PayoutsCard />

            <Title size={18}>Orders</Title>
            {data.orders.length === 0 ? <Text style={s.meta}>No delivered orders in this period yet.</Text> : data.orders.map((o) => (
              <View key={o.orderId} style={s.order}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.orderRef}>{o.ref || 'Order'}</Text>
                  <Text style={s.meta}>{day(o.date)} · sold {inr(o.sales)} · commission {inr(o.commission)}{o.cash ? ` · cash ${inr(o.cash)}` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={s.orderPay}>{inr(o.payout)}</Text>
                  <Text style={[s.pill, o.status === 'PAID' ? s.pillPaid : s.pillDue]}>{o.status === 'PAID' ? 'Paid' : 'Due'}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={s.stat} accessible accessibilityLabel={`${label}: ${value}, ${note}`}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.statNote}>{note}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: F.display, fontSize: 28, color: C.ink },
  hero: { backgroundColor: C.night, borderRadius: 26, padding: 18, gap: 2 },
  heroLabel: { fontFamily: F.semi, fontSize: 14, color: C.onNightMuted },
  heroValue: { fontFamily: F.displayHeavy, fontSize: 36, color: '#ffffff' },
  heroSub: { fontFamily: F.medium, fontSize: 13, color: C.onNightMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, backgroundColor: C.card, borderRadius: 20, padding: 14, gap: 2, ...clay },
  statLabel: { fontFamily: F.bold, fontSize: 13, color: C.inkSoft },
  statValue: { fontFamily: F.display, fontSize: 22, color: C.ink },
  statNote: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  chart: { backgroundColor: C.card, borderRadius: 20, padding: 14, gap: 8, ...clay },
  bars: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: C.brand, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontFamily: F.medium, fontSize: 11, color: C.muted },
  order: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 18, padding: 14, ...clay },
  orderRef: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  orderPay: { fontFamily: F.display, fontSize: 17, color: C.ink },
  meta: { fontFamily: F.medium, fontSize: 13, color: C.muted, lineHeight: 18 },
  pill: { fontFamily: F.heavy, fontSize: 11, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  pillPaid: { backgroundColor: C.mintSoft, color: C.mint },
  pillDue: { backgroundColor: C.amberSoft, color: C.amber }
});
