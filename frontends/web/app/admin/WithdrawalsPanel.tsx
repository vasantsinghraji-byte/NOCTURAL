'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Withdrawal } from '@medrush/shared';
import { api } from '@/lib/api';
import { promptDialog } from '../_components/Dialog';

type Destination = Awaited<ReturnType<typeof api.adminWithdrawalDestination>>['destination'];
const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;

/**
 * Partner withdrawals (platform_admin). Pay by UPI / bank transfer, then mark
 * paid with the UTR. Showing bank details and marking paid need a fresh 2FA code.
 */
export default function WithdrawalsPanel({ sensitive }: { sensitive: (action: () => Promise<void>) => Promise<void> }) {
  const [status, setStatus] = useState<'REQUESTED' | 'PAID' | 'REJECTED'>('REQUESTED');
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [dest, setDest] = useState<Record<string, Destination>>({});
  const [utr, setUtr] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.adminListWithdrawals(status).then((r) => setRows(r.withdrawals)).catch((e) => setError(e.message));
  }, [status]);
  useEffect(load, [load]);

  const reveal = (w: Withdrawal) => sensitive(async () => {
    const r = await api.adminWithdrawalDestination(w._id);
    setDest((d) => ({ ...d, [w._id]: r.destination }));
  });
  const markPaid = (w: Withdrawal) => sensitive(async () => {
    await api.adminMarkWithdrawalPaid(w._id, (utr[w._id] || '').trim());
    load();
  });
  const reject = async (w: Withdrawal) => {
    const note = await promptDialog({
      title: `Reject ${inr(w.amount)} for ${w.user?.name || 'this partner'}?`,
      message: 'The partner sees your reason. The amount goes back to their balance.',
      label: 'Reason',
      placeholder: 'e.g. bank details don’t match the account name…',
      minLength: 3,
      maxLength: 300,
      confirmLabel: 'Reject withdrawal'
    });
    if (!note) return;
    await sensitive(async () => { await api.adminRejectWithdrawal(w._id, note); load(); });
  };

  return (
    <section style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, justifyContent: 'flex-start', marginBottom: 10 }}>
        {(['REQUESTED', 'PAID', 'REJECTED'] as const).map((s) => (
          <button key={s} className={status === s ? 'btn' : 'btn secondary'} onClick={() => setStatus(s)}>
            {s === 'REQUESTED' ? 'To pay' : s === 'PAID' ? 'Paid' : 'Rejected'}
          </button>
        ))}
      </div>
      {error && <div className="error">{error}</div>}
      {rows.length === 0 && <p className="muted">Nothing here.</p>}
      <div className="grid cards">
        {rows.map((w) => {
          const d = dest[w._id];
          return (
            <div key={w._id} className="card">
              <div className="row"><h3 style={{ margin: 0 }}>{inr(w.amount)}</h3><span className="pill">{w.user?.role}</span></div>
              <span className="muted">{w.user?.name} · {w.user?.phone}</span>
              <span className="muted">To {w.destination.display} · requested {new Date(w.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              {w.utr && <span className="muted">UTR {w.utr}</span>}
              {w.note && <span className="muted">{w.note}</span>}
              {status === 'REQUESTED' && (
                <>
                  {d ? (
                    <div className="notice" style={{ marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
                      {d.method === 'UPI' ? <>UPI <b>{d.upiId}</b> ({d.accountName || w.user?.name})</> : <>
                        <b>{d.accountName}</b><br />A/c <b>{d.accountNumber}</b> · IFSC <b>{d.ifsc}</b>{d.bankName ? ` · ${d.bankName}` : ''}
                      </>}
                    </div>
                  ) : (
                    <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => reveal(w)}>Show payment details</button>
                  )}
                  <label htmlFor={`utr-${w._id}`} className="muted" style={{ marginTop: 8 }}>Transfer reference (UTR)</label>
                  <input id={`utr-${w._id}`} className="input" autoComplete="off" spellCheck={false} value={utr[w._id] || ''}
                    onChange={(e) => setUtr((u) => ({ ...u, [w._id]: e.target.value }))} placeholder="UTR from your bank app…" />
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button className="btn" disabled={(utr[w._id] || '').trim().length < 6} onClick={() => markPaid(w)}>Mark paid</button>
                    <button className="btn secondary" onClick={() => reject(w)}>Reject</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
