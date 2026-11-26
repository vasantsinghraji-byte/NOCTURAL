'use client';

import { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import type { OrderItem } from '@medrush/shared';
import { api } from '@/lib/api';
import { inr, problem } from '@/lib/care';

/** The store suggests the same medicine from another maker: compare and answer (same as the apps). */
export default function SubstituteCard({ orderId, item, paymentMode, onAnswered }: { orderId: string; item: OrderItem; paymentMode?: string; onAnswered: () => void }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const sub = item.substitution;
  if (!sub || sub.status !== 'PENDING') return null;
  const diff = Math.round((sub.lineTotal - item.lineTotal) * 100) / 100;
  const answer = async (accept: boolean) => {
    setBusy(accept ? 'yes' : 'no');
    setError('');
    try { await api.answerSubstitute(orderId, item.medicine, accept); onAnswered(); } catch (e) { setError(problem(e).message); } finally { setBusy(''); }
  };
  const by = sub.respondBy ? new Date(sub.respondBy).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';
  return (
    <section className="mk-card" style={{ display: 'grid', gap: 12, boxShadow: '0 0 0 2px var(--night)', marginTop: 12 }} aria-labelledby={`sub-${item.medicine}`}>
      <p className="mk-label" style={{ color: 'var(--night)', margin: 0 }}>Your pharmacy suggests a substitute</p>
      <h3 id={`sub-${item.medicine}`} className="mk-title" style={{ fontSize: 18, margin: 0 }}>{item.name} is out of stock. They have the same medicine from another maker.</h3>
      <div className="mk-row" style={{ alignItems: 'stretch', gap: 10, flexWrap: 'wrap' }}>
        <div className="mk-card" style={{ flex: '1 1 200px', background: 'var(--card-alt)', border: 0, padding: 14 }}>
          <p className="mk-label" style={{ margin: 0 }}>You ordered</p>
          <p className="mk-title" style={{ fontSize: 16 }}>{item.name}</p>
          <p className="mk-meta" style={{ margin: 0 }}>{item.quantity} × {inr(item.unitPrice)}</p>
          <p className="mk-price" style={{ fontSize: 20 }}>{inr(item.lineTotal)}</p>
        </div>
        <ArrowRight size={20} aria-hidden="true" style={{ alignSelf: 'center' }} />
        <div className="mk-card" style={{ flex: '1 1 200px', background: 'var(--rose-soft)', border: 0, padding: 14 }}>
          <p className="mk-label" style={{ margin: 0 }}>Suggested</p>
          <p className="mk-title" style={{ fontSize: 16 }}>{sub.name}</p>
          <p className="mk-meta" style={{ margin: 0 }}>{[sub.manufacturer, sub.packSize].filter(Boolean).join(' · ')}</p>
          <p className="mk-meta" style={{ margin: 0 }}>{sub.quantity} × {inr(sub.unitPrice)}</p>
          <p className="mk-price" style={{ fontSize: 20 }}>{inr(sub.lineTotal)}</p>
        </div>
      </div>
      <p className="mk-title" style={{ margin: 0, color: diff < 0 ? 'var(--mint)' : diff > 0 ? 'var(--amber)' : undefined }}>
        {diff < 0 ? `You save ${inr(-diff)}${paymentMode === 'PREPAID' ? ' (refunded)' : ''}` : diff > 0 ? `${inr(diff)} more (pay at delivery)` : 'Same price'}
      </p>
      <p className="mk-meta" style={{ margin: 0 }}><ShieldCheck size={14} aria-hidden="true" /> Same salt, strength and form. Only the maker is different.</p>
      {sub.note && <p className="mk-meta" style={{ margin: 0 }}>Pharmacist: “{sub.note}”</p>}
      {error && <p className="mk-note" role="alert">{error}</p>}
      <div className="mk-row" style={{ gap: 8 }}>
        <button type="button" className="mk-btn" onClick={() => answer(true)} disabled={Boolean(busy)}>{busy === 'yes' ? 'Saving…' : 'Accept Substitute'}</button>
        <button type="button" className="mk-btn ghost" onClick={() => answer(false)} disabled={Boolean(busy)}>{busy === 'no' ? 'Removing…' : 'Remove It'}</button>
      </div>
      {by && <p className="mk-help" style={{ margin: 0 }}>No answer by {by}: it’s removed from the order so nothing is delayed.</p>}
    </section>
  );
}
