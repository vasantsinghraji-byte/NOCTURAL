'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CalendarClock, ClipboardList, FlaskConical, HeartPulse } from 'lucide-react';
import type { FamilyMemberCare } from '@medrush/shared';
import { api } from '@/lib/api';
import { LAB_STATUS_LABEL, fmtDay, fmtTime, problem } from '@/lib/care';
import CareArt from '../../_components/care/CareArt';

const ACTIVE = ['REQUESTED', 'ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const nice = (t: string) => t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function FamilyMemberRoute() {
  return <Suspense fallback={<div className="mk-skel" style={{ minHeight: 260 }} />}><FamilyMember /></Suspense>;
}

/** A family member's care as their helper sees it. */
function FamilyMember() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [care, setCare] = useState<FamilyMemberCare | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.familyMemberCare(id).then(setCare).catch((e) => setError(problem(e).message)); }, [id]);

  if (error) return <div className="mk-empty"><div className="art"><CareArt kind="empty" /></div><strong>{error}</strong><Link className="mk-btn ghost" href="/family">Care Circle</Link></div>;
  if (!care) return <div className="mk-skel" style={{ minHeight: 260 }} />;
  const name = care.member.name;
  const first = name.split(' ')[0];
  const relation = search.get('relation') || '';
  const upcoming = care.visits.filter((v) => ACTIVE.includes(v.status));
  const done = care.visits.filter((v) => v.status === 'COMPLETED').slice(0, 4);
  const visitRow = (v: FamilyMemberCare['visits'][number]) => (
    <article key={v._id} className="mk-card" style={{ padding: 14 }}>
      <div className="mk-row" style={{ flexWrap: 'wrap' }}>
        <span className="mk-tile"><CalendarClock size={20} aria-hidden="true" /></span>
        <div className="grow"><p className="mk-title" style={{ fontSize: 16 }}>{nice(v.serviceType)}</p><p className="mk-meta" style={{ margin: 0 }}>{fmtDay(String(v.scheduledDate).slice(0, 10))}, {fmtTime(v.scheduledTime)}{v.professional ? ` · ${v.professional}` : ''}</p></div>
        <span className={`mk-badge ${v.status === 'COMPLETED' ? 'green' : ''}`}>{nice(v.status)}</span>
        {['IN_PROGRESS', 'COMPLETED'].includes(v.status) && <Link className="mk-btn soft small" href={`/care-log/${v._id}`}><ClipboardList size={14} aria-hidden="true" /> Care Log</Link>}
      </div>
    </article>
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="mk-card" style={{ display: 'grid', gap: 12 }}>
        <h1 className="mk-title" style={{ fontSize: 26 }}>{name}</h1>
        <p className="mk-meta" style={{ margin: 0 }}>{relation || 'Family'} · you get their visit updates</p>
        <div className="mk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link className="mk-btn" href="/care" onClick={() => { try { sessionStorage.setItem('nabz.bookingFor', JSON.stringify({ name, relation })); } catch { /* private mode */ } }}><HeartPulse size={16} aria-hidden="true" /> Book for {first}</Link>
          <Link className="mk-btn soft" href="/lab-tests"><FlaskConical size={16} aria-hidden="true" /> Lab Test</Link>
        </div>
        <p className="mk-help" style={{ margin: 0 }}>The booking is filled in for {first}; you pay from your account.</p>
      </section>
      <h2 className="mk-h2" style={{ margin: 0 }}>Coming up</h2>
      {upcoming.length === 0 ? <p className="mk-note neutral">No visits booked for {first}.</p> : <div className="mk-list">{upcoming.map(visitRow)}</div>}
      {care.plans.length > 0 && (<>
        <h2 className="mk-h2" style={{ margin: 0 }}>Care plans</h2>
        <div className="mk-grid">{care.plans.map((p) => <div key={p._id} className="mk-card"><p className="mk-title">{p.serviceName}</p><p className="mk-meta" style={{ margin: 0 }}>{p.store} · {p.sessionsCompleted}/{p.sessionsTotal} done</p></div>)}</div>
      </>)}
      {care.labOrders.length > 0 && (<>
        <h2 className="mk-h2" style={{ margin: 0 }}>Lab tests</h2>
        <div className="mk-list">{care.labOrders.map((o) => <div key={o._id} className="mk-card" style={{ padding: 14 }}><div className="mk-row"><div className="grow"><p className="mk-title" style={{ fontSize: 16 }}>{o.tests.join(', ')}</p><p className="mk-meta" style={{ margin: 0 }}>{o.lab} · {fmtDay(o.slot.date)}, {fmtTime(o.slot.time)}</p></div><span className="mk-badge">{LAB_STATUS_LABEL[o.status as 'SCHEDULED'] || o.status}</span></div></div>)}</div>
        <p className="mk-help" style={{ margin: 0 }}>Reports are private to {first}.</p>
      </>)}
      {done.length > 0 && (<><h2 className="mk-h2" style={{ margin: 0 }}>Recent visits</h2><div className="mk-list">{done.map(visitRow)}</div></>)}
    </div>
  );
}
