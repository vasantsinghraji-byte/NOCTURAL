'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarHeart } from 'lucide-react';
import type { CarePlanView } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDay, inr, problem, PLAN_STATUS_LABEL as STATUS_LABEL } from '@/lib/care';
import CareArt from '../../_components/care/CareArt';

export default function MyPlans() {
  const { patient, loading } = useAuth();
  const [plans, setPlans] = useState<CarePlanView[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!patient) return;
    api.myCarePlans().then((r) => setPlans(r.plans)).catch((e) => setError(problem(e).message));
  }, [patient]);

  if (!loading && !patient) {
    return (
      <div className="mk-empty">
        <div className="art"><CareArt kind="empty" /></div>
        <strong>Sign in to see your care plans</strong>
        <Link className="mk-btn" href="/login?next=/care/plans">Sign In</Link>
      </div>
    );
  }
  return (
    <div>
      <h1 className="mk-h2" style={{ fontSize: 34 }}>My care plans</h1>
      {error && <p className="mk-note" role="alert">{error}</p>}
      {!plans && !error && <div className="mk-grid">{[0, 1, 2].map((i) => <div key={i} className="mk-skel" />)}</div>}
      {plans && plans.length === 0 && (
        <div className="mk-empty">
          <div className="art"><CareArt kind="empty" /></div>
          <strong>No plans yet</strong>
          <span>Book physio, home care or nursing and it shows here.</span>
          <Link className="mk-btn" href="/care">Find Care</Link>
        </div>
      )}
      <div className="mk-grid">
        {(plans || []).map((p, i) => (
          <Link key={p._id} href={`/care/plans/${p._id}`} className="mk-card-link">
            <article className={`mk-card ${i === 0 && p.status === 'ACTIVE' ? 'red' : ''} mk-reveal`} style={{ display: 'grid', gap: 10 }}>
              <div className="mk-row">
                <span className="mk-tile"><CalendarHeart size={22} aria-hidden="true" /></span>
                <div className="grow">
                  <h2 className="mk-title">{p.serviceName}</h2>
                  <p className="mk-meta" style={{ margin: 0 }}>{p.store?.name}</p>
                </div>
                <span className="mk-icon-btn" aria-hidden="true"><ArrowRight size={18} /></span>
              </div>
              <div className="mk-row" style={{ justifyContent: 'space-between' }}>
                <span className={`mk-badge ${p.status === 'ACTIVE' ? 'green' : p.status === 'PENDING_PAYMENT' ? 'red' : ''}`}>{STATUS_LABEL[p.status]}</span>
                <span className="mk-meta">{p.sessionsCompleted}/{p.sessionsTotal} · {inr(p.price.total)}</span>
              </div>
              <p className="mk-meta" style={{ margin: 0 }}>Booked {fmtDay(p.createdAt)} · {p.mode === 'HOME' ? 'at home' : 'at the clinic'}</p>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
