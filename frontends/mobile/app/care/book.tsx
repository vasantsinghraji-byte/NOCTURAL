import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, CalendarDays, Check, Clock, CreditCard, Home, Lock, MapPin, UserRound, type LucideIcon } from 'lucide-react-native';
import type { CareMode, CareQuote, PlanPaymentMode, PlanProposalView, RateCardLine, ShopPage, SlotDay } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { KINDS, WEEKDAY_LETTERS, WEEKDAY_NAMES, dayShort, fmtClock, fmtDay, fmtTime, hoursLabel, inr, placeBody, problem, useMe, useVisitPlace, weekdayOf } from '@/lib/market';
import { Bill, Btn, Chip, Chips, DateStrip, Empty, Label, Meta, Note, PlaceCard, Seg, Stepper, TimeGroups, Title, TopBar } from '@/lib/marketUI';
import { PaymentDismissedError, payCarePlan } from '@/lib/payments';
import { CallMeBack } from '@/lib/CallMeBack';
import { getBookingFor, setBookingFor } from '@/lib/bookingFor';
import { PressScale, Rise, Skeleton, success, tap } from '@/lib/motion';
import { C, F, IS_DARK, clay, ui } from '@/lib/theme';

/**
 * Booking, one decision per step (instead of one long form):
 *   1 Visit   where (home / clinic, address) and who it's for
 *   2 Plan    how many sessions, which days, how to pay
 *   3 Time    start date and time, grouped by part of day
 *   4 Review  everything in one place + the live bill, then book
 * A sticky footer always shows the price and the next action; the hardware
 * back button goes to the previous step.
 */
const STEPS = ['Visit', 'Plan', 'Time', 'Review'] as const;
const MAX_SESSIONS = 30;

export default function BookFlow() {
  const params = useLocalSearchParams<{ id: string; service?: string; mode?: string; proposal?: string }>();
  const id = String(params.id);
  const insets = useSafeAreaInsets();
  const { me, signedIn } = useMe();
  const { place, setPlace, useMyLocation, locating } = useVisitPlace(me?.savedAddresses);
  const scroll = useRef<ScrollView>(null);

  const [step, setStep] = useState(0);
  const [shop, setShop] = useState<ShopPage | null>(null);
  const [loadError, setLoadError] = useState('');
  const [item, setItem] = useState<RateCardLine | null>(null);
  const [mode, setMode] = useState<CareMode>(params.mode === 'CLINIC' ? 'CLINIC' : 'HOME');
  // Started from the Care Circle ("Book for Mom"): prefilled as someone else.
  const bookingFor = getBookingFor();
  const [forWhom, setForWhom] = useState<'me' | 'other'>(bookingFor ? 'other' : 'me');
  const [pd, setPd] = useState({ name: bookingFor?.name || '', age: '', gender: '' as '' | 'Female' | 'Male' | 'Other', relation: bookingFor?.relation || '' });
  const [sessions, setSessions] = useState(1);
  const [custom, setCustom] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [payment, setPayment] = useState<PlanPaymentMode>('PER_SESSION');
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [startDate, setStartDate] = useState('');
  const [time, setTime] = useState('');
  const [proposal, setProposal] = useState<PlanProposalView | null>(null);
  const [quote, setQuote] = useState<CareQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [booking, setBooking] = useState(false);
  const [notice, setNotice] = useState<{ text: string; code?: string } | null>(null);

  // The shop (with the travel fee to the chosen address) and the chosen service.
  useEffect(() => {
    api.marketStore(id, place.coords || undefined).then((r) => {
      setShop(r.store);
      setItem((cur) => cur || r.store.rateCard.find((l) => l.service._id === params.service) || r.store.rateCard[0] || null);
    }).catch((e) => setLoadError(problem(e).message));
  }, [id, place.coords, params.service]);

  // A plan the professional suggested after a visit fixes service, mode and sessions.
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

  const loadSlots = useCallback(() => {
    if (!item) return;
    setDays(null);
    api.marketSlots(id, { serviceId: item.service._id, mode, days: 14 })
      .then((r) => {
        setDays(r.days);
        const first = r.days.find((d) => d.times.length);
        setStartDate((cur) => (cur && r.days.some((d) => d.date === cur && d.times.length) ? cur : first?.date || ''));
      })
      .catch(() => setDays([]));
  }, [id, item, mode]);
  useEffect(loadSlots, [loadSlots]);
  useEffect(() => { if (startDate) setWeekdays((cur) => (cur.length ? cur : [weekdayOf(startDate)])); }, [startDate]);
  const timesForDay = useMemo(() => days?.find((d) => d.date === startDate)?.times || [], [days, startDate]);
  useEffect(() => { if (time && !timesForDay.includes(time)) setTime(''); }, [timesForDay, time]);
  // Fewer decisions: on the Time step the earliest free time is picked for you (shown, easy to change).
  const [autoTime, setAutoTime] = useState(false);
  useEffect(() => {
    if (step === 2 && !time && timesForDay.length) { setTime(timesForDay[0]); setAutoTime(true); }
  }, [step, time, timesForDay]);

  const unit = shop ? KINDS[shop.kind].unit : 'session';
  const price = item ? (mode === 'HOME' ? item.home.price : item.clinic.price) : undefined;
  const discountFor = (n: number) => (item?.sessionDiscounts || []).reduce((b, t) => (n >= t.minSessions && t.percent > b ? t.percent : b), 0);
  const visitOk = Boolean(item && (mode === 'CLINIC' || (place.coords && shop?.homeCovered !== false)) && (forWhom === 'me' || pd.name.trim().length > 1));
  const timeOk = Boolean(startDate && time);
  const ready = Boolean(signedIn && visitOk && timeOk && weekdays.length);
  const stepOk = [visitOk, weekdays.length > 0, timeOk, Boolean(quote && !quoting)][step];

  // Live bill from the server whenever the choices are complete.
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
        paymentMode: sessions > 1 ? payment : 'PER_SESSION',
        schedule: { startDate, time, weekdays: sessions > 1 ? weekdays : undefined },
        ...(mode === 'HOME' ? placeBody(place) : {}),
        ...(forWhom === 'other' ? { patientDetails: { name: pd.name.trim(), age: pd.age ? Number(pd.age) : undefined, gender: pd.gender || undefined, relation: pd.relation || undefined } } : {}),
        ...(proposal ? { proposalId: proposal._id } : {})
      }).then((r) => { if (live) setQuote(r.quote); })
        .catch((e) => { if (live) { setQuote(null); setQuoteError(problem(e).message); } })
        .finally(() => { if (live) setQuoting(false); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [ready, id, item, mode, sessions, payment, startDate, time, weekdays, place, forWhom, pd, proposal]);

  const go = (n: number) => { tap(); setNotice(null); setStep(n); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const back = useCallback(() => { if (step > 0) { setStep((n) => n - 1); return true; } return false; }, [step]);
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [back]));

  const book = async () => {
    if (!quote) return;
    setBooking(true);
    setNotice(null);
    try {
      const { plan } = await api.bookCarePlan(quote._id);
      success();
      setBookingFor(null);
      if (plan.status === 'PENDING_PAYMENT') {
        try { await payCarePlan(plan._id, { name: me?.name, email: me?.email, contact: me?.phone }); } catch (e) {
          if (!(e instanceof PaymentDismissedError)) appAlert('Payment didn’t go through', `${problem(e).message} You can pay from the plan page while your times are held.`);
        }
      }
      router.replace({ pathname: '/care/plan/[id]', params: { id: plan._id, fresh: '1' } });
    } catch (e) {
      const p = problem(e);
      if (p.code === 'PRICE_CHANGED' && p.details?.quote) { setQuote(p.details.quote); setNotice({ text: p.message }); }
      else if (p.code === 'SLOT_TAKEN') { setNotice({ text: p.message, code: p.code }); setTime(''); loadSlots(); }
      else setNotice({ text: p.message });
    } finally {
      setBooking(false);
    }
  };

  if (loadError) return <View style={ui.screen}><TopBar title="Book" /><Empty title={loadError} action={<Btn variant="ghost" label="Back" onPress={() => router.back()} />} /></View>;
  if (!shop || !item) return <View style={ui.screen}><TopBar title="Book" /><View style={{ padding: 16, gap: 12 }}><Skeleton height={90} radius={20} /><Skeleton height={260} radius={24} /></View></View>;

  const options = Array.from(new Set([1, ...item.sessionDiscounts.map((d) => d.minSessions)])).sort((a, b) => a - b).slice(0, 3);
  // A suggested plan (or a typed number) that isn't one of the quick picks shows the stepper.
  const isCustom = custom || !options.includes(sessions);
  const toggleDay = (d: number) => setWeekdays((cur) => (cur.includes(d) ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : [...cur, d].sort()));
  const dayNames = weekdays.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(', ');
  const travel = mode === 'HOME' && shop.travel ? shop.travel.fee : 0;

  // Footer: the price so far and the next action.
  const footerPrice = step === 3 && quote ? inr(quote.amounts.total) : `${inr(price)}`;
  const footerSub = step === 3 && quote
    ? `${quote.sessions} ${unit}${quote.sessions > 1 ? 's' : ''} · ${quote.paymentMode === 'PREPAID' ? 'pay now' : 'pay per visit'}`
    : `per ${unit}${travel ? ` + ${inr(travel)} travel` : ''}`;
  const action = !signedIn
    ? { label: 'Sign In to Book', onPress: () => router.push('/welcome'), disabled: false }
    : step < 3
      ? { label: 'Continue', onPress: () => go(step + 1), disabled: !stepOk }
      : { label: booking ? 'Booking…' : quote?.paymentMode === 'PREPAID' ? 'Book & Pay' : 'Confirm Booking', onPress: book, disabled: !quote || quoting };

  return (
    <View style={ui.screen}>
      <TopBar title={`Book ${item.service.displayName}`} onBack={() => { if (!back()) router.back(); }} />
      <View style={s.progressWrap}>
        <View style={s.progress}>
          {STEPS.map((label, i) => (
            <PressScale key={label} haptic={false} disabled={i >= step} onPress={() => go(i)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Step ${i + 1}: ${label}`}>
              <View style={[s.bar, i <= step && { backgroundColor: C.brand }]} />
              <Text style={[s.barLabel, i === step && { color: C.ink }, i < step && { color: C.brand }]}>{label}</Text>
            </PressScale>
          ))}
        </View>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 130 + insets.bottom, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={s.serviceRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.serviceName}>{item.service.displayName}</Text>
            <Meta>{shop.name} · {hoursLabel(item.durationMinutes)}</Meta>
          </View>
          {proposal ? <View style={s.suggested}><Text style={s.suggestedText}>Suggested plan</Text></View> : null}
        </View>

        {step === 0 && (
          <Rise key="s0" style={{ gap: 16 }}>
            <Title size={20}>Where should the {unit} happen?</Title>
            {homeOk && clinicOk ? (
              <View style={{ gap: 10 }}>
                <ModeCard icon={Home} title="At your home" price={item.home.price} unit={unit}
                  sub={shop.travel ? `+ ${inr(shop.travel.fee)} travel (${shop.travel.roadKm} km)` : `Travel ${inr(shop.home.ratePerKm)}/km, worked out from your address`}
                  on={mode === 'HOME'} disabled={Boolean(proposal)} onPress={() => setMode('HOME')} />
                <ModeCard icon={Building2} title="At the clinic" price={item.clinic.price} unit={unit}
                  sub={[shop.clinic.address?.line1, shop.clinic.address?.city].filter(Boolean).join(', ') + (Number.isFinite(shop.distanceKm) ? ` · ${shop.distanceKm} km away` : '') || 'No travel fee'}
                  on={mode === 'CLINIC'} disabled={Boolean(proposal)} onPress={() => setMode('CLINIC')} />
              </View>
            ) : (
              <Note tone="neutral">{mode === 'HOME' ? `${shop.name} comes to your home for this ${unit}.` : `This ${unit} is at the clinic: ${[shop.clinic.address?.line1, shop.clinic.address?.city].filter(Boolean).join(', ')}.`}</Note>
            )}
            {mode === 'HOME' ? <PlaceCard saved={me?.savedAddresses || []} place={place} onChange={setPlace} onLocate={useMyLocation} locating={locating} signedIn={signedIn} /> : null}
            {mode === 'HOME' && place.coords && shop.homeCovered === false
              ? <Note>{`This address is outside ${shop.name}’s home-visit area (${shop.home.radiusKm} km). ${clinicOk ? 'Choose the clinic, or ' : 'Choose '}another provider.`}</Note> : null}

            <View style={{ gap: 10 }}>
              <Title size={17}>Who is it for?</Title>
              <Seg value={forWhom} onChange={setForWhom} options={[{ value: 'me', label: 'Me' }, { value: 'other', label: 'Someone Else' }]} />
              {forWhom === 'other' && (
                <View style={{ gap: 8 }}>
                  <TextInput style={ui.input} placeholder="Their name, e.g. Kamla Devi" placeholderTextColor={C.muted} value={pd.name} onChangeText={(name) => setPd({ ...pd, name })} autoComplete="off" accessibilityLabel="Their name" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput style={[ui.input, { flex: 1 }]} placeholder="Relation" placeholderTextColor={C.muted} value={pd.relation} onChangeText={(relation) => setPd({ ...pd, relation })} accessibilityLabel="Relation" />
                    <TextInput style={[ui.input, { width: 96 }]} placeholder="Age" placeholderTextColor={C.muted} keyboardType="number-pad" maxLength={3} value={pd.age} onChangeText={(age) => setPd({ ...pd, age: age.replace(/\D/g, '') })} accessibilityLabel="Age" />
                  </View>
                  <Chips>{(['Female', 'Male', 'Other'] as const).map((g) => <Chip key={g} label={g} on={pd.gender === g} onPress={() => setPd({ ...pd, gender: pd.gender === g ? '' : g })} />)}</Chips>
                </View>
              )}
            </View>
          </Rise>
        )}

        {step === 1 && (
          <Rise key="s1" style={{ gap: 16 }}>
            <Title size={20}>How many {unit}s?</Title>
            {proposal ? <Note tone="green">{`${shop.name} suggested ${proposal.sessions} ${unit}s${proposal.note ? `: “${proposal.note}”` : '.'}`}</Note> : null}
            <View style={s.optionGrid}>
              {options.map((n) => {
                const pct = discountFor(n);
                const on = !isCustom && sessions === n;
                return (
                  <OptionCard key={n} on={on} disabled={Boolean(proposal)} onPress={() => { setCustom(false); setSessions(n); }}
                    big={String(n)} label={n === 1 ? `single ${unit}` : `${unit}s`} sub={n === 1 ? inr(price) : pct ? `Save ${pct}% upfront` : `${inr((price || 0) * n)}`} highlight={pct > 0} />
                );
              })}
              <OptionCard on={isCustom} disabled={Boolean(proposal)} onPress={() => setCustom(true)} big="…" label="Custom" sub={`Up to ${MAX_SESSIONS}`} />
            </View>
            {isCustom ? (
              <View style={[s.panel, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <Text style={s.panelTitle}>{sessions} {unit}{sessions > 1 ? 's' : ''}</Text>
                <Stepper value={sessions} max={MAX_SESSIONS} onChange={setSessions} disabled={Boolean(proposal)} />
              </View>
            ) : null}

            {sessions > 1 && (
              <>
                <View style={{ gap: 10 }}>
                  <Title size={17}>On which days?</Title>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {WEEKDAY_LETTERS.map((l, d) => {
                      const on = weekdays.includes(d);
                      return (
                        <PressScale key={d} onPress={() => toggleDay(d)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={WEEKDAY_NAMES[d]}
                          style={[s.day, on && { backgroundColor: C.brand }]}>
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
                <View style={{ gap: 10 }}>
                  <Title size={17}>How would you like to pay?</Title>
                  <PayCard on={payment === 'PER_SESSION'} onPress={() => setPayment('PER_SESSION')} title={`After each ${unit}`} sub="Cash or UPI to the professional" />
                  <PayCard on={payment === 'PREPAID'} onPress={() => setPayment('PREPAID')} title={`Pay now${discountFor(sessions) ? `, save ${discountFor(sessions)}%` : ''}`} sub={`Unused ${unit}s are refunded`} tag={discountFor(sessions) ? 'Best value' : undefined} />
                </View>
              </>
            )}
          </Rise>
        )}

        {step === 2 && (
          <Rise key="s2" style={{ gap: 16 }}>
            <Title size={20}>{sessions > 1 ? 'When should it start?' : 'Pick a date and time'}</Title>
            {days && days.every((d) => !d.times.length) ? (
              <Note tone="neutral">{`No free times in the next two weeks. Try ${mode === 'HOME' && clinicOk ? 'the clinic or ' : ''}another provider.`}</Note>
            ) : (
              <>
                <DateStrip days={days} value={startDate} onChange={setStartDate} />
                {autoTime && time === timesForDay[0] ? <Note tone="neutral">{`We picked the earliest free time, ${fmtTime(time)}. Tap another time to change it.`}</Note> : null}
                {days ? <TimeGroups times={timesForDay} value={time} onChange={(t) => { setAutoTime(false); setTime(t); }} /> : <Skeleton height={160} radius={16} />}
              </>
            )}
            {sessions > 1 && time ? (
              <View style={[s.panel, { flexDirection: 'row', gap: 10, alignItems: 'center' }]}>
                <CalendarDays size={18} color={C.brand} />
                <Text style={[s.panelText, { flex: 1 }]}>{sessions} {unit}s, every {dayNames} at {fmtTime(time)}, starting {fmtDay(startDate)}.</Text>
              </View>
            ) : null}
          </Rise>
        )}

        {step === 3 && (
          <Rise key="s3" style={{ gap: 16 }}>
            <Title size={20}>Review and book</Title>
            <View style={s.group}>
              <ReviewRow icon={mode === 'HOME' ? Home : Building2} label={mode === 'HOME' ? 'At your home' : 'At the clinic'}
                value={mode === 'HOME' ? place.label : [shop.clinic.address?.line1, shop.clinic.address?.city].filter(Boolean).join(', ')} onEdit={() => go(0)} />
              <ReviewRow icon={UserRound} label="For" value={forWhom === 'me' ? (me?.name || 'Me') : `${pd.name}${pd.relation ? ` (${pd.relation})` : ''}`} onEdit={() => go(0)} />
              <ReviewRow icon={CalendarDays} label={`${sessions} ${unit}${sessions > 1 ? 's' : ''}`} value={sessions > 1 ? `Every ${dayNames}` : fmtDay(startDate)} onEdit={() => go(1)} />
              <ReviewRow icon={Clock} label={sessions > 1 ? 'Starts' : 'Time'} value={`${fmtDay(startDate)}, ${fmtTime(time)}`} onEdit={() => go(2)} />
              <ReviewRow icon={CreditCard} label="Payment" value={sessions > 1 && payment === 'PREPAID' ? 'Pay now (online)' : `After each ${unit}`} onEdit={sessions > 1 ? () => go(1) : undefined} last />
            </View>

            <View style={[s.group, { padding: 16, gap: 12 }]}>
              <Title size={17}>Your bill</Title>
              {quoting || (!quote && !quoteError) ? <Skeleton height={130} radius={14} /> : null}
              {quoteError && !quoting ? <Note>{quoteError}</Note> : null}
              {quote && !quoting ? (
                <>
                  <Bill lines={quote.lines.map((l) => ({ key: l.code + l.label, label: l.label, amount: l.amount }))} total={quote.amounts.total} />
                  {quote.paymentMode === 'PER_SESSION' && quote.sessions > 1 ? <Meta>You pay {inr(quote.amounts.perSessionPayable)} after each {unit}.</Meta> : null}
                  {quote.amounts.creditAvailable > 0 ? <Note tone="green">{`${inr(quote.amounts.creditAvailable)} Nabz credit will be used.`}</Note> : null}
                  {quote.schedule.dates.length > 1 ? <Meta>Dates: {quote.schedule.dates.slice(0, 8).map((d) => `${dayShort(d)} ${Number(d.slice(8))}`).join(', ')}{quote.schedule.dates.length > 8 ? '…' : ''}</Meta> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Lock size={12} color={C.muted} /><Meta>Price locked until {fmtClock(quote.expiresAt)}</Meta></View>
                </>
              ) : null}
            </View>
            {notice ? (
              <View style={{ gap: 8 }}>
                <Note>{notice.text}</Note>
                {notice.code === 'SLOT_TAKEN' ? <Btn variant="soft" label="Pick Another Time" onPress={() => go(2)} /> : null}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><MapPin size={13} color={C.muted} /><Meta style={{ flex: 1 }}>Free cancellation until the professional is on the way.</Meta></View>
            <CallMeBack topic="BOOKING" label="Not sure? Talk to us first" />
          </Rise>
        )}
      </ScrollView>

      {/* Sticky footer: price so far + the next step */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.footerPrice}>{footerPrice}</Text>
          <Text style={s.footerSub} numberOfLines={1}>{footerSub}</Text>
        </View>
        <Btn label={action.label} onPress={action.onPress} disabled={action.disabled} loading={booking} style={{ minWidth: 168 }} />
      </View>
    </View>
  );
}

function ModeCard({ icon: Icon, title, sub, price, unit, on, onPress, disabled }: { icon: LucideIcon; title: string; sub: string; price?: number; unit: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <PressScale onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} style={[s.choice, on && s.choiceOn]}>
      <View style={[s.choiceIcon, on && { backgroundColor: C.brand }]}><Icon size={20} color={on ? '#ffffff' : C.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.choiceTitle}>{title}</Text>
        <Text style={s.choiceSub} numberOfLines={2}>{sub}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.choicePrice}>{inr(price)}</Text>
        <Text style={s.choiceUnit}>per {unit}</Text>
      </View>
    </PressScale>
  );
}

function OptionCard({ big, label, sub, on, onPress, disabled, highlight }: { big: string; label: string; sub: string; on: boolean; onPress: () => void; disabled?: boolean; highlight?: boolean }) {
  return (
    <PressScale onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} accessibilityLabel={`${big} ${label}, ${sub}`}
      style={[s.option, on && s.choiceOn, disabled && !on && { opacity: 0.5 }]}>
      <Text style={[s.optionBig, on && { color: C.brand }]}>{big}</Text>
      <Text style={s.optionLabel}>{label}</Text>
      <Text style={[s.optionSub, highlight && { color: C.mint }]}>{sub}</Text>
      {on ? <View style={s.tick}><Check size={12} color="#ffffff" strokeWidth={3} /></View> : null}
    </PressScale>
  );
}

function PayCard({ title, sub, on, onPress, tag }: { title: string; sub: string; on: boolean; onPress: () => void; tag?: string }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[s.choice, on && s.choiceOn]}>
      <View style={[s.radio, on && { borderColor: C.brand }]}>{on ? <View style={s.radioDot} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.choiceTitle}>{title}</Text>
        <Text style={s.choiceSub}>{sub}</Text>
      </View>
      {tag ? <View style={s.tag}><Text style={s.tagText}>{tag}</Text></View> : null}
    </PressScale>
  );
}

function ReviewRow({ icon: Icon, label, value, onEdit, last }: { icon: LucideIcon; label: string; value: string; onEdit?: () => void; last?: boolean }) {
  return (
    <View style={[s.reviewRow, !last && s.hairline]}>
      <Icon size={18} color={C.brand} />
      <View style={{ flex: 1 }}>
        <Label>{label}</Label>
        <Text style={s.reviewValue} numberOfLines={2}>{value}</Text>
      </View>
      {onEdit ? <PressScale onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Change ${label}`} style={s.edit}><Text style={s.editText}>Change</Text></PressScale> : null}
    </View>
  );
}

const s = StyleSheet.create({
  progressWrap: { paddingHorizontal: 16, paddingBottom: 10, backgroundColor: C.bg },
  progress: { flexDirection: 'row', gap: 6 },
  bar: { height: 4, borderRadius: 2, backgroundColor: C.border },
  barLabel: { fontFamily: F.bold, fontSize: 11, color: C.muted, marginTop: 6 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  serviceName: { fontFamily: F.display, fontSize: 16, color: C.ink },
  suggested: { backgroundColor: C.mintSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  suggestedText: { color: C.mint, fontFamily: F.heavy, fontSize: 11 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  choiceOn: { borderColor: C.brand, backgroundColor: IS_DARK ? C.brandSoft : '#fff8f9' },
  choiceIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  choiceSub: { fontFamily: F.medium, fontSize: 12, color: C.muted, marginTop: 2 },
  choicePrice: { fontFamily: F.display, fontSize: 17, color: C.ink },
  choiceUnit: { fontFamily: F.medium, fontSize: 11, color: C.muted },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { flexBasis: '47.5%', flexGrow: 1, padding: 14, borderRadius: 20, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, gap: 2 },
  optionBig: { fontFamily: F.display, fontSize: 28, color: C.ink },
  optionLabel: { fontFamily: F.bold, fontSize: 13, color: C.ink },
  optionSub: { fontFamily: F.semi, fontSize: 12, color: C.muted, marginTop: 4 },
  tick: { position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 11, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: C.cardAlt, borderRadius: 18, padding: 12 },
  panelTitle: { fontFamily: F.display, fontSize: 18, color: C.ink, paddingLeft: 6 },
  panelText: { fontFamily: F.semi, fontSize: 13, color: C.inkSoft, lineHeight: 19 },
  day: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardAlt },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.faint, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.brand },
  tag: { backgroundColor: C.mintSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { color: C.mint, fontFamily: F.heavy, fontSize: 10 },
  group: { backgroundColor: C.card, borderRadius: 22, ...clay },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  hairline: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  reviewValue: { fontFamily: F.bold, fontSize: 14, color: C.ink, marginTop: 2 },
  edit: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: C.brandSoft },
  editText: { color: C.brandDark, fontFamily: F.bold, fontSize: 12 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingTop: 12, backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    boxShadow: IS_DARK ? '0 -8px 24px rgba(0,0,0,0.5)' : '0 -10px 30px -12px rgba(92,13,34,0.22)'
  },
  footerPrice: { fontFamily: F.display, fontSize: 22, color: C.ink },
  footerSub: { fontFamily: F.medium, fontSize: 12, color: C.muted }
});
