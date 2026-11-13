'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import type { StoreEarnings } from '@medrush/shared';
import { api } from '@/lib/api';
import { inr, problem } from '@/lib/care';
import VendorShell from '../VendorShell';

const SPANS = [7, 30, 90] as const;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** Sales statement: sales, Nabz commission, earnings and cash held, by day and by order. */
export default function VendorMoneyPage() {
  return <VendorShell>{() => <Money />}</VendorShell>;
}

function Money() {
  const [span, setSpan] = useState<(typeof SPANS)[number]>(7);
  const [data, setData] = useState<StoreEarnings | null>(null);
  const [error, setError] = useState('');

  const load = useCallback((days: number) => {
    setData(null);
    api.vendorEarnings(days).then((r) => { setData(r.earnings); setError(''); }).catch((e) => setError(problem(e).message));
  }, []);
  useEffect(() => { load(span); }, [span, load]);

  const t = data?.totals;
  const peak = data ? Math.max(1, ...data.daily.map((d) => d.sales)) : 1;

  return (
    <div style={{ display: 'grid', gap: 14, marginTop: 8 }}>
      <div className="mk-toolbar" style={{ margin: 0 }}>
        <h1 className="mk-h2" style={{ margin: 0 }}>Money</h1>
        <div className="mk-seg" role="group" aria-label="Period">
          {SPANS.map((d) => <button key={d} type="button" aria-pressed={span === d} onClick={() => setSpan(d)}>{d} days</button>)}
        </div>
      </div>
      {error && <p className="mk-error" role="alert">{error}</p>}
      {!data || !t ? <div className="mk-skel" /> : (
        <>
          <div className="mk-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <div className="mk-card" style={{ background: 'var(--night)', color: '#fff', borderColor: 'transparent' }}>
              <div style={{ opacity: 0.85, fontWeight: 600 }}>You earned</div>
              <div className="mk-price" style={{ fontSize: 30 }}>{inr(t.payout)}</div>
              <div style={{ opacity: 0.85, fontSize: 13 }}>from {t.orders} delivered order{t.orders === 1 ? '' : 's'}</div>
            </div>
            <Stat label="Sales" value={inr(t.sales)} note="medicines sold" />
            <Stat label="Nabz commission" value={inr(t.commission)} note={data.orders[0]?.rate ? `${Math.round(data.orders[0].rate * 100)}% of sales` : 'per order'} />
            <Stat label="Cash you collected" value={inr(t.cashCollected)} note="cash orders, already with you" />
            <Stat label="Paid to your bank" value={inr(t.paidOut)} note="settled" />
          </div>

          <section className="mk-card" aria-labelledby="by-day">
            <h2 id="by-day" className="mk-title" style={{ marginBottom: 10 }}>Sales by day</h2>
            <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', gap: 3 }} role="img" aria-label={`Sales by day over ${data.days} days, best day ${inr(peak === 1 ? 0 : peak)}`}>
              {data.daily.map((d) => (
                <div key={d.date} title={`${day(d.date)}: ${inr(d.sales)} · ${d.orders} order${d.orders === 1 ? '' : 's'}`}
                  style={{ flex: 1, height: `${Math.max(d.sales > 0 ? 4 : 1, (d.sales / peak) * 100)}%`, background: d.sales ? 'var(--night)' : 'var(--border)', borderRadius: '4px 4px 0 0' }} />
              ))}
            </div>
            <div className="mk-row mk-meta" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span>{day(data.daily[0].date)}</span><span>Best day {inr(peak === 1 ? 0 : peak)}</span><span>{day(data.daily[data.daily.length - 1].date)}</span>
            </div>
          </section>

          <Link href="/partner/account" className="mk-card-link">
            <div className="mk-card mk-row">
              <span className="mk-tile"><Wallet size={22} aria-hidden="true" /></span>
              <div className="grow"><p className="mk-title">Withdraw your earnings</p><p className="mk-meta" style={{ margin: 0 }}>Balance, bank or UPI details and withdrawals are on My account.</p></div>
            </div>
          </Link>

          <section className="mk-card" style={{ padding: 0, overflowX: 'auto' }} aria-labelledby="by-order">
            <h2 id="by-order" className="mk-title" style={{ padding: '16px 16px 0' }}>Orders</h2>
            {data.orders.length === 0 ? <p className="mk-meta" style={{ padding: 16 }}>No delivered orders in this period yet.</p> : (
              <table className="mk-table">
                <thead><tr><th scope="col">Order</th><th scope="col">Date</th><th scope="col" style={{ textAlign: 'right' }}>Sold</th><th scope="col" style={{ textAlign: 'right' }}>Commission</th><th scope="col" style={{ textAlign: 'right' }}>You earn</th><th scope="col" style={{ textAlign: 'right' }}>Cash with you</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.orderId}>
                      <td><b>{o.ref || 'Order'}</b></td>
                      <td>{day(o.date)}</td>
                      <td className="num">{inr(o.sales)}</td>
                      <td className="num">{inr(o.commission)}</td>
                      <td className="num"><b>{inr(o.payout)}</b></td>
                      <td className="num">{o.cash ? inr(o.cash) : '—'}</td>
                      <td><span className={`mk-badge ${o.status === 'PAID' ? 'green' : ''}`} style={o.status === 'PAID' ? undefined : { background: 'var(--amber-soft)', color: 'var(--amber)' }}>{o.status === 'PAID' ? 'Paid' : 'Due'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="mk-card">
      <div className="mk-label">{label}</div>
      <div className="mk-price" style={{ fontSize: 24 }}>{value}</div>
      <div className="mk-meta">{note}</div>
    </div>
  );
}
