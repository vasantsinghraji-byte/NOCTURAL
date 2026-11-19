'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, PhoneCall } from 'lucide-react';
import type { CallbackTopic, CallbackView } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { problem } from '@/lib/care';
import { confirmDialog } from '../Dialog';

/** "Call me back": someone from Nabz phones the customer (same as the apps). */
export default function CallMeBack({ topic = 'OTHER', label = 'Talk to a person' }: { topic?: CallbackTopic; label?: string }) {
  const { patient } = useAuth();
  const [open, setOpen] = useState<CallbackView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!patient) return;
    api.myCallback().then((r) => setOpen(r.request && r.request.status === 'OPEN' ? r.request : null)).catch(() => undefined);
  }, [patient]);

  const ask = async () => {
    if (!(await confirmDialog({ title: 'Should we call you?', message: 'Someone from Nabz will call your registered number, usually within 15 minutes (8 am to 9 pm).', confirmLabel: 'Yes, Call Me' }))) return;
    setBusy(true);
    setError('');
    try { setOpen((await api.requestCallback({ topic })).request); } catch (e) { setError(problem(e).message); } finally { setBusy(false); }
  };

  if (open) {
    return <p className="mk-note green" role="status"><CheckCircle2 size={18} aria-hidden="true" /> We’ll call you soon. Keep your phone nearby.</p>;
  }
  return (
    <div className="mk-card" style={{ padding: 14 }}>
      <div className="mk-row" style={{ flexWrap: 'wrap' }}>
        <span className="mk-tile"><PhoneCall size={20} aria-hidden="true" /></span>
        <div className="grow">
          <p className="mk-title" style={{ fontSize: 16 }}>{label}</p>
          <p className="mk-meta" style={{ margin: 0 }}>Prefer to talk? We’ll call you back.</p>
        </div>
        {patient
          ? <button type="button" className="mk-btn soft small" onClick={ask} disabled={busy}>{busy ? 'Requesting…' : 'Call Me Back'}</button>
          : <Link className="mk-btn soft small" href="/login?next=/care">Sign In</Link>}
      </div>
      {error && <p className="mk-note" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
}
