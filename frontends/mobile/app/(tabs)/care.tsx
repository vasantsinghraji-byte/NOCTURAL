import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Activity, ArrowRight, CalendarHeart, FlaskConical, HeartHandshake, Sparkles, Wallet, type LucideIcon } from 'lucide-react-native';
import type { CarePlanView, MarketService, PlanProposalView, SpotlightAd } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import CareArt, { WineGradient, type ArtKind } from '@/lib/CareArt';
import { fmtDay, fmtTime, inr, problem } from '@/lib/market';
import { Badge, Btn, Card, MkHero, Meta, Note, Screen, Section, Title, mk } from '@/lib/marketUI';
import { PressScale, Rise, Skeleton } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

type Home = { spotlight: SpotlightAd[]; physio: MarketService[]; homecare: MarketService[]; labs: MarketService[] };

/** Care marketplace hub: physio, home care and lab tests, compared like food delivery. */
export default function CareHub() {
  const { session } = useAuth();
  const signedIn = session?.kind === 'patient';
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState('');
  const [mine, setMine] = useState<{ plans: CarePlanView[]; proposals: PlanProposalView[]; wallet: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    await Promise.all([
      api.marketHome().then((r) => setHome(r)).catch((e) => setError(problem(e).message)),
      signedIn
        ? Promise.all([api.myCarePlans(), api.myProposals(), api.myWallet()])
          .then(([p, pr, w]) => setMine({ plans: p.plans, proposals: pr.proposals, wallet: w.balance }))
          .catch(() => setMine(null))
        : Promise.resolve(setMine(null))
    ]);
  }, [signedIn]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = mine?.plans.filter((p) => p.status === 'ACTIVE' || p.status === 'PENDING_PAYMENT') || [];

  return (
    <Screen tabBar refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={C.brand} />}>
      <Rise>
        <MkHero eyebrow="NABZ CARE" title="Care at home, by people" accent="you choose" subtitle="Compare physios, caregivers and labs near you. Every price shown before you book." art="heart">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small variant="light" label="Book a Physio" icon={ArrowRight} onPress={() => router.push('/care/PHYSIO')} />
            <Btn small variant="dark" label="Lab Tests" onPress={() => router.push('/labs')} />
          </View>
        </MkHero>
      </Rise>

      {mine && active.slice(0, 2).map((p, i) => {
        const next = p.sessions?.find((s) => ['CONFIRMED', 'REQUESTED', 'ASSIGNED'].includes(s.status));
        return (
          <Rise key={p._id} delay={60 * (i + 1)}>
            <PressScale onPress={() => router.push(`/care/plan/${p._id}`)} style={[ui.card, { overflow: 'hidden' }]} accessibilityRole="button" accessibilityLabel={`${p.serviceName} plan`}>
              <WineGradient radius={24} />
              <View style={mk.row}>
                <View style={[mk.tile, { backgroundColor: 'rgba(255,255,255,0.16)' }]}><CalendarHeart size={22} color="#ffffff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.onRedTitle}>{p.serviceName}</Text>
                  <Meta onDark>{p.store?.name} · {p.sessionsCompleted}/{p.sessionsTotal} done</Meta>
                </View>
                <View style={s.arrowBtn}><ArrowRight size={18} color={C.brand} /></View>
              </View>
              {p.status === 'PENDING_PAYMENT' ? <Meta onDark style={{ marginTop: 10 }}>Waiting for payment</Meta>
                : next ? <Meta onDark style={{ marginTop: 10 }}>Next: {fmtDay(next.scheduledDate)}, {fmtTime(next.scheduledTime)}</Meta> : null}
            </PressScale>
          </Rise>
        );
      })}
      {mine && mine.proposals.slice(0, 1).map((pr) => (
        <PressScale key={pr._id} onPress={() => pr.store && router.push({ pathname: '/care/shop/[id]', params: { id: pr.store._id, proposal: pr._id } })} style={ui.card} accessibilityRole="button">
          <View style={mk.row}>
            <View style={mk.tile}><Sparkles size={22} color={C.brand} /></View>
            <View style={{ flex: 1 }}>
              <Title size={16}>Plan suggested by {pr.store?.name}</Title>
              <Meta>{pr.sessions} × {pr.serviceName}</Meta>
            </View>
            <ArrowRight size={18} color={C.brand} />
          </View>
        </PressScale>
      ))}
      {mine && mine.wallet > 0 && (
        <Card>
          <View style={mk.row}>
            <View style={[mk.tile, { backgroundColor: C.mintSoft }]}><Wallet size={22} color={C.mint} /></View>
            <View style={{ flex: 1 }}><Title size={16}>{inr(mine.wallet)} Nabz credit</Title><Meta>Used automatically on your next booking</Meta></View>
          </View>
        </Card>
      )}

      <Section>What do you need?</Section>
      <KindCard title="Physiotherapy" text="Back, knee, sports injuries, rehab. At home or at the clinic." icon={Activity} art="physio" red onPress={() => router.push('/care/PHYSIO')} delay={80} />
      <KindCard title="Home care" text="Attendants, elderly, baby and post-hospital care. Same person every day." icon={HeartHandshake} art="homecare" onPress={() => router.push('/care/HOMECARE')} delay={140} />
      <KindCard title="Lab tests" text="Compare labs and prices. Sample collected at home." icon={FlaskConical} art="lab" onPress={() => router.push('/labs')} delay={200} />

      {home?.spotlight?.[0] ? <Spotlight ad={home.spotlight[0]} /> : null}

      {error ? <Note>{error}</Note> : null}
      <Section>Popular physio services</Section>
      <ServiceStrip items={home?.physio} onPick={(sv) => router.push({ pathname: '/care/[kind]', params: { kind: 'PHYSIO', service: sv._id } })} />
      <Section>Home care</Section>
      <ServiceStrip items={home?.homecare} onPick={(sv) => router.push({ pathname: '/care/[kind]', params: { kind: 'HOMECARE', service: sv._id } })} />
      <Section>Lab tests and checkups</Section>
      <ServiceStrip items={home?.labs} lab onPick={(sv) => router.push({ pathname: '/labs', params: { test: sv._id } })} />

      <Card style={{ gap: 14, marginTop: 6 }}>
        <Title size={19}>How booking works</Title>
        {[
          ['Compare', 'Each provider sets their own price. See the rating, distance and travel fee before you choose.'],
          ['Pick your days', 'One visit or a full plan. The same professional comes every time.'],
          ['See the full bill', 'Service, travel, discount and tax shown before you pay. The price is locked for 15 minutes.'],
          ['Pay your way', 'Pay after each visit, or pay for the plan upfront and save more.']
        ].map(([t, d], i) => (
          <View key={t} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={[s.dot, i === 0 && { backgroundColor: C.brand }]}><Text style={{ color: i === 0 ? '#ffffff' : C.brandDark, fontFamily: F.heavy, fontSize: 13 }}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}><Text style={{ fontFamily: F.bold, fontSize: 14, color: C.ink }}>{t}</Text><Meta>{d}</Meta></View>
          </View>
        ))}
      </Card>
      {signedIn && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn variant="soft" label="My Care Plans" onPress={() => router.push('/care/plans')} style={{ flex: 1 }} />
          <Btn variant="soft" label="My Lab Tests" onPress={() => router.push('/labs/orders')} style={{ flex: 1 }} />
        </View>
      )}
    </Screen>
  );
}

function KindCard({ title, text, icon: Icon, art, red, onPress, delay }: { title: string; text: string; icon: LucideIcon; art: ArtKind; red?: boolean; onPress: () => void; delay: number }) {
  return (
    <Rise delay={delay}>
      <PressScale onPress={onPress} style={[ui.card, { overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 10 }]} accessibilityRole="button" accessibilityLabel={title}>
        {red ? <WineGradient radius={24} /> : null}
        <View style={{ flex: 1 }}>
          <View style={[mk.tile, red && { backgroundColor: 'rgba(255,255,255,0.16)' }, { marginBottom: 10 }]}><Icon size={22} color={red ? '#ffffff' : C.brand} /></View>
          <Text style={[s.kindTitle, red && { color: '#ffffff' }]}>{title}</Text>
          <Meta onDark={red} style={{ marginTop: 4 }}>{text}</Meta>
        </View>
        <View style={[s.artBox, red && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
          {!red ? <WineGradient radius={24} /> : null}
          <CareArt kind={art} size={100} />
        </View>
      </PressScale>
    </Rise>
  );
}

function ServiceStrip({ items, lab, onPick }: { items?: MarketService[]; lab?: boolean; onPick: (s: MarketService) => void }) {
  if (!items) return <View style={{ flexDirection: 'row', gap: 10 }}>{[0, 1].map((i) => <Skeleton key={i} height={96} width="48%" radius={22} />)}</View>;
  if (!items.length) return <Note tone="neutral">Coming to your area soon.</Note>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
      {items.slice(0, 8).map((sv) => (
        <PressScale key={sv._id} onPress={() => onPick(sv)} style={[ui.card, { width: 190, padding: 14, gap: 6 }]} accessibilityRole="button" accessibilityLabel={sv.displayName}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.ink }} numberOfLines={2}>{sv.displayName}</Text>
          <Meta>{sv.providers ? `${sv.providers} ${lab ? 'lab' : 'provider'}${sv.providers === 1 ? '' : 's'}` : 'Coming soon'}</Meta>
          {sv.fromPrice != null ? <Text style={mk.price}><Text style={{ fontFamily: F.medium, fontSize: 12, color: C.muted }}>from </Text>{inr(sv.fromPrice)}</Text> : null}
        </PressScale>
      ))}
    </ScrollView>
  );
}

function Spotlight({ ad }: { ad: SpotlightAd }) {
  const open = () => {
    if (!ad.house) api.adClick(ad.token).catch(() => undefined);
    const path = ad.creative?.ctaPath || '';
    const shop = path.match(/^\/care\/shop\/([a-f0-9]{24})/)?.[1] || ad.store;
    if (shop) router.push(`/care/shop/${shop}`);
    else if (path.startsWith('/lab-tests')) router.push('/labs');
    else if (path.startsWith('/care/homecare')) router.push('/care/HOMECARE');
    else router.push('/care/PHYSIO');
  };
  return (
    <PressScale onPress={open} style={[ui.card, { overflow: 'hidden' }]} accessibilityRole="button" accessibilityLabel={`${ad.house ? 'From Nabz' : ad.label}: ${ad.creative?.title || ''}`}>
      <WineGradient radius={24} />
      <View style={mk.row}>
        <View style={{ flex: 1, gap: 8 }}>
          <Badge tone="onDark" label={ad.house ? 'From Nabz' : ad.label} />
          <Text style={[s.onRedTitle, { fontSize: 19 }]}>{ad.creative?.title}</Text>
          {ad.creative?.subtitle ? <Meta onDark>{ad.creative.subtitle}</Meta> : null}
        </View>
        <View style={s.arrowBtn}><ArrowRight size={18} color={C.brand} /></View>
      </View>
    </PressScale>
  );
}

const s = StyleSheet.create({
  onRedTitle: { fontFamily: F.display, fontSize: 17, color: '#ffffff' },
  arrowBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  kindTitle: { fontFamily: F.display, fontSize: 19, color: C.ink, letterSpacing: -0.3 },
  artBox: { width: 100, height: 100, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' }
});
