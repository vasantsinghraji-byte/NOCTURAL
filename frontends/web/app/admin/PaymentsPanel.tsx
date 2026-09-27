'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PaymentLog, PaymentLogKind } from '@medrush/shared';
import { api } from '@/lib/api';

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;
const KINDS: Array<{ key: PaymentLogKind; label: string; tone: string }> = [
  { key: 'PAYMENT', label: 'Online payments', tone: 'mint' },
  { key: 'CASH', label: 'Cash collected', tone: 'sky' },
  { key: 'REFUND', label: 'Refunds', tone: 'violet' },
  { key: 'FAILED', label: 'Failed', tone: 'rx' },
  { key: 'WITHDRAWAL', label: 'Partner withdrawals', tone: '' }
];
const RANGES = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 }
];

/** Every money movement: online payments, cash, refunds, failures and withdrawals. */
export default function PaymentsPanel() {
  const [range, setRange] = useState('7');
  const [kind, setKind] = useState<PaymentLogKind | ''>('');
  const [data, setData] = useState<PaymentLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 7;
    const from = new Date();
    if (days === 0) from.setHours(0, 0, 0, 0); else from.setDate(from.getDate() - days);
    setLoading(true);
    setError(null);
    api.adminPaymentLog({ from: from.toISOString(), kind: kind || undefined })
      .then((r) => setData(r))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [range, kind]);
  useEffect(load, [load]);

  return (
    <section style={{ marginTop: 12 }}>
      <div className="admin-toolbar">
        <div className="segmented" role="tablist" aria-label="Period">
          {RANGES.map((r) => <button key={r.key} role="tab" aria-selected={range === r.key} className={range === r.key ? 'on' : ''} onClick={() => setRange(r.key)}>{r.label}</button>)}
        </div>
        <button className="btn secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}

      {data && (
        <div className="stat-grid admin-stats">
          {KINDS.map((k) => (
            <button key={k.key} className={`card stat stat-filter ${kind === k.key ? 'on' : ''}`} aria-pressed={kind === k.key} onClick={() => setKind(kind === k.key ? '' : k.key)}>
              <span className="muted">{k.label}</span>
              <b className="stat-value">{inr(data.totals[k.key].amount)}</b>
              <span className="muted" style={{ fontSize: 12 }}>{data.totals[k.key].count} {data.totals[k.key].count === 1 ? 'entry' : 'entries'}</span>
            </button>
          ))}
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="admin-table">
          <thead>
            <tr><th>When</th><th>Type</th><th>For</th><th>Reference</th><th>Customer / partner</th><th className="num">Amount</th><th>Status</th><th>Gateway / note</th></tr>
          </thead>
          <tbody>
            {data?.entries.map((e, i) => (
              <tr key={`${e.ref}-${e.kind}-${i}`}>
                <td>{new Date(e.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                <td><span className={`pill ${KINDS.find((k) => k.key === e.kind)?.tone || ''}`}>{e.kind === 'PAYMENT' ? 'Paid' : e.kind === 'CASH' ? 'Cash' : e.kind === 'REFUND' ? 'Refund' : e.kind === 'FAILED' ? 'Failed' : 'Withdrawal'}</span></td>
                <td>{e.source === 'CARE' ? `Care${e.service ? ` · ${e.service.replace(/_/g, ' ').toLowerCase()}` : ''}` : e.source === 'PHARMACY' ? 'Pharmacy' : e.source === 'MEMBERSHIP' ? 'Nabz Plus' : 'Payout'}</td>
                <td className="mono">{e.ref}</td>
                <td>{e.who || '—'}{e.partner ? <span className="muted"> · by {e.partner}</span> : null}</td>
                <td className="num"><b>{e.kind === 'REFUND' || e.kind === 'WITHDRAWAL' ? '−' : ''}{inr(e.amount)}</b></td>
                <td>{e.status.replace(/_/g, ' ').toLowerCase()}</td>
                <td className="mono muted">{e.gatewayRef || e.note || '—'}</td>
              </tr>
            ))}
            {data && data.entries.length === 0 && <tr><td colSpan={8} className="muted">No payments in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
