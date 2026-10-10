import { useCallback, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarClock, CalendarHeart, ClipboardList, FlaskConical, HeartPulse, Pill, UserRound } from 'lucide-react-native';
import type { FamilyMemberCare } from '@medrush/shared';
import { api } from '@/lib/api';
import { setBookingFor } from '@/lib/bookingFor';
import { LAB_STATUS_LABEL, PLAN_STATUS_LABEL, SESSION_LABEL, fmtDay, fmtTime, problem } from '@/lib/market';
import { Badge, Btn, Card, Empty, Meta, Note, Screen, Title, TopBar, mk } from '@/lib/marketUI';
import { PressScale, Skeleton } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

const ACTIVE = ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const nice = (t: string) => t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** A family member's care, as their helper sees it, with booking for them one tap away. */
export default function FamilyMember() {
  const { id, name, relation } = useLocalSearchParams<{ id: string; name?: string; relation?: string }>();
  const [care, setCare] = useState<FamilyMemberCare | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api.familyMemberCare(String(id)).then((r) => { setCare(r); setError(''); }).catch((e) => setError(problem(e).message)), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const who = care?.member.name || name || 'Family member';
  const firstName = who.split(' ')[0];
  const bookFor = (path: '/care' | '/labs') => {
    setBookingFor({ name: who, relation: relation || undefined, memberId: String(id) });
    router.push(path);
  };
  const upcoming = care?.visits.filter((v) => ACTIVE.includes(v.status)) || [];
  const done = care?.visits.filter((v) => v.status === 'COMPLETED').slice(0, 4) || [];

  return (
    <Screen header={<TopBar title={who} />} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
      {error ? <Empty title={error} action={<Btn variant="ghost" label="Back" onPress={() => router.back()} />} /> : null}
      {!care && !error ? <Skeleton height={200} radius={24} /> : null}
      {care ? (
        <>
          <Card style={[mk.row, { gap: 14 }]}>
            <View style={[mk.tile, { width: 60, height: 60, borderRadius: 20 }]}><UserRound size={28} color={C.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.display, fontSize: 22, color: C.ink }}>{who}</Text>
              <Meta>{relation || 'Family'} · you get their visit updates</Meta>
            </View>
          </Card>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn icon={HeartPulse} label={`Book for ${firstName}`} onPress={() => bookFor('/care')} style={{ flex: 1 }} />
            <Btn variant="soft" icon={FlaskConical} label="Lab Test" onPress={() => bookFor('/labs')} />
          </View>

          <Title size={19}>Coming up</Title>
          {upcoming.length === 0 ? <Note tone="neutral">{`No visits booked for ${firstName}.`}</Note> : upcoming.map((v) => (
            <VisitRow key={v._id} v={v} />
          ))}

          {care.plans.length > 0 ? (
            <>
              <Title size={19}>Care plans</Title>
              {care.plans.map((p) => (
                <Card key={p._id} style={mk.row}>
                  <View style={mk.tile}><CalendarHeart size={20} color={C.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.ink }}>{p.serviceName}</Text>
                    <Meta>{p.store} · {p.sessionsCompleted}/{p.sessionsTotal} done</Meta>
                  </View>
                  <Badge tone={p.status === 'ACTIVE' ? 'green' : 'amber'} label={PLAN_STATUS_LABEL[p.status as 'ACTIVE'] || p.status} />
                </Card>
              ))}
            </>
          ) : null}

          {care.labOrders.length > 0 ? (
            <>
              <Title size={19}>Lab tests</Title>
              {care.labOrders.map((o) => (
                <Card key={o._id} style={mk.row}>
                  <View style={mk.tile}><FlaskConical size={20} color={C.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.ink }} numberOfLines={1}>{o.tests.join(', ')}</Text>
                    <Meta>{o.lab} · {fmtDay(o.slot.date)}, {fmtTime(o.slot.time)}</Meta>
                  </View>
                  <Badge tone={o.status === 'REPORT_READY' ? 'green' : 'neutral'} label={LAB_STATUS_LABEL[o.status as 'SCHEDULED'] || o.status} />
                </Card>
              ))}
              <Meta>Reports are private to {firstName}.</Meta>
            </>
          ) : null}

          {done.length > 0 ? (
            <>
              <Title size={19}>Recent visits</Title>
              {done.map((v) => <VisitRow key={v._id} v={v} />)}
            </>
          ) : null}
          <View style={[mk.row, { paddingHorizontal: 4 }]}><Pill size={16} color={C.muted} /><Meta style={{ flex: 1 }}>Medicine orders you place for {firstName} show in your own Bookings.</Meta></View>
        </>
      ) : null}
    </Screen>
  );
}

function VisitRow({ v }: { v: FamilyMemberCare['visits'][number] }) {
  const hasLog = ['IN_PROGRESS', 'COMPLETED'].includes(v.status);
  return (
    <PressScale disabled={!hasLog} onPress={() => router.push({ pathname: '/care-log/[id]', params: { id: v._id } })} style={[ui.card, { gap: 8 }]} accessibilityRole="button">
      <View style={mk.row}>
        <View style={mk.tile}><CalendarClock size={20} color={C.brand} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.ink }}>{nice(v.serviceType)}</Text>
          <Meta>{fmtDay(String(v.scheduledDate).slice(0, 10))}, {fmtTime(v.scheduledTime)}{v.professional ? ` · ${v.professional}` : ''}</Meta>
        </View>
        <Badge tone={v.status === 'COMPLETED' ? 'green' : v.status === 'IN_PROGRESS' || v.status === 'EN_ROUTE' ? 'red' : 'neutral'} label={SESSION_LABEL[v.status] || nice(v.status)} />
      </View>
      {hasLog ? <View style={mk.row}><ClipboardList size={15} color={C.brand} /><Text style={{ fontFamily: F.bold, fontSize: 14, color: C.brand }}>See care log</Text></View> : null}
    </PressScale>
  );
}
