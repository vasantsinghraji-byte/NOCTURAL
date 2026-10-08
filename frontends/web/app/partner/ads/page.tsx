'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Megaphone, MousePointerClick, Eye, CalendarCheck2, Wallet, PauseCircle, PlayCircle, Plus } from 'lucide-react';
import type { AdCampaignView, AdWalletView, MarketService, ShopKind } from '@medrush/shared';
import { api } from '@/lib/api';
import { inr, problem, fmtDay } from '@/lib/care';
import CareArt from '../../_components/care/CareArt';
import { payForAdTopup, PaymentDismissedError } from '@/lib/razorpay';

const PRODUCT: Record<AdCampaignView['product'], string> = { SPONSORED_LISTING: 'Sponsored listing', SPOTLIGHT: 'Home spotlight', CATEGORY_BANNER: 'Service page banner' };
const STATUS: Record<AdCampaignView['status'], string> = { PENDING_REVIEW: 'In review', ACTIVE: 'Running', PAUSED: 'Paused', REJECTED: 'Not approved', ENDED: 'Ended' };

export default function PartnerAds() {
  const [data, setData] = useState<{ campaigns: AdCampaignView[]; wallet: AdWalletView } | null>(null);
  const [kind, setKind] = useState<ShopKind | null>(null);
  const [services, setServices] = useState<MarketService[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => api.myAds().then((r) => setData(r)).catch((e) => setError(problem(e).message)), []);
  useEffect(() => {
    load();
    api.myShop().then((r) => { if (r.store) { setKind(r.store.kind); api.marketServices(r.store.kind).then((s) => setServices(s.services)).catch(() => undefined); } }).catch(() => undefined);
  }, [load]);

  const setStatus = async (c: AdCampaignView, status: 'ACTIVE' | 'PAUSED') => {
    try { await api.setAdStatus(c._id, status); await load(); } catch (e) { setError(problem(e).message); }
  };
  const topup = async () => {
    try { await payForAdTopup(1000); await load(); } catch (e) { if (!(e instanceof PaymentDismissedError)) setError(problem(e).message); }
  };

  if (!data && !error) return <div className="mk-skel" style={{ minHeight: 300 }} />;
  return (
    <div>
      <section className="mk-hero" aria-labelledby="ads-title">
        <div className="in slim">
          <div>
            <h1 id="ads-title">Get found by more patients</h1>
            <p>Your shop appears in a labelled sponsored slot when it’s a good match: open, nearby, offering the service and well rated. You pay only when someone taps.</p>
          </div>
          <div className="art"><CareArt kind="heart" /></div>
        </div>
      </section>
      {error && <p className="mk-note" role="alert">{error}</p>}
      {data && (
        <div className="mk-book">
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="mk-toolbar">
              <h2 className="mk-h2" style={{ margin: 0 }}>Your campaigns</h2>
              {kind && <button type="button" className="mk-btn" onClick={() => setCreating((c) => !c)}><Plus size={16} aria-hidden="true" /> New Campaign</button>}
            </div>
            {!kind && <p className="mk-note neutral">Set up your shop first. <Link href="/partner/shop">Open My Shop</Link></p>}
            {creating && kind && <NewCampaign services={services} onDone={() => { setCreating(false); load(); }} />}
            {data.campaigns.length === 0 && !creating && <div className="mk-empty"><div className="art"><CareArt kind="empty" /></div><strong>No campaigns yet</strong><span>Start small: a sponsored listing with a ₹200 daily budget.</span></div>}
            {data.campaigns.map((c) => (
              <article key={c._id} className="mk-card" style={{ display: 'grid', gap: 12 }}>
                <div className="mk-row" style={{ flexWrap: 'wrap' }}>
                  <span className="mk-tile"><Megaphone size={20} aria-hidden="true" /></span>
                  <div className="grow">
                    <p className="mk-title">{c.creative?.title || c.name}</p>
                    <p className="mk-meta" style={{ margin: 0 }}>{PRODUCT[c.product]} · {c.bidCpc ? `${inr(c.bidCpc)} per tap, ${inr(c.dailyBudget)}/day` : `${inr(c.weeklyPrice)} per week`} · until {fmtDay(c.endAt)}</p>
                  </div>
                  <span className={`mk-badge ${c.status === 'ACTIVE' ? 'green' : c.status === 'REJECTED' ? 'red' : ''}`}>{STATUS[c.status]}</span>
                </div>
                {(c.pausedReason || c.review?.reason) && <p className="mk-help" style={{ margin: 0 }}>{c.pausedReason || c.review?.reason}</p>}
                {c.stats && (
                  <div className="mk-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                    <Stat icon={<Eye size={15} aria-hidden="true" />} label="Views" value={String(c.stats.impressions)} />
                    <Stat icon={<MousePointerClick size={15} aria-hidden="true" />} label={`Taps (${c.stats.ctr}%)`} value={String(c.stats.clicks)} />
                    <Stat icon={<CalendarCheck2 size={15} aria-hidden="true" />} label="Bookings" value={String(c.stats.bookings)} />
                    <Stat icon={<Wallet size={15} aria-hidden="true" />} label="Spent" value={inr(c.stats.spend)} />
                  </div>
                )}
                {['ACTIVE', 'PAUSED'].includes(c.status) && (
                  <button type="button" className="mk-btn ghost small" style={{ justifySelf: 'start' }} onClick={() => setStatus(c, c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}>
                    {c.status === 'ACTIVE' ? <><PauseCircle size={14} aria-hidden="true" /> Pause</> : <><PlayCircle size={14} aria-hidden="true" /> Resume</>}
                  </button>
                )}
              </article>
            ))}
          </div>
          <aside className="mk-sticky" aria-label="Ad wallet">
            <div className="mk-card red" style={{ display: 'grid', gap: 10 }}>
              <p className="mk-meta" style={{ margin: 0 }}>Ad wallet</p>
              <p className="mk-price" style={{ fontSize: 34, color: '#fff' }}>{inr(data.wallet.balance)}</p>
              <button type="button" className="mk-btn dark" onClick={topup}>Top Up ₹1,000</button>
              <p className="mk-meta" style={{ margin: 0 }}>Ads pause when the wallet runs out and resume when you top up.</p>
            </div>
            <div className="mk-card" style={{ display: 'grid', gap: 6 }}>
              <p className="mk-title" style={{ fontSize: 15 }}>Recent activity</p>
              {data.wallet.entries.slice(0, 8).map((e) => <div key={e._id} className="mk-row" style={{ fontSize: 13 }}><span className="grow">{e.note || e.type.toLowerCase()}</span><strong style={{ color: e.amount < 0 ? 'var(--rose-ink)' : 'var(--mint)' }}>{e.amount < 0 ? '− ' : '+ '}{inr(Math.abs(e.amount))}</strong></div>)}
              {data.wallet.entries.length === 0 && <p className="mk-meta" style={{ margin: 0 }}>Nothing yet.</p>}
            </div>
            <p className="mk-help">Rules: ads are always labelled Sponsored, only well-rated shops can advertise, and ads never promise cures or guarantees.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div style={{ background: 'var(--card-alt)', borderRadius: 16, padding: 10 }}><p className="mk-meta" style={{ margin: 0, display: 'flex', gap: 5, alignItems: 'center' }}>{icon}{label}</p><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</strong></div>;
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
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await api.createAd({
        product, name: title || 'My campaign', creative: { title, subtitle: subtitle || undefined },
        services: service ? [service] : [],
        ...(product === 'SPONSORED_LISTING' ? { bidCpc: Number(bid), dailyBudget: Number(daily) } : {}),
        endAt: new Date(Date.now() + Number(days) * 86400000).toISOString()
      });
      onDone();
    } catch (e2) { setErr(problem(e2).message); } finally { setSaving(false); }
  };
  return (
    <form className="mk-card" onSubmit={submit} style={{ display: 'grid', gap: 12 }} aria-labelledby="new-ad">
      <h3 id="new-ad" className="mk-title">New campaign</h3>
      <div className="mk-seg" role="group" aria-label="Ad type" style={{ justifySelf: 'start', flexWrap: 'wrap' }}>
        {(Object.keys(PRODUCT) as AdCampaignView['product'][]).map((p) => <button key={p} type="button" aria-pressed={product === p} onClick={() => setProduct(p)}>{PRODUCT[p]}</button>)}
      </div>
      <div className="mk-split">
        <div className="mk-field"><label htmlFor="ad-title">Headline</label><input id="ad-title" className="mk-input" maxLength={60} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Same-week knee therapy slots" autoComplete="off" /></div>
        <div className="mk-field"><label htmlFor="ad-sub">Line under it</label><input id="ad-sub" className="mk-input" maxLength={120} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} autoComplete="off" /></div>
      </div>
      <div className="mk-split">
        <div className="mk-field"><label htmlFor="ad-svc">{product === 'CATEGORY_BANNER' ? 'Service page' : 'Only for this service (optional)'}</label>
          <select id="ad-svc" className="mk-select" value={service} required={product === 'CATEGORY_BANNER'} onChange={(e) => setService(e.target.value)}>
            <option value="">{product === 'CATEGORY_BANNER' ? 'Choose a service' : 'All my services'}</option>
            {services.map((s) => <option key={s._id} value={s._id}>{s.displayName}</option>)}
          </select>
        </div>
        <div className="mk-field"><label htmlFor="ad-days">Run for (days)</label><input id="ad-days" type="number" min={1} max={180} className="mk-input" value={days} onChange={(e) => setDays(e.target.value)} /></div>
      </div>
      {product === 'SPONSORED_LISTING' ? (
        <div className="mk-split">
          <div className="mk-field"><label htmlFor="ad-bid">Most you pay per tap (₹)</label><input id="ad-bid" type="number" min={5} className="mk-input" value={bid} onChange={(e) => setBid(e.target.value)} /><span className="mk-help">You usually pay less: just enough to beat the next ad.</span></div>
          <div className="mk-field"><label htmlFor="ad-daily">Daily budget (₹)</label><input id="ad-daily" type="number" min={5} className="mk-input" value={daily} onChange={(e) => setDaily(e.target.value)} /></div>
        </div>
      ) : <p className="mk-help" style={{ margin: 0 }}>Fixed weekly price, taken from your ad wallet after Nabz approves the ad.</p>}
      {err && <p className="mk-note" role="alert">{err}</p>}
      <div className="mk-row"><button type="submit" className="mk-btn" disabled={saving}>{saving ? 'Sending…' : 'Send for Review'}</button><button type="button" className="mk-btn ghost" onClick={onDone}>Cancel</button></div>
    </form>
  );
}
