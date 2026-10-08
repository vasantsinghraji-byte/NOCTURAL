import { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, Building2, Clock, Droplets, FlaskConical, Home, Search, ShieldCheck, X } from 'lucide-react-native';
import type { CareMode, LabCompareRow, LabQuote, MarketService, SlotDay } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { fmtDay, fmtTime, inr, placeBody, problem, useMe, useVisitPlace, type VisitPlace } from '@/lib/market';
import { Badge, Bill, Btn, Card, DateStrip, Empty, Label, Meta, MkHero, Note, PlaceCard, Screen, Seg, TapCard, TimeGrid, Title, TopBar, mk } from '@/lib/marketUI';
import { PaymentDismissedError, payLabOrder } from '@/lib/payments';
import { PressScale, Rise, Skeleton, success } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

/** Lab tests: pick tests, compare every lab's price and report time, book a collection. */
export default function LabTests() {
  const params = useLocalSearchParams<{ test?: string }>();
  const { me, signedIn } = useMe();
  const { place, setPlace, useMyLocation, locating } = useVisitPlace(me?.savedAddresses);
  const [tests, setTests] = useState<MarketService[] | null>(null);
  const [q, setQ] = useState('');
  const [basket, setBasket] = useState<string[]>(params.test ? [String(params.test)] : []);
  const [mode, setMode] = useState<CareMode>('HOME');
  const [labs, setLabs] = useState<LabCompareRow[] | null>(null);
  const [lab, setLab] = useState<LabCompareRow | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { api.marketServices('LAB').then((r) => setTests(r.services)).catch((e) => setError(problem(e).message)); }, []);
  useEffect(() => {
    setLab(null);
    if (!basket.length) { setLabs(null); return undefined; }
    let live = true;
    setLabs(null);
    api.compareLabs(basket, { mode, lat: place.coords?.lat, lng: place.coords?.lng })
      .then((r) => { if (live) setLabs(r.labs); })
      .catch((e) => { if (live) { setError(problem(e).message); setLabs([]); } });
    return () => { live = false; };
  }, [basket, mode, place.coords]);

  const shown = useMemo(() => (tests || []).filter((t) => t.displayName.toLowerCase().includes(q.trim().toLowerCase())), [tests, q]);
  const byId = useMemo(() => new Map((tests || []).map((t) => [t._id, t])), [tests]);
  const toggle = (id: string) => setBasket((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id].slice(0, 30)));
  const fasting = basket.some((id) => (byId.get(id)?.lab?.fastingHours || 0) > 0);

  return (
    <Screen header={<TopBar title="Lab tests" right={signedIn ? <Btn small variant="soft" label="My Tests" onPress={() => router.push('/labs/orders')} /> : undefined} />}>
      <Rise><MkHero title="Lab tests," accent="compared" subtitle="See every lab’s price, report time and collection fee, then book a home collection." art="lab" /></Rise>

      <Title size={19}>1. Choose tests</Title>
      <View style={{ justifyContent: 'center' }}>
        <Search size={16} color={C.muted} style={{ position: 'absolute', left: 16, zIndex: 1 }} />
        <TextInput style={[ui.input, { paddingLeft: 42 }]} placeholder="Search CBC, thyroid, vitamin D" placeholderTextColor={C.muted} value={q} onChangeText={setQ} autoCorrect={false} accessibilityLabel="Search tests" />
      </View>
      {basket.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {basket.map((id) => (
            <PressScale key={id} onPress={() => toggle(id)} accessibilityRole="button" accessibilityLabel={`Remove ${byId.get(id)?.displayName || 'test'}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.brand, paddingLeft: 12, paddingRight: 8, paddingVertical: 7, borderRadius: 999 }}>
              <Text style={{ color: '#ffffff', fontFamily: F.bold, fontSize: 12 }}>{byId.get(id)?.displayName || 'Test'}</Text>
              <X size={14} color="#ffffff" />
            </PressScale>
          ))}
        </View>
      )}
      {!tests && !error ? <Skeleton height={140} radius={22} /> : null}
      {error ? <Note>{error}</Note> : null}
      {shown.slice(0, q ? 40 : 12).map((t) => {
        const on = basket.includes(t._id);
        return (
          <TapCard key={t._id} selected={on} onPress={() => toggle(t._id)} label={`${t.displayName}${on ? ', selected' : ''}`}>
            <View style={mk.row}>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.ink }}>{t.displayName}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {t.category === 'LAB_PACKAGE' ? <Badge tone="red" label="Package" /> : null}
                  {(t.lab?.fastingHours || 0) > 0 ? <Badge label={`Fasting ${t.lab?.fastingHours} h`} /> : null}
                  {t.lab?.homeCollectable === false ? <Badge label="Lab visit only" /> : null}
                </View>
              </View>
              {t.fromPrice != null ? <Text style={mk.price}><Text style={{ fontSize: 11, color: C.muted, fontFamily: F.medium }}>from </Text>{inr(t.fromPrice)}</Text> : null}
            </View>
          </TapCard>
        );
      })}
      {tests && !q && tests.length > 12 ? <Meta>Search to see all {tests.length} tests.</Meta> : null}

      {basket.length > 0 && (
        <>
          <Title size={19}>2. Compare labs</Title>
          <Seg value={mode} onChange={setMode} options={[{ value: 'HOME', label: 'Home Collection', icon: Home }, { value: 'CLINIC', label: 'Visit Lab', icon: Building2 }]} />
          {mode === 'HOME' ? <PlaceCard saved={me?.savedAddresses || []} place={place} onChange={setPlace} onLocate={useMyLocation} locating={locating} signedIn={signedIn} /> : null}
          {fasting ? <View style={[mk.row, { backgroundColor: C.cardAlt, padding: 12, borderRadius: 16 }]}><Droplets size={16} color={C.inkSoft} /><Meta style={{ flex: 1 }}>Some tests need fasting. Collection is offered only in the morning.</Meta></View> : null}
          {!labs ? <Skeleton height={120} radius={22} /> : null}
          {labs && labs.length === 0
            ? <Note tone="neutral">{mode === 'HOME' && !place.coords ? 'Choose the collection address to see labs that come to you.' : 'No lab offers these tests here yet. Try a lab visit or fewer tests.'}</Note> : null}
          {(labs || []).map((row) => {
            const on = lab?.store._id === row.store._id;
            return (
              <Card key={row.store._id} selected={on} style={{ gap: 10, padding: 14 }}>
                <View style={mk.row}>
                  <View style={mk.tile}><FlaskConical size={22} color={C.brand} /></View>
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text style={{ fontFamily: F.display, fontSize: 16, color: C.ink }}>{row.store.name}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      {row.accredited ? <Badge tone="green" icon={ShieldCheck} label="NABL" /> : null}
                      <Badge icon={Clock} label={`Report in ${row.reportHours} h`} />
                      {Number.isFinite(row.distanceKm) ? <Badge label={`${row.distanceKm} km`} /> : null}
                      {!row.offersAll ? <Badge tone="red" label={`${row.tests.length} of ${basket.length} tests`} /> : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={mk.price}>{inr(row.testsSubtotal + (mode === 'HOME' && row.homeCollection ? row.homeCollection.fee : 0))}</Text>
                    <Meta style={{ fontSize: 11 }}>{mode === 'HOME' && row.homeCollection ? (row.homeCollection.waived || row.homeCollection.fee === 0 ? 'Free collection' : `incl. ${inr(row.homeCollection.fee)} pickup`) : 'at the lab'}</Meta>
                  </View>
                </View>
                {row.missing.length > 0 ? <Meta>Not offered here: {row.missing.map((m) => m.name).join(', ')}</Meta> : null}
                <Btn small variant={on ? 'dark' : 'primary'} disabled={!row.offersAll} label={!row.offersAll ? 'Remove Missing Tests First' : on ? 'Chosen' : 'Choose Lab'} onPress={() => setLab(row)} />
              </Card>
            );
          })}
        </>
      )}

      {lab ? <LabBooking key={`${lab.store._id}${mode}`} row={lab} serviceIds={basket} mode={mode} place={place} fasting={fasting} signedIn={signedIn} prefill={{ name: me?.name, email: me?.email, contact: me?.phone }} /> : null}
      {basket.length === 0 && tests && tests.length === 0 ? <Empty title="Lab tests are coming soon" text="Labs in your city are joining Nabz." /> : null}
    </Screen>
  );
}

function LabBooking({ row, serviceIds, mode, place, fasting, signedIn, prefill }: {
  row: LabCompareRow; serviceIds: string[]; mode: CareMode; place: VisitPlace; fasting: boolean; signedIn: boolean; prefill: { name?: string; email?: string; contact?: string };
}) {
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [payment, setPayment] = useState<'PAY_AT_COLLECTION' | 'PREPAID'>('PAY_AT_COLLECTION');
  const [quote, setQuote] = useState<LabQuote | null>(null);
  const [err, setErr] = useState('');
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    api.marketSlots(row.store._id, { serviceId: serviceIds[0], mode, days: 10 })
      .then((r) => { setDays(r.days); setDate(r.days.find((d) => d.times.length)?.date || ''); }).catch(() => setDays([]));
  }, [row, serviceIds, mode]);
  const times = (days?.find((d) => d.date === date)?.times || []).filter((t) => !fasting || t <= '10:00');

  const input = () => ({ storeId: row.store._id, serviceIds, mode, slot: { date, time }, paymentMode: payment, ...(mode === 'HOME' ? placeBody(place) : {}) });
  useEffect(() => {
    if (!signedIn || !date || !time) { setQuote(null); return; }
    setErr('');
    api.labQuote(input()).then((r) => setQuote(r.quote)).catch((e) => { setQuote(null); setErr(problem(e).message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, date, time, payment, mode, place]);

  const book = async () => {
    if (!quote) return;
    setBooking(true);
    setErr('');
    try {
      const { order } = await api.bookLabOrder({ ...input(), expectedTotal: quote.amounts.total });
      success();
      if (order.payment.mode === 'PREPAID' && order.payment.status === 'PENDING') {
        try { await payLabOrder(order._id, prefill); } catch (e) {
          if (!(e instanceof PaymentDismissedError)) appAlert('Payment didn’t go through', `${problem(e).message} You can pay from the booking page while the time is held.`);
        }
      }
      router.replace({ pathname: '/labs/order/[id]', params: { id: order._id, fresh: '1' } });
    } catch (e) {
      const p = problem(e);
      if (p.code === 'PRICE_CHANGED' && p.details?.quote) setQuote(p.details.quote);
      setErr(p.message);
    } finally { setBooking(false); }
  };

  return (
    <Card style={{ gap: 14 }}>
      <Title size={19}>3. {mode === 'HOME' ? 'Collection time' : 'Visit time'} at {row.store.name}</Title>
      <DateStrip days={days} value={date} onChange={(d) => { setDate(d); setTime(''); }} openLabel={() => 'Open'} />
      <TimeGrid times={times} value={time} onChange={setTime} />
      {date && days && !times.length ? <Meta>{fasting ? 'No morning times left that day.' : 'No times left that day.'}</Meta> : null}
      <Label>Payment</Label>
      <Seg value={payment} onChange={setPayment} options={[{ value: 'PAY_AT_COLLECTION', label: 'At Collection' }, { value: 'PREPAID', label: 'Pay Online' }]} />
      {!signedIn ? <Btn label="Sign In to Book" onPress={() => router.push('/welcome')} /> : null}
      {err ? <Note>{err}</Note> : null}
      {quote ? (
        <>
          <Bill
            lines={[
              ...quote.tests.map((t) => ({ key: t.service, label: t.name, amount: t.price })),
              ...(mode === 'HOME' ? [{ key: 'collect', label: 'Home collection', amount: quote.amounts.collectionWaived ? 'Free' : quote.amounts.collectionFee }] : []),
              ...(quote.amounts.platformFee > 0 ? [{ key: 'fee', label: 'Nabz fee', amount: quote.amounts.platformFee }] : []),
              { key: 'gst', label: 'GST', amount: quote.amounts.gst }
            ]}
            total={quote.amounts.total}
          />
          {quote.creditAvailable > 0 ? <Note tone="green">{`${inr(Math.min(quote.creditAvailable, quote.amounts.total))} Nabz credit will be used.`}</Note> : null}
          <View style={mk.row}><BadgeCheck size={13} color={C.muted} /><Meta>Report in about {quote.reportHours} hours after collection.</Meta></View>
          <Btn label={booking ? 'Booking…' : `Book for ${fmtDay(date)}, ${fmtTime(time)}`} loading={booking} onPress={book} />
        </>
      ) : null}
    </Card>
  );
}
