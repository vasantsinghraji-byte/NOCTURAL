'use client';

import { useEffect, useState } from 'react';
import { Crown, IndianRupee, Stethoscope, Store, Wallet } from 'lucide-react';
import type { RevenueSummary } from '@medrush/shared';
import { api } from '@/lib/api';
import { IconTile } from '../_components/icons';

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

/** Platform revenue at a glance (platform_admin only; the API enforces it). */
export default function RevenuePanel() {
  const [from, setFrom] = useState(monthStart());
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [payouts, setPayouts] = useState<Array<{ partyKind: string; partyId: string; amount: number; entries: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api.getRevenueSummary({ from }).then((r) => setSummary(r.summary)).catch((e) => setError(e.message));
    api.getPendingPayouts().then((r) => setPayouts(r.payouts)).catch(() => undefined);
  }, [from]);

  if (error) return <div className="notice" style={{ marginTop: 12 }}>Revenue: {error}</div>;
  if (!summary) return <p className="muted">Loading revenue…</p>;

  const tiles = [
    { icon: IndianRupee, label: 'Platform revenue', value: summary.platformRevenue },
    { icon: Store, label: 'Pharmacy (commission + delivery)', value: summary.revenueByLine.PHARMACY_ORDER },
    { icon: Stethoscope, label: 'Home care (commission + fee)', value: summary.revenueByLine.CARE_BOOKING },
    { icon: Crown, label: 'Nabz Plus', value: summary.revenueByLine.MEMBERSHIP },
    { icon: Wallet, label: 'Pending partner payouts', value: summary.pendingPayouts }
  ];

  return (
    <section style={{ marginTop: 16 }}>
      <div className="row">
        <div className="section-title" style={{ margin: 0 }}>Revenue</div>
        <label className="muted">From <input className="input" style={{ width: 160, display: 'inline-block' }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      </div>
      <div className="grid cats" style={{ marginTop: 12 }}>
        {tiles.map((t) => (
          <div key={t.label} className="card stack">
            <IconTile icon={t.icon} size={40} />
            <b style={{ fontSize: 22 }}>{inr(t.value)}</b>
            <span className="muted">{t.label}</span>
          </div>
        ))}
      </div>
      <p className="muted">Gross value through Nabz: {inr(summary.grossValue)} · partners earned {inr(summary.partnerEarnings)}.</p>
      {payouts.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          <h3>Next payout run</h3>
          {payouts.slice(0, 10).map((p) => (
            <div key={`${p.partyKind}-${p.partyId}`} className="row" style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
              <span className="muted">{p.partyKind === 'VENDOR' ? 'Pharmacy' : 'Medical staff'} · {String(p.partyId).slice(-6)} · {p.entries} item(s)</span>
              <b>{inr(p.amount)}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
