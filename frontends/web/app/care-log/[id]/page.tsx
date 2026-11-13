'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CareLogView } from '@medrush/shared';
import { api } from '@/lib/api';
import { fmtDay, fmtTime, problem } from '@/lib/care';
import CareArt from '../../_components/care/CareArt';
import CareLogTimeline from '../../_components/care/CareLogTimeline';

/** A visit's care log for the customer and their Care Circle. */
export default function CareLogPage() {
  const { id } = useParams<{ id: string }>();
  const [log, setLog] = useState<CareLogView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => api.visitCareLog(id).then((r) => setLog(r.log)).catch((e) => setError(problem(e).message));
    load();
    const t = setInterval(load, 60000); // a running visit keeps adding entries
    return () => clearInterval(t);
  }, [id]);
  if (error) return <div className="mk-empty"><div className="art"><CareArt kind="empty" /></div><strong>{error}</strong><Link className="mk-btn ghost" href="/care/plans">My Plans</Link></div>;
  if (!log) return <div className="mk-skel" style={{ minHeight: 240 }} />;
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
      <section className="mk-card">
        <h1 className="mk-title" style={{ fontSize: 24 }}>Care log</h1>
        <p className="mk-meta" style={{ margin: 0 }}>{log.serviceType.replace(/_/g, ' ').toLowerCase()} · {fmtDay(String(log.scheduledDate).slice(0, 10))}, {fmtTime(log.scheduledTime)}{log.professional ? ` · ${log.professional}` : ''}</p>
      </section>
      <section className="mk-card"><CareLogTimeline log={log} /></section>
      <p className="mk-help">Readings are written by the professional during the visit. They are not a diagnosis; talk to your doctor about anything worrying.</p>
    </div>
  );
}
