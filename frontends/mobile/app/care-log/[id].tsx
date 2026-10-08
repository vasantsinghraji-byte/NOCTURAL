import { useCallback, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { UserRound } from 'lucide-react-native';
import type { CareLogView } from '@medrush/shared';
import { api } from '@/lib/api';
import { CallMeBack } from '@/lib/CallMeBack';
import { CareLogTimeline } from '@/lib/CareLogTimeline';
import { fmtDay, fmtTime, problem } from '@/lib/market';
import { Card, Empty, Meta, Screen, Title, TopBar, mk } from '@/lib/marketUI';
import { Skeleton } from '@/lib/motion';
import { C, F } from '@/lib/theme';

const nice = (t: string) => t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** A visit's care log for the customer and their Care Circle. Pull to refresh while the visit runs. */
export default function VisitCareLog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [log, setLog] = useState<CareLogView | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.visitCareLog(String(id)).then((r) => { setLog(r.log); setError(''); }).catch((e) => setError(problem(e).message)), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen header={<TopBar title="Care log" />} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
      {error ? <Empty title={error} /> : null}
      {!log && !error ? <Skeleton height={220} radius={24} /> : null}
      {log ? (
        <>
          <Card style={[mk.row, { gap: 14 }]}>
            <View style={mk.tile}><UserRound size={22} color={C.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.display, fontSize: 19, color: C.ink }}>{nice(log.serviceType)}</Text>
              <Meta>{fmtDay(String(log.scheduledDate).slice(0, 10))}, {fmtTime(log.scheduledTime)}{log.professional ? ` · ${log.professional}` : ''}</Meta>
            </View>
          </Card>
          <Card style={{ gap: 6 }}>
            <Title size={18}>What happened</Title>
            <CareLogTimeline log={log} />
          </Card>
          <Meta>Readings are written by the professional during the visit. They are not a diagnosis; talk to your doctor about anything worrying.</Meta>
          <CallMeBack topic="VISIT" context={{ kind: 'VISIT', id: String(id) }} label="Question about this visit? We’ll call" />
        </>
      ) : null}
    </Screen>
  );
}
