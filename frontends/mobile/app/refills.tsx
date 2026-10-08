import { useCallback, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Pill, RotateCcw } from 'lucide-react-native';
import type { RefillView } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { fmtDay, problem } from '@/lib/market';
import { Badge, Btn, Card, Chip, Chips, Empty, Meta, Note, Screen, Title, TopBar, mk } from '@/lib/marketUI';
import { Skeleton, success } from '@/lib/motion';
import { C, F } from '@/lib/theme';

/** Regular medicines: when they're due, order again in one tap, change or pause. */
export default function Refills() {
  const [rows, setRows] = useState<RefillView[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.myRefills().then((r) => { setRows(r.refills); setError(''); }).catch((e) => setError(problem(e).message)), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const change = async (r: RefillView, body: Parameters<typeof api.updateRefill>[1]) => {
    try { await api.updateRefill(r._id, body); success(); load(); } catch (e) { appAlert('That didn’t work', problem(e).message); }
  };
  const stop = (r: RefillView) => appAlert('Stop these reminders?', 'You can set them up again from any delivered order.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Stop', style: 'destructive', onPress: () => change(r, { status: 'CANCELLED' }) }
  ]);

  return (
    <Screen header={<TopBar title="Medicine refills" />} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
      {error ? <Note>{error}</Note> : null}
      {!rows && !error ? [0, 1].map((i) => <Skeleton key={i} height={140} radius={22} />) : null}
      {rows && rows.length === 0 ? <Empty title="No refill reminders yet" text="Open a delivered medicine order in Bookings and tap “Remind Me to Reorder”." action={<Btn variant="soft" label="Go to Bookings" onPress={() => router.push('/bookings')} />} /> : null}
      {rows?.map((r) => (
        <Card key={r._id} style={[{ gap: 12 }, r.dueSoon && { borderWidth: 2, borderColor: C.brand }]}>
          <View style={mk.row}>
            <View style={mk.tile}><Pill size={22} color={C.brand} /></View>
            <View style={{ flex: 1 }}>
              <Title size={17}>{r.items.map((i) => i.name).filter(Boolean).slice(0, 2).join(', ') || 'Your medicines'}{r.items.length > 2 ? ` +${r.items.length - 2}` : ''}</Title>
              <Meta>{r.vendor.name || 'Same store'} · every {r.everyDays} days</Meta>
            </View>
            {r.status === 'PAUSED' ? <Badge label="Paused" /> : r.dueSoon ? <Badge tone="red" label="Due soon" /> : null}
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.ink }}>Next due {fmtDay(r.nextDue)}</Text>
          <Btn icon={RotateCcw} label="Order Again Now" onPress={() => router.push({ pathname: '/pharmacy', params: { refill: r._id } })} />
          <Chips>
            {([15, 30, 60, 90] as const).map((d) => <Chip key={d} label={`Every ${d} days`} on={r.everyDays === d} onPress={() => change(r, { everyDays: d })} />)}
          </Chips>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small variant="ghost" label={r.status === 'PAUSED' ? 'Resume' : 'Pause'} onPress={() => change(r, { status: r.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED' })} />
            <Btn small variant="ghost" label="Stop" onPress={() => stop(r)} />
          </View>
        </Card>
      ))}
      <Meta>Prices, stock and prescriptions are checked again every time you order.</Meta>
    </Screen>
  );
}
