'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, FlaskConical } from 'lucide-react';
import type { LabOrderView } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDay, fmtTime, inr, problem, LAB_STATUS_LABEL } from '@/lib/care';
import CareArt from '../../_components/care/CareArt';

export default function MyLabOrders() {
  const { patient, loading } = useAuth();
  const [orders, setOrders] = useState<LabOrderView[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (patient) api.myLabOrders().then((r) => setOrders(r.orders)).catch((e) => setError(problem(e).message)); }, [patient]);

  if (!loading && !patient) return <div className="mk-empty"><div className="art"><CareArt kind="lab" /></div><strong>Sign in to see your lab bookings</strong><Link className="mk-btn" href="/login?next=/lab-tests/orders">Sign In</Link></div>;
  return (
    <div>
      <h1 className="mk-h2" style={{ fontSize: 34 }}>My lab tests</h1>
      {error && <p className="mk-note" role="alert">{error}</p>}
      {!orders && !error && <div className="mk-grid">{[0, 1].map((i) => <div key={i} className="mk-skel" />)}</div>}
      {orders && orders.length === 0 && <div className="mk-empty"><div className="art"><CareArt kind="lab" /></div><strong>No lab tests booked</strong><Link className="mk-btn" href="/lab-tests">Book a Test</Link></div>}
      <div className="mk-grid">
        {(orders || []).map((o) => (
          <Link key={o._id} href={`/lab-tests/orders/${o._id}`} className="mk-card-link">
            <article className={`mk-card ${o.status === 'REPORT_READY' ? 'red' : ''} mk-reveal`} style={{ display: 'grid', gap: 10 }}>
              <div className="mk-row">
                <span className="mk-tile"><FlaskConical size={22} aria-hidden="true" /></span>
                <div className="grow">
                  <h2 className="mk-title">{o.items.map((i) => i.name).slice(0, 2).join(', ')}{o.items.length > 2 ? ` +${o.items.length - 2}` : ''}</h2>
                  <p className="mk-meta" style={{ margin: 0 }}>{o.store?.name}</p>
                </div>
                <span className="mk-icon-btn" aria-hidden="true"><ArrowRight size={18} /></span>
              </div>
              <div className="mk-row" style={{ justifyContent: 'space-between' }}>
                <span className="mk-badge">{LAB_STATUS_LABEL[o.status]}</span>
                <span className="mk-meta">{fmtDay(o.slot.date)}, {fmtTime(o.slot.time)} · {inr(o.amounts.total)}</span>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
