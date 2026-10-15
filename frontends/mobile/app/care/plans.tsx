import { useCallback, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { CalendarHeart, ChevronRight, Sparkles, Wallet } from 'lucide-react-native';
import type { CarePlanView, PlanProposalView, WalletView } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { PLAN_STATUS_LABEL, fmtDay, fmtStamp, inr, problem } from '@/lib/market';
import { Badge, Btn, Card, Empty, Meta, Note, Screen, Title, TopBar, mk } from '@/lib/marketUI';
import { PressScale, Rise, Skeleton } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

/** My care plans, suggested plans and the Nabz credit wallet. */
export default function MyPlans() {
  const [plans, setPlans] = useState<CarePlanView[] | null>(null);
  const [proposals, setProposals] = useState<PlanProposalView[]>([]);
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    await Promise.all([
      api.myCarePlans().then((r) => setPlans(r.plans)).catch((e) => { setError(problem(e).message); setPlans([]); }),
      api.myProposals().then((r) => setProposals(r.proposals)).catch(() => undefined),
      api.myWallet().then((r) => setWallet(r)).catch(() => undefined)
    ]);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const decline = (p: PlanProposalView) => appAlert('Decline this suggestion?', `${p.sessions} × ${p.serviceName} from ${p.store?.name || 'your professional'}.`, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Decline', style: 'destructive', onPress: () => { api.declineProposal(p._id).then(load).catch((e) => appAlert('Couldn’t decline', problem(e).message)); } }
  ]);

  return (
    <Screen header={<TopBar title="My care plans" />} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
      {error ? <Note>{error}</Note> : null}
      {proposals.map((p) => (
        <Card key={p._id} style={{ gap: 10 }}>
          <View style={mk.row}>
            <View style={mk.tile}><Sparkles size={20} color={C.brand} /></View>
            <View style={{ flex: 1 }}>
              <Title size={16}>{p.store?.name} suggests {p.sessions} × {p.serviceName}</Title>
              {p.note ? <Meta>“{p.note}”</Meta> : null}
              <Meta>Valid till {fmtDay(p.expiresAt)}</Meta>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small label="See Price & Book" onPress={() => p.store && router.push({ pathname: '/care/shop/[id]', params: { id: p.store._id, proposal: p._id } })} style={{ flex: 1 }} />
            <Btn small variant="ghost" label="Decline" onPress={() => decline(p)} />
          </View>
        </Card>
      ))}

      {!plans ? [0, 1, 2].map((i) => <Skeleton key={i} height={90} radius={22} />) : null}
      {plans && plans.length === 0 && !error
        ? <Empty title="No care plans yet" text="Book a physio or a caregiver: one visit or a full plan." action={<Btn label="Explore Care" onPress={() => router.push('/care')} />} /> : null}
      {plans?.map((p, i) => (
        <Rise key={p._id} delay={Math.min(i, 6) * 40}>
          <PressScale onPress={() => router.push(`/care/plan/${p._id}`)} style={[ui.card, mk.row]} accessibilityRole="button" accessibilityLabel={`${p.serviceName}, ${PLAN_STATUS_LABEL[p.status]}`}>
            <View style={mk.tile}><CalendarHeart size={22} color={C.brand} /></View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{p.serviceName}</Text>
              <Meta>{p.store?.name} · {p.sessionsCompleted}/{p.sessionsTotal} done · {inr(p.price.total)}</Meta>
              <Badge tone={p.status === 'ACTIVE' ? 'red' : p.status === 'COMPLETED' ? 'green' : p.status === 'PENDING_PAYMENT' ? 'amber' : 'neutral'} label={PLAN_STATUS_LABEL[p.status]} />
            </View>
            <ChevronRight size={18} color={C.faint} />
          </PressScale>
        </Rise>
      ))}

      {wallet ? (
        <Card style={{ gap: 10 }}>
          <View style={mk.row}>
            <View style={[mk.tile, { backgroundColor: C.mintSoft }]}><Wallet size={20} color={C.mint} /></View>
            <View style={{ flex: 1 }}><Title size={17}>{inr(wallet.balance)} Nabz credit</Title><Meta>Used automatically when you book</Meta></View>
          </View>
          {wallet.entries.slice(0, 6).map((e) => (
            <View key={e._id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Meta style={{ flex: 1 }}>{e.reason || e.type} · {fmtStamp(e.createdAt)}</Meta>
              <Text style={{ fontFamily: F.bold, color: e.amount < 0 ? C.ink : C.mint }}>{e.amount < 0 ? `− ${inr(-e.amount)}` : `+ ${inr(e.amount)}`}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
