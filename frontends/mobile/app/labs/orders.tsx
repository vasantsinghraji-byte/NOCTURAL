import { useCallback, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, FlaskConical } from 'lucide-react-native';
import type { LabOrderView } from '@medrush/shared';
import { api } from '@/lib/api';
import { LAB_STATUS_LABEL, fmtDay, fmtTime, inr, problem } from '@/lib/market';
import { Badge, Btn, Empty, Meta, Note, Screen, TopBar, mk } from '@/lib/marketUI';
import { PressScale, Rise, Skeleton } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

/** My lab bookings. */
export default function MyLabOrders() {
  const [orders, setOrders] = useState<LabOrderView[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.myLabOrders().then((r) => setOrders(r.orders)).catch((e) => { setError(problem(e).message); setOrders([]); }), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen header={<TopBar title="My lab tests" />} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
      {error ? <Note>{error}</Note> : null}
      {!orders ? [0, 1, 2].map((i) => <Skeleton key={i} height={86} radius={22} />) : null}
      {orders && orders.length === 0 && !error ? <Empty title="No lab tests booked" text="Compare labs and book a home collection in a minute." action={<Btn label="Book Lab Tests" onPress={() => router.push('/labs')} />} /> : null}
      {orders?.map((o, i) => (
        <Rise key={o._id} delay={Math.min(i, 6) * 40}>
          <PressScale onPress={() => router.push(`/labs/order/${o._id}`)} style={[ui.card, mk.row]} accessibilityRole="button" accessibilityLabel={`${o.store?.name || 'Lab'}, ${LAB_STATUS_LABEL[o.status]}`}>
            <View style={mk.tile}><FlaskConical size={22} color={C.brand} /></View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{o.store?.name || 'Lab'}</Text>
              <Meta>{o.items.length} test{o.items.length > 1 ? 's' : ''} · {fmtDay(o.slot.date)}, {fmtTime(o.slot.time)} · {inr(o.amounts.total)}</Meta>
              <Badge tone={o.status === 'REPORT_READY' ? 'green' : o.status === 'SAMPLE_REJECTED' ? 'red' : o.status === 'CANCELLED' ? 'neutral' : 'amber'} label={LAB_STATUS_LABEL[o.status]} />
            </View>
            <ChevronRight size={18} color={C.faint} />
          </PressScale>
        </Rise>
      ))}
    </Screen>
  );
}
