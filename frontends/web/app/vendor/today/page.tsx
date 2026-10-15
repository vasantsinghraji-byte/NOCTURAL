'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, BellRing, ChevronRight, ClipboardList, EyeOff, IndianRupee, PackageMinus, PackagePlus, PackageX, Settings2, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { StoreToday } from '@medrush/shared';
import { api } from '@/lib/api';
import { inr, problem } from '@/lib/care';
import { confirmDialog } from '../../_components/Dialog';
import VendorShell from '../VendorShell';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** Store home on the website: open switch, today's numbers and what needs doing. */
export default function VendorTodayPage() {
  return <VendorShell>{() => <Today />}</VendorShell>;
}

function Today() {
  const [data, setData] = useState<StoreToday | null>(null);
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);

  const load = useCallback(() => {
    api.vendorToday().then((r) => { setData(r.today); setError(''); }).catch((e) => setError(problem(e).message));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  async function setOpen(open: boolean) {
    if (!open && !(await confirmDialog({ title: 'Close the shop?', message: 'Customers won’t be able to order from you until you open again. Orders you already have stay.', confirmLabel: 'Close shop', danger: true }))) return;
    setSwitching(true);
    try { await api.vendorUpdateProfile({ isOpen: open }); load(); } catch (e) { setError(problem(e).message); } finally { setSwitching(false); }
  }

  if (!data) return error ? <p className="mk-error" role="alert" style={{ marginTop: 16 }}>{error}</p> : <div className="mk-skel" style={{ marginTop: 16 }} aria-label="Loading" />;

  const { shop, orders, sales, stock } = data;
  const paused = shop.pausedUntil && new Date(shop.pausedUntil) > new Date();
  const statusLine = paused
    ? `Paused by Nabz until ${clock(shop.pausedUntil as string)}${shop.pauseReason ? `: ${shop.pauseReason}` : ''}`
    : !shop.isOpen ? 'Customers can’t order from you now'
      : shop.openNow ? 'Customers near you can order now' : 'Closed by your opening hours right now';
  const vs = sales.yesterday > 0 ? Math.round(((sales.today - sales.yesterday) / sales.yesterday) * 100) : null;

  const todo: Array<{ show: boolean; icon: LucideIcon; tone: 'red' | 'amber' | 'neutral'; title: string; text: string; href: string }> = [
    { show: orders.new > 0, icon: BellRing, tone: 'red', title: `${orders.new} new order${orders.new === 1 ? '' : 's'}`, text: 'Accept quickly or they move to another store', href: '/vendor' },
    { show: stock.pulledBatches > 0, icon: TriangleAlert, tone: 'red', title: `${stock.pulledBatches} batch${stock.pulledBatches === 1 ? '' : 'es'} off sale`, text: 'Too close to expiry or recalled. Take them off the shelf', href: '/vendor/stock?filter=expiring' },
    { show: stock.out > 0, icon: PackageX, tone: 'red', title: `${stock.out} out of stock`, text: 'Customers can’t order these until you restock', href: '/vendor/stock?filter=out' },
    { show: stock.low > 0, icon: PackageMinus, tone: 'amber', title: `${stock.low} running low`, text: 'Reorder from your distributor soon', href: '/vendor/stock?filter=low' },
    { show: stock.expiringBatches > 0, icon: AlarmClock, tone: 'amber', title: `${stock.expiringBatches} batch${stock.expiringBatches === 1 ? '' : 'es'} expiring soon`, text: 'Sell these first or return them', href: '/vendor/stock?filter=expiring' },
    { show: stock.hidden > 0, icon: EyeOff, tone: 'neutral', title: `${stock.hidden} hidden from customers`, text: 'Switched off by you', href: '/vendor/stock?filter=hidden' }
  ];
  const shown = todo.filter((t) => t.show);

  return (
    <div style={{ display: 'grid', gap: 16, marginTop: 8 }}>
      {error && <p className="mk-error" role="alert">{error}</p>}
      <section className="mk-hero" style={{ display: 'grid', gap: 16, padding: 'clamp(20px, 3vw, 32px)', margin: 0 }} aria-labelledby="shop-name">
        <div>
          <p style={{ margin: 0, opacity: 0.85 }}>Your shop</p>
          <h1 id="shop-name" style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3.4vw, 38px)' }}>{shop.name}</h1>
        </div>
        <div className="mk-row" style={{ flexWrap: 'wrap', padding: 14, borderRadius: 18, background: shop.isOpen && !paused ? 'rgba(61,214,140,0.16)' : 'rgba(255,255,255,0.1)', boxShadow: `inset 0 0 0 1px ${shop.isOpen && !paused ? 'rgba(61,214,140,0.6)' : 'rgba(255,255,255,0.2)'}` }}>
          <div className="grow">
            <b style={{ fontSize: 18 }}>{paused ? 'Paused' : shop.isOpen ? 'Shop is open' : 'Shop is closed'}</b>
            <div style={{ opacity: 0.85, fontSize: 14 }}>{statusLine}</div>
          </div>
          <button type="button" className="mk-btn dark" disabled={switching} onClick={() => setOpen(!shop.isOpen)} aria-pressed={shop.isOpen}>
            {switching ? 'Saving…' : shop.isOpen ? 'Close shop' : 'Open shop'}
          </button>
        </div>
        <div className="mk-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <HeroStat icon={IndianRupee} label="Sales today" value={inr(sales.today)} sub={vs === null ? `${orders.deliveredToday} delivered` : `${vs >= 0 ? '+' : ''}${vs}% vs yesterday`} />
          <HeroStat icon={BellRing} label="New orders" value={String(orders.new)} sub="to accept" />
          <HeroStat icon={ClipboardList} label="In progress" value={String(orders.inProgress)} sub="packing or on the way" />
        </div>
      </section>

      <h2 className="mk-h2" style={{ margin: '8px 0 0' }}>{shown.length ? 'Needs your attention' : 'All good'}</h2>
      {shown.length === 0 ? <div className="mk-card"><p className="mk-meta" style={{ margin: 0, fontSize: 15 }}>No new orders and no stock problems. Nice work.</p></div> : (
        <div className="mk-grid two">
          {shown.map((t) => (
            <Link key={t.title} href={t.href} className="mk-card-link">
              <div className="mk-card mk-row">
                <span className="mk-tile" style={t.tone === 'amber' ? { background: 'var(--amber-soft)', color: 'var(--amber)' } : t.tone === 'neutral' ? { background: 'var(--card-alt)', color: 'var(--ink-soft)' } : undefined}><t.icon size={22} aria-hidden="true" /></span>
                <div className="grow">
                  <p className="mk-title">{t.title}</p>
                  <p className="mk-meta" style={{ margin: 0 }}>{t.text}</p>
                </div>
                <ChevronRight size={20} aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <h2 className="mk-h2" style={{ margin: '8px 0 0' }}>Quick actions</h2>
      <div className="mk-grid two">
        <Link href="/vendor/stock?receive=1" className="mk-card-link"><div className="mk-card mk-row"><span className="mk-tile"><PackagePlus size={22} aria-hidden="true" /></span><p className="mk-title grow">Receive stock</p><ChevronRight size={20} aria-hidden="true" /></div></Link>
        <Link href="/vendor/settings" className="mk-card-link"><div className="mk-card mk-row"><span className="mk-tile"><Settings2 size={22} aria-hidden="true" /></span><p className="mk-title grow">Shop settings</p><ChevronRight size={20} aria-hidden="true" /></div></Link>
      </div>
      <p className="mk-meta">
        {stock.listed} products listed{data.acceptanceRate !== null ? ` · you accept ${data.acceptanceRate}% of orders` : ''}
        {shop.rating.count ? ` · rated ${shop.rating.average.toFixed(1)} by ${shop.rating.count}` : ''}
      </p>
    </div>
  );
}

function HeroStat({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 18, background: 'rgba(255,255,255,0.1)', display: 'grid', gap: 2 }}>
      <Icon size={16} aria-hidden="true" style={{ color: '#ffc94d' }} />
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 12.5, opacity: 0.85 }}>{label} · {sub}</span>
    </div>
  );
}
