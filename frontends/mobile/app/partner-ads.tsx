import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarCheck2, Eye, Megaphone, MousePointerClick, PauseCircle, PlayCircle, Plus, Wallet } from 'lucide-react-native';
import type { AdCampaignView, AdWalletView, MarketService, ShopKind } from '@medrush/shared';
import { api } from '@/lib/api';
import { fmtDay, inr, problem } from '@/lib/market';
import { Badge, Btn, Card, Chip, Chips, Empty, Label, Meta, MkHero, Note, Screen, Title, TopBar, mk } from '@/lib/marketUI';
import { PaymentDismissedError, payAdTopup } from '@/lib/payments';
import { Skeleton, success } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

const PRODUCT: Record<AdCampaignView['product'], string> = { SPONSORED_LISTING: 'Sponsored listing', SPOTLIGHT: 'Home spotlight', CATEGORY_BANNER: 'Service banner' };
const STATUS: Record<AdCampaignView['status'], string> = { PENDING_REVIEW: 'In review', ACTIVE: 'Running', PAUSED: 'Paused', REJECTED: 'Not approved', ENDED: 'Ended' };
const TOPUPS = [500, 1000, 2500];

/** Partner ads (mirrors /partner/ads): wallet, campaigns with results, new campaign. */
export default function PartnerAds() {
  const [data, setData] = useState<{ campaigns: AdCampaignView[]; wallet: AdWalletView } | null>(null);
  const [kind, setKind] = useState<ShopKind | null>(null);
  const [services, setServices] = useState<MarketService[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [topping, setTopping] = useState(0);
  const load = useCallback(() => api.myAds().then((r) => { setData(r); setError(''); }).catch((e) => setError(problem(e).message)), []);
  useEffect(() => {
    load();
    api.myShop().then((r) => { if (r.store) { setKind(r.store.kind); api.marketServices(r.store.kind).then((x) => setServices(x.services)).catch(() => undefined); } }).catch(() => undefined);
  }, [load]);

  const setStatus = async (c: AdCampaignView, status: 'ACTIVE' | 'PAUSED') => {
    try { await api.setAdStatus(c._id, status); await load(); } catch (e) { setError(problem(e).message); }
  };
  const topup = async (amount: number) => {
    setTopping(amount);
    try { await payAdTopup(amount); success(); await load(); } catch (e) { if (!(e instanceof PaymentDismissedError)) setError(problem(e).message); } finally { setTopping(0); }
  };

  return (
    <Screen header={<TopBar title="Ads" />} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
      <MkHero title="Get found by more patients" subtitle="Your shop shows in a labelled sponsored slot when it’s a good match: open, nearby, offering the service and well rated. Pay only when someone taps." art="heart" />
      {error ? <Note>{error}</Note> : null}
      {!data && !error ? <Skeleton height={200} radius={24} /> : null}
      {data ? (
        <>
          <Card tone="red" style={{ gap: 10 }}>
            <Meta onDark>Ad wallet</Meta>
            <Text style={{ fontFamily: F.display, fontSize: 34, color: '#ffffff' }}>{inr(data.wallet.balance)}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TOPUPS.map((a) => <Btn key={a} small variant={a === 1000 ? 'light' : 'dark'} label={`+ ${inr(a)}`} loading={topping === a} disabled={Boolean(topping)} onPress={() => topup(a)} style={{ flex: 1 }} />)}
            </View>
            <Meta onDark>Ads pause when the wallet runs out and resume when you top up.</Meta>
          </Card>

          <View style={[mk.row, { justifyContent: 'space-between', marginTop: 4 }]}>
            <Title size={19}>Your campaigns</Title>
            {kind ? <Btn small icon={Plus} label={creating ? 'Close' : 'New Campaign'} onPress={() => setCreating((c) => !c)} /> : null}
          </View>
          {!kind ? <Note tone="neutral">Set up your shop first, then advertise it.</Note> : null}
          {!kind ? <Btn variant="soft" label="Open My Shop" onPress={() => router.push('/shop')} /> : null}
          {creating && kind ? <NewCampaign services={services} onDone={() => { setCreating(false); load(); }} /> : null}
          {data.campaigns.length === 0 && !creating ? <Empty title="No campaigns yet" text="Start small: a sponsored listing with a ₹200 daily budget." /> : null}
          {data.campaigns.map((c) => (
            <Card key={c._id} style={{ gap: 12 }}>
              <View style={mk.row}>
                <View style={mk.tile}><Megaphone size={20} color={C.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Title size={16}>{c.creative?.title || c.name}</Title>
                  <Meta>{PRODUCT[c.product]} · {c.bidCpc ? `${inr(c.bidCpc)} per tap, ${inr(c.dailyBudget)}/day` : `${inr(c.weeklyPrice)} per week`} · until {fmtDay(c.endAt)}</Meta>
                </View>
                <Badge tone={c.status === 'ACTIVE' ? 'green' : c.status === 'REJECTED' ? 'red' : 'neutral'} label={STATUS[c.status]} />
              </View>
              {c.pausedReason || c.review?.reason ? <Meta>{c.pausedReason || c.review?.reason}</Meta> : null}
              {c.stats ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Stat icon={Eye} label="Views" value={String(c.stats.impressions)} />
                  <Stat icon={MousePointerClick} label={`Taps ${c.stats.ctr}%`} value={String(c.stats.clicks)} />
                  <Stat icon={CalendarCheck2} label="Bookings" value={String(c.stats.bookings)} />
                  <Stat icon={Wallet} label="Spent" value={inr(c.stats.spend)} />
                </View>
              ) : null}
              {['ACTIVE', 'PAUSED'].includes(c.status)
                ? <Btn small variant="ghost" icon={c.status === 'ACTIVE' ? PauseCircle : PlayCircle} label={c.status === 'ACTIVE' ? 'Pause' : 'Resume'} onPress={() => setStatus(c, c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')} /> : null}
            </Card>
          ))}

          <Card style={{ gap: 8 }}>
            <Title size={16}>Recent wallet activity</Title>
            {data.wallet.entries.slice(0, 8).map((e) => (
              <View key={e._id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Meta style={{ flex: 1 }}>{e.note || e.type.toLowerCase()}</Meta>
                <Text style={{ fontFamily: F.bold, color: e.amount < 0 ? C.roseInk : C.mint }}>{e.amount < 0 ? '− ' : '+ '}{inr(Math.abs(e.amount))}</Text>
              </View>
            ))}
            {data.wallet.entries.length === 0 ? <Meta>Nothing yet.</Meta> : null}
          </Card>
          <Meta>Rules: ads are always labelled Sponsored, only well-rated shops can advertise, and ads never promise cures or guarantees.</Meta>
        </>
      ) : null}
    </Screen>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.cardAlt, borderRadius: 14, padding: 8, gap: 2 }}>
      <View style={[mk.row, { gap: 4 }]}><Icon size={12} color={C.muted} /><Text style={{ fontFamily: F.medium, fontSize: 10, color: C.muted }} numberOfLines={1}>{label}</Text></View>
      <Text style={{ fontFamily: F.heavy, fontSize: 14, color: C.ink }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function NewCampaign({ services, onDone }: { services: MarketService[]; onDone: () => void }) {
  const [product, setProduct] = useState<AdCampaignView['product']>('SPONSORED_LISTING');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [bid, setBid] = useState('8');
  const [daily, setDaily] = useState('200');
  const [service, setService] = useState('');
  const [days, setDays] = useState('30');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!title.trim()) { setErr('Add a headline.'); return; }
    if (product === 'CATEGORY_BANNER' && !service) { setErr('Choose the service page for the banner.'); return; }
    setSaving(true);
    setErr('');
    try {
      await api.createAd({
        product, name: title.trim(), creative: { title: title.trim(), subtitle: subtitle.trim() || undefined },
        services: service ? [service] : [],
        ...(product === 'SPONSORED_LISTING' ? { bidCpc: Number(bid), dailyBudget: Number(daily) } : {}),
        endAt: new Date(Date.now() + (Number(days) || 30) * 86400000).toISOString()
      });
      success();
      onDone();
    } catch (e) { setErr(problem(e).message); } finally { setSaving(false); }
  };
  const input = (value: string, onChange: (v: string) => void, props: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
    <TextInput style={ui.input} placeholderTextColor={C.muted} value={value} onChangeText={onChange} {...props} />
  );
  return (
    <Card style={{ gap: 12 }}>
      <Title size={17}>New campaign</Title>
      <Chips>{(Object.keys(PRODUCT) as AdCampaignView['product'][]).map((p) => <Chip key={p} label={PRODUCT[p]} on={product === p} onPress={() => setProduct(p)} />)}</Chips>
      <Label>Headline</Label>
      {input(title, setTitle, { maxLength: 60, placeholder: 'Same-week knee therapy slots' })}
      <Label>Line under it</Label>
      {input(subtitle, setSubtitle, { maxLength: 120 })}
      <Label>{product === 'CATEGORY_BANNER' ? 'Service page' : 'Only for this service (optional)'}</Label>
      <Chips>
        {product !== 'CATEGORY_BANNER' ? <Chip label="All my services" on={!service} onPress={() => setService('')} /> : null}
        {services.map((sv) => <Chip key={sv._id} label={sv.displayName} on={service === sv._id} onPress={() => setService(sv._id)} />)}
      </Chips>
      <Label>Run for (days)</Label>
      {input(days, (v) => setDays(v.replace(/\D/g, '')), { keyboardType: 'number-pad', maxLength: 3 })}
      {product === 'SPONSORED_LISTING' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, gap: 6 }}><Label>Max per tap (₹)</Label>{input(bid, (v) => setBid(v.replace(/[^\d.]/g, '')), { keyboardType: 'decimal-pad' })}</View>
          <View style={{ flex: 1, gap: 6 }}><Label>Daily budget (₹)</Label>{input(daily, (v) => setDaily(v.replace(/\D/g, '')), { keyboardType: 'number-pad' })}</View>
        </View>
      ) : <Meta>Fixed weekly price, taken from your ad wallet after Nabz approves the ad.</Meta>}
      {product === 'SPONSORED_LISTING' ? <Meta>You usually pay less: just enough to beat the next ad.</Meta> : null}
      {err ? <Note>{err}</Note> : null}
      <Btn label={saving ? 'Sending…' : 'Send for Review'} loading={saving} onPress={submit} />
    </Card>
  );
}
