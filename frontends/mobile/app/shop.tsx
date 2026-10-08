import { useCallback, useEffect, useMemo, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { BadgeCheck, CalendarOff, LocateFixed, Megaphone, PauseCircle, PlayCircle, Plus, Save, Store, Tag, Trash2, Users } from 'lucide-react-native';
import type { DayHours, MarketService, MyRateCardItem, MyShop, ShopKind, SlotDay, TeamMember } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { KINDS, fmtDay, hoursLabel, inr, problem, todayIst } from '@/lib/market';
import { Badge, Btn, Card, Chip, Chips, DateStrip, Empty, Label, Meta, MkHero, Note, Screen, Seg, Title, TopBar, mk } from '@/lib/marketUI';
import { PressScale, Skeleton, success } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

/**
 * Partner "My Shop" (mirrors the website's /partner/shop): profile, where you
 * work and your hours, the rate card (your prices per service, home / clinic,
 * plan discounts, new-customer offer), team, leave and pause, booked plans.
 */
const DAYS: DayHours['day'][] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const TABS = [['profile', 'Shop & Hours'], ['menu', 'Rate Card'], ['team', 'Team'], ['leave', 'Leave & Pause'], ['plans', 'Plans']] as const;
type Tab = typeof TABS[number][0];

const confirm = (title: string, message: string, label: string) => new Promise<boolean>((resolve) => {
  appAlert(title, message, [{ text: 'Not Now', style: 'cancel', onPress: () => resolve(false) }, { text: label, onPress: () => resolve(true) }], { onDismiss: () => resolve(false) });
});

export default function PartnerShop() {
  const params = useLocalSearchParams<{ kind?: string; tab?: string }>();
  const [tab, setTab] = useState<Tab>((params.tab as Tab) || 'profile');
  const [kind, setKind] = useState<ShopKind | undefined>((params.kind as ShopKind) || undefined);
  const [kinds, setKinds] = useState<ShopKind[]>([]);
  const [shop, setShop] = useState<MyShop | null>(null);
  const [rateCard, setRateCard] = useState<MyRateCardItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => api.myShop(kind).then((r) => {
    setKinds(r.kinds);
    setShop(r.store);
    setRateCard(r.rateCard);
    setLoaded(true);
    if (!kind && r.store) setKind(r.store.kind);
    if (!kind && !r.store && r.kinds[0]) setKind(r.kinds[0]);
  }).catch((e) => { setError(problem(e).message); setLoaded(true); }), [kind]);
  useEffect(() => { load(); }, [load]);

  if (!loaded) return <View style={ui.screen}><TopBar title="My Shop" /><View style={{ padding: 16, gap: 12 }}><Skeleton height={180} radius={28} /><Skeleton height={300} radius={24} /></View></View>;
  if (error && !shop && !kinds.length) return <View style={ui.screen}><TopBar title="My Shop" /><Empty title={error} /></View>;
  const meta = kind ? KINDS[kind] : KINDS.PHYSIO;
  const statusLabel = shop ? (shop.status === 'APPROVED' ? 'Live' : shop.status === 'PENDING' ? 'Waiting for Nabz review' : shop.status === 'SUSPENDED' ? 'Suspended' : 'Not approved') : '';

  return (
    <Screen header={<TopBar title="My Shop" right={shop ? <Btn small variant="soft" icon={Megaphone} label="Ads" onPress={() => router.push('/partner-ads')} /> : undefined} />}>
      <MkHero
        title={shop ? shop.name : `Open your ${meta.label.toLowerCase()} shop`}
        subtitle={shop ? 'Set your own prices, hours and where you go. Customers compare and book you directly.' : 'Customers near you compare providers and book the one they like. You set the prices.'}
        art={meta.art}
      >
        {shop ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge tone={shop.status === 'APPROVED' ? 'green' : 'onDark'} label={statusLabel} />
            {shop.isPaused ? <Badge tone="onDark" label="Paused" /> : null}
            {shop.rating.count > 0 ? <Badge tone="onDark" label={`${shop.rating.avg.toFixed(1)} from ${shop.rating.count} reviews`} /> : null}
          </View>
        ) : null}
      </MkHero>
      {shop?.statusReason && shop.status !== 'APPROVED' ? <Note>{shop.statusReason}</Note> : null}
      {kinds.length > 1 ? (
        <Chips>{kinds.map((k) => <Chip key={k} label={KINDS[k].label} on={kind === k} onPress={() => { setKind(k); setLoaded(false); }} />)}</Chips>
      ) : null}
      {shop ? (
        <Chips>{TABS.filter(([t]) => t !== 'team' || shop.format !== 'SOLO').map(([t, label]) => <Chip key={t} label={label} on={tab === t} onPress={() => setTab(t)} />)}</Chips>
      ) : null}

      {(!shop || tab === 'profile') && kind ? <ProfileForm key={`${kind}${shop?._id || ''}`} kind={kind} shop={shop} onSaved={load} /> : null}
      {shop && tab === 'menu' ? <RateCardEditor shop={shop} rateCard={rateCard} onSaved={load} /> : null}
      {shop && tab === 'team' ? <TeamEditor kind={shop.kind} /> : null}
      {shop && tab === 'leave' ? <LeaveEditor shop={shop} onSaved={load} /> : null}
      {shop && tab === 'plans' ? <PlansList /> : null}
    </Screen>
  );
}

// ── Small form pieces ────────────────────────────────────────────────────

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return <View style={{ gap: 6 }}><Label>{label}</Label>{children}{help ? <Meta>{help}</Meta> : null}</View>;
}
function Input(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={C.muted} {...props} style={[ui.input, props.style]} />;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[mk.row, { justifyContent: 'space-between' }]}>
      <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 14, color: C.ink }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.brand, false: C.faint }} thumbColor="#ffffff" accessibilityLabel={label} />
    </View>
  );
}
/** "930" → "09:30"; keeps HH:MM. */
const toHHMM = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, d.length - 2).padStart(2, '0')}:${d.slice(-2)}`;
};
const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

type Range = { open: string; close: string };
type Week = Record<DayHours['day'], Range[]>;
const toRanges = (hours: DayHours[] | undefined) => Object.fromEntries(DAYS.map((d) => [d, (hours || []).filter((h) => h.day === d).map((h) => ({ open: h.open, close: h.close }))])) as Week;
const fromRanges = (r: Week): DayHours[] => DAYS.flatMap((d) => r[d].filter((x) => validTime(x.open) && validTime(x.close)).map((x) => ({ day: d, ...x })));

function HoursEditor({ label, value, onChange }: { label: string; value: Week; onChange: (v: Week) => void }) {
  const set = (d: DayHours['day'], i: number, k: 'open' | 'close', v: string) => onChange({ ...value, [d]: value[d].map((r, j) => (j === i ? { ...r, [k]: k === 'close' && v === '00:00' ? '23:59' : v } : r)) });
  return (
    <View style={{ backgroundColor: C.cardAlt, borderRadius: 20, padding: 12, gap: 10 }}>
      <Title size={15}>{label}</Title>
      {DAYS.map((d) => (
        <View key={d} style={{ gap: 6 }}>
          <View style={[mk.row, { gap: 8 }]}>
            <Text style={{ width: 40, fontFamily: F.heavy, color: C.ink }}>{d.slice(0, 1) + d.slice(1).toLowerCase()}</Text>
            {value[d].length === 0 ? <Meta style={{ flex: 1 }}>Closed</Meta> : <View style={{ flex: 1 }} />}
            {value[d].length < 2 ? <Btn small variant="soft" icon={Plus} label={value[d].length ? '2nd Shift' : 'Open'} onPress={() => onChange({ ...value, [d]: [...value[d], value[d].length ? { open: '17:00', close: '21:00' } : { open: '09:00', close: '19:00' }] })} /> : null}
          </View>
          {value[d].map((r, i) => (
            <View key={i} style={[mk.row, { gap: 8, paddingLeft: 48 }]}>
              <Input style={{ flex: 1, paddingVertical: 9, textAlign: 'center' }} keyboardType="number-pad" maxLength={5} value={r.open} onChangeText={(v) => set(d, i, 'open', toHHMM(v))} accessibilityLabel={`${d} opens`} />
              <Meta>to</Meta>
              <Input style={{ flex: 1, paddingVertical: 9, textAlign: 'center' }} keyboardType="number-pad" maxLength={5} value={r.close} onChangeText={(v) => set(d, i, 'close', toHHMM(v))} accessibilityLabel={`${d} closes`} />
              <PressScale onPress={() => onChange({ ...value, [d]: value[d].filter((_, j) => j !== i) })} accessibilityRole="button" accessibilityLabel={`Remove ${d} hours`} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card }}>
                <Trash2 size={15} color={C.muted} />
              </PressScale>
            </View>
          ))}
        </View>
      ))}
      <Btn small variant="ghost" label="Copy Monday to All Days" onPress={() => onChange(Object.fromEntries(DAYS.map((d) => [d, value.MON.map((r) => ({ ...r }))])) as Week)} />
      <Meta>24-hour times (e.g. 09:00, 18:30). Night shifts: close at 23:59 and open the next day at 00:00.</Meta>
    </View>
  );
}

// ── Profile, location and hours ──────────────────────────────────────────

function ProfileForm({ kind, shop, onSaved }: { kind: ShopKind; shop: MyShop | null; onSaved: () => void }) {
  const isLab = kind === 'LAB';
  const [f, setF] = useState(() => ({
    name: shop?.name || '',
    format: (shop?.format || (isLab ? 'LAB' : 'SOLO')) as MyShop['format'],
    regNumber: shop?.registration?.number || '',
    regBody: shop?.registration?.body || '',
    bio: shop?.bio || '',
    languages: (shop?.languages || []).join(', '),
    gender: shop?.gender || '',
    qualification: shop?.qualification || '',
    experienceYears: shop?.experienceYears ? String(shop.experienceYears) : '',
    line1: shop?.address?.line1 || '', city: shop?.address?.city || '', pincode: shop?.address?.pincode || '',
    lat: shop ? shop.location.coordinates[1] : NaN, lng: shop ? shop.location.coordinates[0] : NaN,
    clinicOn: shop ? shop.clinic.enabled : kind !== 'HOMECARE',
    capacity: String(shop?.clinic.capacity || 1),
    homeOn: shop ? shop.home.enabled : kind !== 'LAB',
    radiusKm: String(shop?.home.radiusKm || 8),
    ratePerKm: String(shop?.home.ratePerKm || 12),
    bufferMinutes: String(shop?.home.bufferMinutes ?? 30),
    homeCapacity: String(shop?.home.capacity || 1),
    freeAbove: String(shop?.home.freeCollectionAbove || 0)
  }));
  const [clinicHours, setClinicHours] = useState(() => toRanges(shop?.clinic.hours?.length ? shop.clinic.hours : DAYS.slice(0, 6).map((day) => ({ day, open: '09:00', close: '19:00' }))));
  const [homeHours, setHomeHours] = useState(() => toRanges(shop?.home.hours?.length ? shop.home.hours : DAYS.map((day) => ({ day, open: kind === 'HOMECARE' ? '00:00' : '08:00', close: kind === 'HOMECARE' ? '23:59' : '20:00' }))));
  const [saving, setSaving] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [msg, setMsg] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const pin = async () => {
    setPinning(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setMsg('Allow location access to pin your clinic or base.'); return; }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setF((x) => ({ ...x, lat: p.coords.latitude, lng: p.coords.longitude }));
    } catch { setMsg('Couldn’t get your location. Try again outdoors.'); } finally { setPinning(false); }
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const r = await api.saveMyShop({
        kind,
        name: f.name,
        format: f.format,
        registration: { number: f.regNumber || undefined, body: f.regBody || undefined },
        bio: f.bio,
        languages: f.languages.split(',').map((x) => x.trim()).filter(Boolean),
        gender: f.gender || undefined,
        qualification: f.qualification || undefined,
        experienceYears: f.experienceYears ? Number(f.experienceYears) : undefined,
        address: { line1: f.line1, city: f.city, pincode: f.pincode || undefined },
        ...(Number.isFinite(f.lat) ? { location: { lat: f.lat, lng: f.lng } } : {}),
        clinic: { enabled: f.clinicOn, capacity: Number(f.capacity) || 1, hours: fromRanges(clinicHours) },
        home: { enabled: f.homeOn, radiusKm: Number(f.radiusKm), ratePerKm: Number(f.ratePerKm), bufferMinutes: Number(f.bufferMinutes), capacity: Number(f.homeCapacity) || 1, hours: fromRanges(homeHours), ...(isLab ? { freeCollectionAbove: Number(f.freeAbove) || 0 } : {}) }
      });
      success();
      setMsg(r.warnings.length ? r.warnings.join(' ') : 'Saved.');
      onSaved();
    } catch (err) { setMsg(problem(err).message); } finally { setSaving(false); }
  };

  return (
    <Card style={{ gap: 16 }}>
      <View style={mk.row}><Store size={18} color={C.brand} /><Title size={19}>Shop details</Title></View>
      <Field label={isLab ? 'Lab name' : 'Name customers see'}><Input value={f.name} onChangeText={(v) => set('name', v)} autoComplete="organization" /></Field>
      {!isLab ? (
        <Field label="Type">
          <Seg value={f.format} onChange={(v) => set('format', v)} options={[{ value: 'SOLO', label: 'Just me' }, { value: 'CLINIC', label: kind === 'HOMECARE' ? 'Agency' : 'Clinic team' }]} />
        </Field>
      ) : null}
      <Field label={isLab ? 'NABL certificate number' : 'Council registration number'}><Input value={f.regNumber} onChangeText={(v) => set('regNumber', v)} autoCapitalize="characters" autoCorrect={false} /></Field>
      <Field label={isLab ? 'Accrediting body' : 'Council'}><Input value={f.regBody} onChangeText={(v) => set('regBody', v)} placeholder={isLab ? 'NABL' : 'e.g. Rajasthan Physiotherapy Council'} /></Field>
      <Field label="About you"><Input value={f.bio} onChangeText={(v) => set('bio', v)} multiline maxLength={600} style={{ minHeight: 90, textAlignVertical: 'top' }} placeholder="What you treat, your approach, special training" /></Field>
      {!isLab ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Qualification"><Input value={f.qualification} onChangeText={(v) => set('qualification', v)} placeholder="BPT, MPT, GNM" /></Field></View>
            <View style={{ width: 110 }}><Field label="Years"><Input value={f.experienceYears} keyboardType="number-pad" maxLength={2} onChangeText={(v) => set('experienceYears', v.replace(/\D/g, ''))} /></Field></View>
          </View>
          <Field label="Languages"><Input value={f.languages} onChangeText={(v) => set('languages', v)} placeholder="Hindi, English" /></Field>
          {f.format === 'SOLO' ? (
            <Field label="Gender (shown to customers)">
              <Chips>{[['', 'Prefer not to say'], ['FEMALE', 'Female'], ['MALE', 'Male'], ['OTHER', 'Other']].map(([v, l]) => <Chip key={v} label={l} on={f.gender === v} onPress={() => set('gender', v)} />)}</Chips>
            </Field>
          ) : null}
        </>
      ) : null}

      <View style={{ backgroundColor: C.cardAlt, borderRadius: 20, padding: 12, gap: 10 }}>
        <Title size={15}>Where you are</Title>
        <Input value={f.line1} onChangeText={(v) => set('line1', v)} placeholder="Address" autoComplete="street-address" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Input style={{ flex: 1 }} value={f.city} onChangeText={(v) => set('city', v)} placeholder="City" />
          <Input style={{ width: 120 }} value={f.pincode} keyboardType="number-pad" maxLength={6} onChangeText={(v) => set('pincode', v.replace(/\D/g, ''))} placeholder="PIN" />
        </View>
        <Meta>{Number.isFinite(f.lat) ? `Pinned at ${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}` : 'Not pinned yet. Stand at your clinic or base and pin it.'}</Meta>
        <Btn small variant="ghost" icon={LocateFixed} label={pinning ? 'Locating…' : 'Pin Here'} loading={pinning} onPress={pin} />
        <Meta>Customers see your clinic address. If you only do home visits, your pin stays private and is used only to measure travel.</Meta>
      </View>

      {kind !== 'HOMECARE' ? (
        <View style={{ gap: 10 }}>
          <Toggle label={isLab ? 'Walk-in at the lab' : 'Patients can visit my clinic'} value={f.clinicOn} onChange={(v) => set('clinicOn', v)} />
          {f.clinicOn ? (
            <>
              {f.format !== 'SOLO' ? <Field label={isLab ? 'Patients at once' : 'Patients at the same time'}><Input value={f.capacity} keyboardType="number-pad" maxLength={2} onChangeText={(v) => set('capacity', v.replace(/\D/g, ''))} /></Field> : null}
              <HoursEditor label={isLab ? 'Lab hours' : 'Clinic hours'} value={clinicHours} onChange={setClinicHours} />
            </>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <Toggle label={isLab ? 'Home sample collection' : 'I go to patients’ homes'} value={f.homeOn} onChange={(v) => set('homeOn', v)} />
        {f.homeOn ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Field label="Travel up to (km)"><Input value={f.radiusKm} keyboardType="number-pad" maxLength={2} onChangeText={(v) => set('radiusKm', v.replace(/\D/g, ''))} /></Field></View>
              <View style={{ flex: 1 }}><Field label="₹ per km (10–15)"><Input value={f.ratePerKm} keyboardType="decimal-pad" maxLength={4} onChangeText={(v) => set('ratePerKm', v.replace(/[^\d.]/g, ''))} /></Field></View>
            </View>
            <Meta>Nabz measures the distance. Travel goes fully to you.</Meta>
            {kind !== 'HOMECARE' ? <Field label="Minutes between home visits"><Input value={f.bufferMinutes} keyboardType="number-pad" maxLength={3} onChangeText={(v) => set('bufferMinutes', v.replace(/\D/g, ''))} /></Field> : null}
            {f.format !== 'SOLO' ? <Field label={isLab ? 'Phlebotomists out at once' : 'Home visits at the same time'}><Input value={f.homeCapacity} keyboardType="number-pad" maxLength={2} onChangeText={(v) => set('homeCapacity', v.replace(/\D/g, ''))} /></Field> : null}
            {isLab ? <Field label="Free collection above (₹, 0 = never)"><Input value={f.freeAbove} keyboardType="number-pad" onChangeText={(v) => set('freeAbove', v.replace(/\D/g, ''))} /></Field> : null}
            <HoursEditor label={kind === 'HOMECARE' ? 'When caregivers can start shifts' : isLab ? 'Collection hours' : 'Home-visit hours'} value={homeHours} onChange={setHomeHours} />
          </>
        ) : null}
      </View>

      {msg ? <Note tone={msg === 'Saved.' ? 'green' : 'red'}>{msg}</Note> : null}
      <Btn icon={Save} label={saving ? 'Saving…' : shop ? 'Save Changes' : 'Create My Shop'} loading={saving} onPress={save} />
    </Card>
  );
}

// ── Rate card ────────────────────────────────────────────────────────────

function RateCardEditor({ shop, rateCard, onSaved }: { shop: MyShop; rateCard: MyRateCardItem[]; onSaved: () => void }) {
  const [catalog, setCatalog] = useState<MarketService[] | null>(null);
  useEffect(() => { api.marketServices(shop.kind).then((r) => setCatalog(r.services)).catch(() => setCatalog([])); }, [shop.kind]);
  const byService = useMemo(() => new Map(rateCard.map((r) => [r.service._id, r])), [rateCard]);
  if (!catalog) return <Skeleton height={200} radius={22} />;
  return (
    <>
      <Note tone="neutral">Set your price for each service you offer. Each service has a Nabz price range. Customers who book several sessions upfront get your plan discount.</Note>
      {catalog.map((sv) => <RateRow key={sv._id} shop={shop} service={sv} item={byService.get(sv._id)} onSaved={onSaved} />)}
    </>
  );
}

function RateRow({ shop, service, item, onSaved }: { shop: MyShop; service: MarketService; item?: MyRateCardItem; onSaved: () => void }) {
  const isHomecare = shop.kind === 'HOMECARE';
  const isLab = shop.kind === 'LAB';
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(() => ({
    clinicOn: item ? item.clinic.enabled && item.isActive : false,
    clinicPrice: item?.clinic.price != null ? String(item.clinic.price) : '',
    homeOn: item ? item.home.enabled && item.isActive : false,
    homePrice: item?.home.price != null ? String(item.home.price) : '',
    duration: String(item?.durationMinutes || service.defaultDurationMinutes || 45),
    liveIn: Boolean(item?.liveIn),
    discounts: (item?.sessionDiscounts || []).map((d) => ({ minSessions: String(d.minSessions), percent: String(d.percent) })),
    offerPct: item?.offer?.percent ? String(item.offer.percent) : '',
    offerMax: item?.offer?.maxDiscount ? String(item.offer.maxDiscount) : ''
  }));
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const active = Boolean(item && item.isActive && (item.clinic.enabled || item.home.enabled));
  const num = (v: string) => v.replace(/[^\d.]/g, '');

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const r = await api.saveRateCardItem(service._id, {
        kind: shop.kind,
        clinic: { enabled: f.clinicOn && !isHomecare && service.clinicAllowed, price: f.clinicPrice ? Number(f.clinicPrice) : undefined },
        home: { enabled: f.homeOn && service.homeAllowed, price: f.homePrice ? Number(f.homePrice) : undefined },
        durationMinutes: Number(f.duration),
        liveIn: f.liveIn,
        sessionDiscounts: f.discounts.filter((d) => d.minSessions && d.percent).map((d) => ({ minSessions: Number(d.minSessions), percent: Number(d.percent) }))
      });
      if (f.offerPct && f.offerMax && (!item?.offer || Number(f.offerPct) !== item.offer.percent || Number(f.offerMax) !== item.offer.maxDiscount)) {
        await api.setShopOffer(service._id, { percent: Number(f.offerPct), maxDiscount: Number(f.offerMax), kind: shop.kind });
      }
      success();
      setMsg(r.warnings.length ? r.warnings.join(' ') : 'Saved.');
      onSaved();
    } catch (e) { setMsg(problem(e).message); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!(await confirm(`Stop offering ${service.displayName}?`, 'Booked sessions stay booked.', 'Stop Offering'))) return;
    try { const r = await api.removeRateCardItem(service._id, shop.kind); if (r.warnings.length) appAlert('Removed', r.warnings.join(' ')); onSaved(); } catch (e) { setMsg(problem(e).message); }
  };

  return (
    <Card style={[{ gap: 12, padding: 14 }, active && { borderLeftWidth: 4, borderLeftColor: C.brand }]}>
      <View style={mk.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{service.displayName}</Text>
          <Meta>Nabz range {inr(service.priceFloor)} to {inr(service.priceCeiling)}{active && item ? ` · ${[item.clinic.enabled ? `clinic ${inr(item.clinic.price)}` : '', item.home.enabled ? `home ${inr(item.home.price)}` : ''].filter(Boolean).join(', ')} · ${hoursLabel(item.durationMinutes)}` : ''}</Meta>
          {item?.offer ? <Badge tone={item.offer.status === 'APPROVED' ? 'green' : item.offer.status === 'REJECTED' ? 'red' : 'amber'} icon={Tag} label={`${item.offer.percent}% offer: ${item.offer.status === 'PENDING' ? 'in review' : item.offer.status.toLowerCase()}`} /> : null}
        </View>
        <Btn small variant={active ? 'soft' : 'primary'} label={open ? 'Close' : active ? 'Edit' : 'Offer This'} onPress={() => setOpen((o) => !o)} />
      </View>
      {open ? (
        <View style={{ gap: 12 }}>
          {!isHomecare && service.clinicAllowed ? (
            <View style={{ gap: 6 }}>
              <Toggle label={`At the ${isLab ? 'lab' : 'clinic'}`} value={f.clinicOn} onChange={(v) => setF({ ...f, clinicOn: v })} />
              {f.clinicOn ? <Input value={f.clinicPrice} keyboardType="decimal-pad" placeholder="₹ price" onChangeText={(v) => setF({ ...f, clinicPrice: num(v) })} accessibilityLabel="Clinic price in rupees" /> : null}
            </View>
          ) : null}
          {service.homeAllowed ? (
            <View style={{ gap: 6 }}>
              <Toggle label={isLab ? 'Home collection' : 'At home'} value={f.homeOn} onChange={(v) => setF({ ...f, homeOn: v })} />
              {f.homeOn ? <Input value={f.homePrice} keyboardType="decimal-pad" placeholder={f.clinicPrice ? `Same as clinic (${inr(Number(f.clinicPrice))})` : '₹ price'} onChangeText={(v) => setF({ ...f, homePrice: num(v) })} accessibilityLabel="Home price in rupees" /> : null}
            </View>
          ) : null}
          {!isLab ? (
            <Field label={isHomecare ? 'Shift length (minutes)' : 'Session length (minutes)'} help={isHomecare ? '480 = 8 hours, 720 = 12 hours, 1440 = 24 hours' : undefined}>
              <Input value={f.duration} keyboardType="number-pad" maxLength={4} onChangeText={(v) => setF({ ...f, duration: v.replace(/\D/g, '') })} />
            </Field>
          ) : null}
          {isHomecare && Number(f.duration) === 1440 ? <Toggle label="Live-in (travel charged once)" value={f.liveIn} onChange={(v) => setF({ ...f, liveIn: v })} /> : null}
          {!isLab ? (
            <View style={{ gap: 8 }}>
              <Label>Discounts for plans paid upfront</Label>
              {f.discounts.map((d, i) => (
                <View key={i} style={[mk.row, { gap: 6 }]}>
                  <Input style={{ width: 70, paddingVertical: 9, textAlign: 'center' }} keyboardType="number-pad" maxLength={2} value={d.minSessions} onChangeText={(v) => setF({ ...f, discounts: f.discounts.map((x, j) => (j === i ? { ...x, minSessions: v.replace(/\D/g, '') } : x)) })} accessibilityLabel="From sessions" />
                  <Meta>sessions:</Meta>
                  <Input style={{ width: 64, paddingVertical: 9, textAlign: 'center' }} keyboardType="number-pad" maxLength={2} value={d.percent} onChangeText={(v) => setF({ ...f, discounts: f.discounts.map((x, j) => (j === i ? { ...x, percent: v.replace(/\D/g, '') } : x)) })} accessibilityLabel="Percent off" />
                  <Meta style={{ flex: 1 }}>% off</Meta>
                  <PressScale onPress={() => setF({ ...f, discounts: f.discounts.filter((_, j) => j !== i) })} accessibilityRole="button" accessibilityLabel="Remove discount" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardAlt }}>
                    <Trash2 size={15} color={C.muted} />
                  </PressScale>
                </View>
              ))}
              {f.discounts.length < 3 ? <Btn small variant="soft" icon={Plus} label="Add Discount" onPress={() => setF({ ...f, discounts: [...f.discounts, { minSessions: f.discounts.length ? '10' : '5', percent: f.discounts.length ? '10' : '5' }] })} /> : null}
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <Label>New-customer offer (you fund it, Nabz reviews it)</Label>
            <View style={[mk.row, { gap: 6, flexWrap: 'wrap' }]}>
              <Input style={{ width: 64, paddingVertical: 9, textAlign: 'center' }} keyboardType="number-pad" maxLength={2} value={f.offerPct} placeholder="%" onChangeText={(v) => setF({ ...f, offerPct: v.replace(/\D/g, '') })} accessibilityLabel="Offer percent" />
              <Meta>% off the first session, up to</Meta>
              <Input style={{ width: 90, paddingVertical: 9, textAlign: 'center' }} keyboardType="number-pad" maxLength={5} value={f.offerMax} placeholder="₹" onChangeText={(v) => setF({ ...f, offerMax: v.replace(/\D/g, '') })} accessibilityLabel="Maximum discount in rupees" />
            </View>
            {item?.offer ? <Btn small variant="ghost" label="Remove Offer" onPress={async () => { await api.removeShopOffer(service._id, shop.kind).catch(() => undefined); onSaved(); }} /> : null}
          </View>
          {msg ? <Note tone={msg === 'Saved.' ? 'green' : 'red'}>{msg}</Note> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small label={saving ? 'Saving…' : 'Save Service'} loading={saving} onPress={save} style={{ flex: 1 }} />
            {active ? <Btn small variant="ghost" label="Stop Offering" onPress={remove} /> : null}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

// ── Team, leave, plans ───────────────────────────────────────────────────

function TeamEditor({ kind }: { kind: ShopKind }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [who, setWho] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api.myTeam(kind).then((r) => setMembers(r.members)).catch((e) => setMsg(problem(e).message)), [kind]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    setMsg('');
    try {
      const v = who.trim();
      const r = await api.addTeamMember(v.includes('@') ? { email: v, kind } : { phone: v, kind });
      setMembers(r.members);
      setWho('');
    } catch (err) { setMsg(problem(err).message); }
  };
  const remove = async (m: TeamMember) => {
    if (!(await confirm(`Remove ${m.name}?`, 'Their upcoming sessions go back to the families to move or cancel for free.', 'Remove'))) return;
    try { const r = await api.removeTeamMember(m.user, kind); setMembers(r.members); if (r.released) setMsg(`${r.released} upcoming sessions were released to the families.`); } catch (err) { setMsg(problem(err).message); }
  };
  return (
    <Card style={{ gap: 14 }}>
      <View style={mk.row}><Users size={18} color={C.brand} /><Title size={19}>Team</Title></View>
      <Meta>Each home booking gets one named person for every day. Add verified Nabz partners by their phone or email.</Meta>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Input style={{ flex: 1 }} value={who} onChangeText={setWho} placeholder="98765… or name@email.com" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Phone or email of the team member" />
        <Btn icon={Plus} label="Add" disabled={!who.trim()} onPress={add} />
      </View>
      {msg ? <Note>{msg}</Note> : null}
      {!members ? <Skeleton height={60} radius={16} /> : null}
      {(members || []).map((m) => (
        <View key={m.user} style={[mk.row, { opacity: m.active ? 1 : 0.5 }]}>
          <View style={[mk.tile, { width: 40, height: 40, borderRadius: 14 }]}><Text style={{ fontFamily: F.display, color: C.brand }}>{(m.name || '?')[0]}</Text></View>
          <View style={{ flex: 1 }}><Text style={{ fontFamily: F.bold, color: C.ink }}>{m.name}</Text><Meta>{m.role.toLowerCase()}{m.qualification ? ` · ${m.qualification}` : ''}{m.active ? '' : ' · removed'}</Meta></View>
          {m.active && m.role !== 'MANAGER' ? <Btn small variant="ghost" label="Remove" onPress={() => remove(m)} /> : null}
        </View>
      ))}
    </Card>
  );
}

/** The next 60 days as a pickable strip. */
const nextDays = (from: string): SlotDay[] => Array.from({ length: 60 }, (_, i) => ({ date: new Date(new Date(`${from}T00:00:00Z`).getTime() + i * 86400000).toISOString().slice(0, 10), times: ['open'] }));

function LeaveEditor({ shop, onSaved }: { shop: MyShop; onSaved: () => void }) {
  const today = todayIst();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');
  const pause = async () => {
    try { await api.pauseShop(!shop.isPaused, shop.kind); onSaved(); } catch (e) { setMsg(problem(e).message); }
  };
  const add = async () => {
    if (!(await confirm('Add this leave?', 'Sessions already booked on these days go back to the customers to move or cancel for free.', 'Add Leave'))) return;
    try { const r = await api.addShopLeave({ from, to, reason: reason || undefined, kind: shop.kind }); setMsg(r.released ? `${r.released} booked sessions were released.` : 'Leave added.'); onSaved(); } catch (err) { setMsg(problem(err).message); }
  };
  return (
    <>
      <Card tone={shop.isPaused ? undefined : 'red'} style={{ gap: 10 }}>
        <Text style={{ fontFamily: F.display, fontSize: 19, color: shop.isPaused ? C.ink : '#ffffff' }}>{shop.isPaused ? 'Your shop is paused' : 'Taking new bookings'}</Text>
        <Meta onDark={!shop.isPaused}>{shop.isPaused ? 'Customers can’t book you right now. Booked sessions stay.' : 'Pause when you’re too busy. Booked sessions stay booked.'}</Meta>
        <Btn variant={shop.isPaused ? 'primary' : 'light'} icon={shop.isPaused ? PlayCircle : PauseCircle} label={shop.isPaused ? 'Start Taking Bookings' : 'Pause New Bookings'} onPress={pause} />
      </Card>
      <Card style={{ gap: 12 }}>
        <View style={mk.row}><CalendarOff size={18} color={C.brand} /><Title size={19}>Days off</Title></View>
        <Label>From</Label>
        <DateStrip days={nextDays(today)} value={from} onChange={(d) => { setFrom(d); if (to < d) setTo(d); }} openLabel={() => ''} />
        <Label>To</Label>
        <DateStrip days={nextDays(from)} value={to} onChange={setTo} openLabel={() => ''} />
        <Input value={reason} onChangeText={setReason} maxLength={120} placeholder="Reason (only you see it)" />
        <Btn small label={`Add Leave: ${fmtDay(from)}${to !== from ? ` to ${fmtDay(to)}` : ''}`} onPress={add} />
        {msg ? <Note tone="neutral">{msg}</Note> : null}
        {shop.leave.map((l) => (
          <View key={l._id} style={mk.row}>
            <Text style={{ flex: 1, fontFamily: F.semi, color: C.ink }}>{fmtDay(l.from)}{l.to !== l.from ? ` to ${fmtDay(l.to)}` : ''}{l.reason ? ` · ${l.reason}` : ''}</Text>
            <PressScale onPress={async () => { await api.removeShopLeave(l._id, shop.kind).catch(() => undefined); onSaved(); }} accessibilityRole="button" accessibilityLabel="Remove leave" style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardAlt }}>
              <Trash2 size={15} color={C.muted} />
            </PressScale>
          </View>
        ))}
        {(shop.strikes || []).length > 0 ? <Meta>{shop.strikes!.length} reliability strike{shop.strikes!.length > 1 ? 's' : ''}. Three in 30 days pause new bookings.</Meta> : null}
      </Card>
    </>
  );
}

function PlansList() {
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.myShopPlans>>['plans'] | null>(null);
  useEffect(() => { api.myShopPlans().then((r) => setPlans(r.plans)).catch(() => setPlans([])); }, []);
  if (!plans) return <Skeleton height={120} radius={22} />;
  if (!plans.length) return <Empty title="No active plans yet" text="When customers book you, their plans show here. Today’s visits are on your Visits screen." />;
  return (
    <>
      {plans.map((p) => (
        <Card key={p._id} style={{ gap: 6 }}>
          <Title size={16}>{p.serviceName}</Title>
          <Meta>{p.patientDetails?.name || 'Customer'}{p.city ? ` · ${p.city}` : ''} · {p.mode === 'HOME' ? 'home' : 'clinic'}</Meta>
          <View style={[mk.row, { justifyContent: 'space-between' }]}>
            <Badge tone={p.status === 'ACTIVE' ? 'green' : 'amber'} label={p.status === 'ACTIVE' ? 'Active' : 'Waiting for payment'} />
            <Text style={{ fontFamily: F.heavy, color: C.ink }}>{p.sessionsCompleted}/{p.sessionsTotal}</Text>
          </View>
          <View style={mk.row}><BadgeCheck size={12} color={C.muted} /><Meta>{p.paymentMode === 'PREPAID' ? 'Paid upfront: you’re paid after each session' : 'Collect after each session'}</Meta></View>
        </Card>
      ))}
    </>
  );
}
