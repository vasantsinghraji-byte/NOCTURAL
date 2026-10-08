import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, Building2, Clock, Home, Languages, Lock, MapPin, ShieldCheck, Star, Tag } from 'lucide-react-native';
import type { CareMode, CareQuote, PlanPaymentMode, PlanProposalView, RateCardLine, ShopPage, SlotDay } from '@medrush/shared';
import { api } from '@/lib/api';
import { WineGradient } from '@/lib/CareArt';
import CareArt from '@/lib/CareArt';
import { appAlert } from '@/lib/dialog';
import { KINDS, WEEKDAY_LETTERS, WEEKDAY_NAMES, fmtClock, fmtDay, fmtTime, hoursLabel, inr, placeBody, problem, useMe, useVisitPlace, weekdayOf } from '@/lib/market';
import { Badge, Bill, Btn, Card, Chip, Chips, DateStrip, Empty, Label, Meta, Note, PlaceCard, Seg, Stepper, TapCard, TimeGrid, Title, TopBar, mk } from '@/lib/marketUI';
import { PaymentDismissedError, payCarePlan } from '@/lib/payments';
import { PressScale, Rise, Skeleton, success } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

const MAX_SESSIONS = 30;

/** A provider's page: rate card (the menu), then book one visit or a plan with a live bill. */
export default function ShopScreen() {
  const params = useLocalSearchParams<{ id: string; service?: string; mode?: string; proposal?: string }>();
  const id = String(params.id);
  const insets = useSafeAreaInsets();
  const { me, signedIn } = useMe();
  const { place, setPlace, useMyLocation, locating } = useVisitPlace(me?.savedAddresses);
  const scroll = useRef<ScrollView>(null);
  const bookingY = useRef(0);

  const [shop, setShop] = useState<ShopPage | null>(null);
  const [loadError, setLoadError] = useState('');
  const [item, setItem] = useState<RateCardLine | null>(null);
  const [mode, setMode] = useState<CareMode>(params.mode === 'CLINIC' ? 'CLINIC' : 'HOME');
  const [sessions, setSessions] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState('');
  const [time, setTime] = useState('');
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [forWhom, setForWhom] = useState<'me' | 'other'>('me');
  const [pd, setPd] = useState({ name: '', age: '', gender: '' as '' | 'Female' | 'Male' | 'Other', relation: '' });
  const [payment, setPayment] = useState<PlanPaymentMode>('PER_SESSION');
  const [proposal, setProposal] = useState<PlanProposalView | null>(null);
  const [quote, setQuote] = useState<CareQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [booking, setBooking] = useState(false);
  const [notice, setNotice] = useState('');

  // The shop, with the travel fee to the chosen address.
  useEffect(() => {
    api.marketStore(id, place.coords || undefined).then((r) => {
      setShop(r.store);
      setItem((cur) => cur || r.store.rateCard.find((l) => l.service._id === params.service) || null);
    }).catch((e) => setLoadError(problem(e).message));
  }, [id, place.coords, params.service]);

  // A plan the professional suggested after a visit.
  useEffect(() => {
    if (!params.proposal || !signedIn || !shop) return;
    api.myProposals().then((r) => {
      const p = r.proposals.find((x) => x._id === params.proposal);
      if (!p) return;
      setProposal(p);
      const line = shop.rateCard.find((l) => l.service._id === p.service);
      if (line) setItem(line);
      setMode(p.mode);
      setSessions(p.sessions);
    }).catch(() => undefined);
  }, [params.proposal, signedIn, shop]);

  const homeOk = Boolean(item?.home.enabled && shop?.home.enabled);
  const clinicOk = Boolean(item?.clinic.enabled && shop?.clinic.enabled);
  useEffect(() => {
    if (!item) return;
    if (mode === 'HOME' && !homeOk && clinicOk) setMode('CLINIC');
    if (mode === 'CLINIC' && !clinicOk && homeOk) setMode('HOME');
  }, [item, mode, homeOk, clinicOk]);

  const loadSlots = () => {
    if (!item) return;
    setDays(null);
    api.marketSlots(id, { serviceId: item.service._id, mode, days: 14 })
      .then((r) => {
        setDays(r.days);
        const first = r.days.find((d) => d.times.length);
        setStartDate((cur) => (cur && r.days.some((d) => d.date === cur && d.times.length) ? cur : first?.date || ''));
      })
      .catch(() => setDays([]));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadSlots, [id, item, mode]);
  useEffect(() => { if (startDate) setWeekdays((cur) => (cur.length ? cur : [weekdayOf(startDate)])); }, [startDate]);
  const timesForDay = useMemo(() => days?.find((d) => d.date === startDate)?.times || [], [days, startDate]);
  useEffect(() => { if (time && !timesForDay.includes(time)) setTime(''); }, [timesForDay, time]);

  const discountFor = (n: number) => (item?.sessionDiscounts || []).reduce((b, t) => (n >= t.minSessions && t.percent > b ? t.percent : b), 0);
  const prepaidPercent = discountFor(sessions);
  const needsAddress = mode === 'HOME';
  const ready = Boolean(signedIn && item && startDate && time && (!needsAddress || place.coords) && (forWhom === 'me' || pd.name.trim().length > 1));

  // Live bill: re-quote when anything changes (prices always come from the server).
  useEffect(() => {
    if (!ready || !item) { setQuote(null); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      setQuoting(true);
      setQuoteError('');
      api.careQuote({
        storeId: id,
        serviceId: item.service._id,
        mode,
        sessions,
        paymentMode: payment,
        schedule: { startDate, time, weekdays: sessions > 1 ? weekdays : undefined },
        ...(needsAddress ? placeBody(place) : {}),
        ...(forWhom === 'other' ? { patientDetails: { name: pd.name.trim(), age: pd.age ? Number(pd.age) : undefined, gender: pd.gender || undefined, relation: pd.relation || undefined } } : {}),
        ...(proposal ? { proposalId: proposal._id } : {})
      }).then((r) => { if (live) setQuote(r.quote); })
        .catch((e) => { if (live) { setQuote(null); setQuoteError(problem(e).message); } })
        .finally(() => { if (live) setQuoting(false); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [ready, id, item, mode, sessions, payment, startDate, time, weekdays, needsAddress, place, forWhom, pd, proposal]);

  const book = async () => {
    if (!quote) return;
    setBooking(true);
    setNotice('');
    try {
      const { plan } = await api.bookCarePlan(quote._id);
      success();
      if (plan.status === 'PENDING_PAYMENT') {
        try { await payCarePlan(plan._id, { name: me?.name, email: me?.email, contact: me?.phone }); } catch (e) {
          if (!(e instanceof PaymentDismissedError)) appAlert('Payment didn’t go through', `${problem(e).message} You can pay from the plan page while your times are held.`);
        }
      }
      router.replace({ pathname: '/care/plan/[id]', params: { id: plan._id, fresh: '1' } });
    } catch (e) {
      const p = problem(e);
      if (p.code === 'PRICE_CHANGED' && p.details?.quote) { setQuote(p.details.quote); setNotice(p.message); }
      else if (p.code === 'SLOT_TAKEN') { setNotice(p.message); setTime(''); loadSlots(); }
      else setNotice(p.message);
    } finally {
      setBooking(false);
    }
  };

  if (loadError) return <View style={ui.screen}><TopBar title="Provider" /><Empty title={loadError} action={<Btn variant="ghost" label="Back to Care" onPress={() => router.replace('/care')} />} /></View>;
  if (!shop) return <View style={ui.screen}><TopBar /><View style={{ padding: 16, gap: 12 }}><Skeleton height={200} radius={28} /><Skeleton height={260} radius={24} /></View></View>;

  const meta = KINDS[shop.kind];
  const toggleDay = (d: number) => setWeekdays((cur) => (cur.includes(d) ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : [...cur, d].sort()));
  const hint = !item ? 'Choose a service to see the price.'
    : !signedIn ? null
      : !time ? 'Pick a date and time.'
        : needsAddress && !place.coords ? 'Choose the visit address.'
          : forWhom === 'other' && pd.name.trim().length < 2 ? 'Add their name.'
            : null;

  return (
    <View style={ui.screen}>
      <TopBar title={shop.name} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 140 + insets.bottom, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Rise>
          <View style={{ borderRadius: 28, padding: 20, overflow: 'hidden', backgroundColor: C.night }}>
            <WineGradient />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {shop.registered ? <Badge tone="onDark" icon={BadgeCheck} label="Verified" /> : null}
                  {shop.accredited ? <Badge tone="onDark" icon={ShieldCheck} label="NABL" /> : null}
                  {shop.isPaused ? <Badge tone="onDark" label="Not taking bookings today" /> : null}
                </View>
                <Text style={{ fontFamily: F.display, fontSize: 25, color: '#ffffff', letterSpacing: -0.5 }}>{shop.name}</Text>
                <Meta onDark>{shop.bio || meta.pitch}</Meta>
              </View>
              <CareArt kind={meta.art} size={112} style={{ marginRight: -12 }} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {shop.rating.count > 0 ? <Badge tone="onDark" icon={Star} label={`${shop.rating.avg.toFixed(1)} (${shop.rating.count})`} /> : null}
              {shop.experienceYears ? <Badge tone="onDark" label={`${shop.experienceYears} years`} /> : null}
              {shop.languages.length ? <Badge tone="onDark" icon={Languages} label={shop.languages.join(', ')} /> : null}
            </View>
          </View>
        </Rise>

        {proposal ? <Note tone="green">{`Suggested by ${shop.name}: ${proposal.sessions} × ${proposal.serviceName}${proposal.note ? `. “${proposal.note}”` : ''}`}</Note> : null}

        <Title size={20}>Services and prices</Title>
        {shop.rateCard.length === 0 ? <Meta>No services listed yet.</Meta> : null}
        {shop.rateCard.map((line) => {
          const on = item?._id === line._id;
          return (
            <TapCard key={line._id} selected={on} disabled={Boolean(proposal) && !on} label={line.service.displayName}
              onPress={() => { setItem(line); setQuote(null); setTimeout(() => scroll.current?.scrollTo({ y: bookingY.current - 8, animated: true }), 120); }}>
              <View style={mk.row}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{line.service.displayName}</Text>
                  <Meta>{hoursLabel(line.durationMinutes)}{line.sessionDiscounts.length ? ` · up to ${Math.max(...line.sessionDiscounts.map((d) => d.percent))}% off on plans` : ''}</Meta>
                  {line.offer ? <Badge tone="red" icon={Tag} label={line.offer.label} /> : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  {line.clinic.enabled ? <Text style={mk.price}>{inr(line.clinic.price)} <Text style={{ fontSize: 11, color: C.muted, fontFamily: F.medium }}>clinic</Text></Text> : null}
                  {line.home.enabled ? <Text style={mk.price}>{inr(line.home.price)} <Text style={{ fontSize: 11, color: C.muted, fontFamily: F.medium }}>home</Text></Text> : null}
                </View>
              </View>
            </TapCard>
          );
        })}

        {item && (
          <View onLayout={(e) => { bookingY.current = e.nativeEvent.layout.y; }}>
            <Card style={{ gap: 16 }}>
              <Title size={20}>Book {item.service.displayName}</Title>

              {homeOk && clinicOk ? (
                <View style={{ gap: 8 }}>
                  <Label>Where</Label>
                  <Seg value={mode} onChange={setMode} disabled={Boolean(proposal)} options={[{ value: 'HOME', label: 'At Home', icon: Home }, { value: 'CLINIC', label: 'At Clinic', icon: Building2 }]} />
                </View>
              ) : null}
              {mode === 'CLINIC' && shop.clinic.address ? (
                <View style={mk.row}><MapPin size={15} color={C.muted} /><Meta style={{ flex: 1 }}>{[shop.clinic.address.line1, shop.clinic.address.city].filter(Boolean).join(', ')}{Number.isFinite(shop.distanceKm) ? ` · ${shop.distanceKm} km away` : ''}</Meta></View>
              ) : null}
              {mode === 'HOME' ? <PlaceCard saved={me?.savedAddresses || []} place={place} onChange={setPlace} onLocate={useMyLocation} locating={locating} signedIn={signedIn} /> : null}
              {mode === 'HOME' && place.coords && shop.homeCovered === false
                ? <Note>{`This address is outside ${shop.name}’s home-visit area (${shop.home.radiusKm} km). ${clinicOk ? 'Choose a clinic visit or ' : 'Choose '}another provider.`}</Note> : null}

              <View style={{ gap: 8 }}>
                <Label>Who is it for?</Label>
                <Seg value={forWhom} onChange={setForWhom} options={[{ value: 'me', label: 'Me' }, { value: 'other', label: 'Someone Else' }]} />
                {forWhom === 'other' && (
                  <View style={{ gap: 8 }}>
                    <TextInput style={ui.input} placeholder="Their name, e.g. Kamla Devi" placeholderTextColor={C.muted} value={pd.name} onChangeText={(name) => setPd({ ...pd, name })} autoComplete="off" accessibilityLabel="Their name" />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput style={[ui.input, { flex: 1 }]} placeholder="Relation" placeholderTextColor={C.muted} value={pd.relation} onChangeText={(relation) => setPd({ ...pd, relation })} accessibilityLabel="Relation" />
                      <TextInput style={[ui.input, { width: 96 }]} placeholder="Age" placeholderTextColor={C.muted} keyboardType="number-pad" maxLength={3} value={pd.age} onChangeText={(age) => setPd({ ...pd, age: age.replace(/\D/g, '') })} accessibilityLabel="Age" />
                    </View>
                    <Chips>
                      {(['Female', 'Male', 'Other'] as const).map((g) => <Chip key={g} label={g} on={pd.gender === g} onPress={() => setPd({ ...pd, gender: pd.gender === g ? '' : g })} />)}
                    </Chips>
                  </View>
                )}
              </View>

              <View style={{ gap: 8 }}>
                <Label>How many {meta.unit}s?</Label>
                <View style={[mk.row, { flexWrap: 'wrap' }]}>
                  <Stepper value={sessions} max={MAX_SESSIONS} onChange={setSessions} disabled={Boolean(proposal)} />
                  {!proposal ? <Chips>{[1, 5, 10, 15].map((n) => <Chip key={n} label={String(n)} on={sessions === n} onPress={() => setSessions(n)} />)}</Chips> : null}
                </View>
                {item.sessionDiscounts.length > 0 ? <Meta>{item.sessionDiscounts.map((d) => `${d.percent}% off from ${d.minSessions}`).join(', ')} when you pay upfront.</Meta> : null}
              </View>

              {sessions > 1 && (
                <View style={{ gap: 8 }}>
                  <Label>Which days?</Label>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {WEEKDAY_LETTERS.map((l, d) => {
                      const on = weekdays.includes(d);
                      return (
                        <PressScale key={d} onPress={() => toggleDay(d)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={WEEKDAY_NAMES[d]}
                          style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.brand : C.cardAlt }}>
                          <Text style={{ color: on ? '#ffffff' : C.inkSoft, fontFamily: F.heavy }}>{l}</Text>
                        </PressScale>
                      );
                    })}
                  </View>
                  <Chips>
                    <Chip label="Every Day" onPress={() => setWeekdays([0, 1, 2, 3, 4, 5, 6])} />
                    <Chip label="Weekdays" onPress={() => setWeekdays([1, 2, 3, 4, 5])} />
                    <Chip label="Mon, Wed, Fri" onPress={() => setWeekdays([1, 3, 5])} />
                  </Chips>
                </View>
              )}

              <View style={{ gap: 10 }}>
                <Label>{sessions > 1 ? 'Start date and time' : 'Date and time'}</Label>
                {days && days.every((d) => !d.times.length)
                  ? <Note tone="neutral">{`No free times in the next two weeks. Try ${mode === 'HOME' && clinicOk ? 'a clinic visit or ' : ''}another provider.`}</Note>
                  : (
                    <>
                      <DateStrip days={days} value={startDate} onChange={setStartDate} />
                      <TimeGrid times={timesForDay} value={time} onChange={setTime} />
                    </>
                  )}
              </View>

              {sessions > 1 && (
                <View style={{ gap: 8 }}>
                  <Label>Payment</Label>
                  <TapCard selected={payment === 'PER_SESSION'} onPress={() => setPayment('PER_SESSION')} label="Pay after each session">
                    <Text style={{ fontFamily: F.bold, color: C.ink }}>Pay after each {meta.unit}</Text>
                    <Meta>Cash or UPI to the professional</Meta>
                  </TapCard>
                  <TapCard selected={payment === 'PREPAID'} onPress={() => setPayment('PREPAID')} label="Pay upfront">
                    <Text style={{ fontFamily: F.bold, color: C.ink }}>Pay upfront{prepaidPercent ? `, save ${prepaidPercent}%` : ''}</Text>
                    <Meta>Unused {meta.unit}s are refunded</Meta>
                  </TapCard>
                </View>
              )}
            </Card>
          </View>
        )}

        {item && (
          <Card style={{ gap: 12 }}>
            <Title size={18}>Your bill</Title>
            {!signedIn ? (
              <>
                <Meta>{inr(mode === 'HOME' ? item.home.price : item.clinic.price)} per {meta.unit}{mode === 'HOME' && shop.travel ? ` + travel ${inr(shop.travel.fee)}` : ''}</Meta>
                <Btn label="Sign In to Book" onPress={() => router.push('/welcome')} />
              </>
            ) : null}
            {hint && signedIn ? <Meta>{hint}</Meta> : null}
            {quoting ? <Skeleton height={130} radius={16} /> : null}
            {quoteError && !quoting ? <Note>{quoteError}</Note> : null}
            {quote && !quoting ? (
              <>
                <Bill lines={quote.lines.map((l) => ({ key: l.code + l.label, label: l.label, amount: l.amount }))} total={quote.amounts.total} />
                {quote.paymentMode === 'PER_SESSION' && quote.sessions > 1 ? <Meta>You pay {inr(quote.amounts.perSessionPayable)} after each {meta.unit}.</Meta> : null}
                {quote.amounts.creditAvailable > 0 ? <Note tone="green">{`${inr(quote.amounts.creditAvailable)} Nabz credit will be used.`}</Note> : null}
                <Meta>{quote.schedule.dates.length} date{quote.schedule.dates.length > 1 ? 's' : ''} at {fmtTime(quote.schedule.time)}: {quote.schedule.dates.slice(0, 6).map((d) => fmtDay(d)).join(', ')}{quote.schedule.dates.length > 6 ? '…' : ''}</Meta>
                <View style={mk.row}><Lock size={12} color={C.muted} /><Meta>Price locked until {fmtClock(quote.expiresAt)}</Meta></View>
              </>
            ) : null}
            {notice ? <Note>{notice}</Note> : null}
          </Card>
        )}
        {shop.home.enabled ? <Meta>Home visits up to {shop.home.radiusKm} km, travel {inr(shop.home.ratePerKm)}/km (measured by Nabz).</Meta> : null}
        <View style={mk.row}><Clock size={13} color={C.muted} /><Meta>Free cancellation until the professional is on the way.</Meta></View>
      </ScrollView>

      {quote && !quoting && signedIn ? (
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 12) + 4, backgroundColor: C.tabBar, borderRadius: 999, padding: 7, paddingLeft: 22, flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: '0 14px 30px -10px rgba(31,10,18,0.55)' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#ffffff', fontFamily: F.display, fontSize: 18 }}>{inr(quote.amounts.total)}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontFamily: F.medium, fontSize: 11 }}>{quote.sessions} {meta.unit}{quote.sessions > 1 ? 's' : ''} · {quote.paymentMode === 'PREPAID' ? 'pay now' : 'pay per visit'}</Text>
          </View>
          <Btn label={booking ? 'Booking…' : quote.paymentMode === 'PREPAID' ? 'Book & Pay' : 'Confirm Booking'} onPress={book} loading={booking} />
        </View>
      ) : null}
    </View>
  );
}
