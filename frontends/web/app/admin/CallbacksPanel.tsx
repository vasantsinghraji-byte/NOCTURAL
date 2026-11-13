'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, PhoneCall } from 'lucide-react';
import { api } from '@/lib/api';
import { promptDialog } from '../_components/Dialog';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
type Row = Awaited<ReturnType<typeof api.adminCallbacks>>['requests'][number];
const TOPIC: Record<string, string> = { BOOKING: 'Booking', VISIT: 'A visit', MEDICINES: 'Medicines', LAB: 'Lab test', PAYMENT: 'Payment', OTHER: 'Other' };
const STATUSES = [['OPEN', 'To call'], ['CALLED', 'Called'], ['CLOSED', 'Closed']] as const;

/**
 * "Call me back" queue: oldest first. Numbers stay masked; revealing one needs
 * a fresh sign-in and is recorded on the request.
 */
export default function CallbacksPanel({ sensitive }: { sensitive: Sensitive }) {
  const [status, setStatus] = useState<'OPEN' | 'CALLED' | 'CLOSED'>('OPEN');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const load = useCallback(() => api.adminCallbacks(status).then((r) => { setRows(r.requests); setError(''); }).catch((e) => { setError(e instanceof Error ? e.message : 'Could not load'); setRows([]); }), [status]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const reveal = (id: string) => sensitive(async () => {
    const r = await api.adminRevealCallback(id);
    setNumbers((n) => ({ ...n, [id]: r.phone }));
  });
  const mark = async (id: string, next: 'CALLED' | 'CLOSED') => {
    const outcome = await promptDialog({ title: next === 'CALLED' ? 'What happened on the call?' : 'Why close it?', label: 'Note', placeholder: 'Booked 5 physio sessions for her mother…', minLength: 2, maxLength: 300 });
    if (!outcome) return;
    await api.adminUpdateCallback(id, { status: next, outcome }).catch((e) => setError(e instanceof Error ? e.message : 'Could not save'));
    await load();
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="mk-chips" role="group" aria-label="Status">
        {STATUSES.map(([k, label]) => <button key={k} type="button" className="mk-chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{label}</button>)}
      </div>
      {error && <p className="mk-note" role="alert">{error}</p>}
      {!rows && <div className="mk-skel" />}
      {rows && rows.length === 0 && <p className="mk-note neutral">Nobody is waiting for a call.</p>}
      <div className="mk-list">
        {(rows || []).map((r) => {
          const since = Math.max(0, Math.round((Date.now() - new Date(r.createdAt).getTime()) / 60000));
          return (
            <article key={r._id} className="mk-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
              <div className="mk-row" style={{ flexWrap: 'wrap' }}>
                <span className="mk-tile"><PhoneCall size={20} aria-hidden="true" /></span>
                <div className="grow">
                  <p className="mk-title" style={{ fontSize: 16 }}>{r.customer} · {TOPIC[r.topic] || r.topic}</p>
                  <p className="mk-meta" style={{ margin: 0 }}>
                    {status === 'OPEN' ? `Waiting ${since < 60 ? `${since} min` : `${Math.floor(since / 60)} h ${since % 60} min`}` : r.outcome || ''}
                    {r.language === 'hi' ? ' · prefers Hindi' : ''}{r.context ? ` · about ${r.context.kind.toLowerCase().replace('_', ' ')}` : ''}
                  </p>
                  {r.note && <p className="mk-meta" style={{ margin: '4px 0 0' }}>“{r.note}”</p>}
                </div>
                {status === 'OPEN' && since >= 15 && <span className="mk-badge red">Over 15 min</span>}
              </div>
              <div className="mk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {numbers[r._id]
                  ? <a className="mk-btn small" href={`tel:${numbers[r._id]}`}><PhoneCall size={14} aria-hidden="true" /> Call {numbers[r._id]}</a>
                  : <button type="button" className="mk-btn soft small" onClick={() => reveal(r._id)}><Eye size={14} aria-hidden="true" /> Show Number ({r.phone})</button>}
                {status === 'OPEN' && <button type="button" className="mk-btn ghost small" onClick={() => mark(r._id, 'CALLED')}><CheckCircle2 size={14} aria-hidden="true" /> Mark Called</button>}
                {status !== 'CLOSED' && <button type="button" className="mk-btn ghost small" onClick={() => mark(r._id, 'CLOSED')}>Close</button>}
                {r.reveals > 0 && <span className="mk-meta">Number shown {r.reveals}×</span>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
