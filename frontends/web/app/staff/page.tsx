'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { CareBooking } from '@medrush/shared';
import { api } from '@/lib/api';

type Store = { name?: string; address?: { line1?: string; city?: string } };
type Visit = Omit<CareBooking, 'supplies'> & {
  patient?: { name?: string; phone?: string };
  supplies?: Omit<NonNullable<CareBooking['supplies']>, 'pharmacyVendor'> & { pharmacyVendor?: Store | string };
};

const NEXT_STEP: Record<string, { step: 'confirm' | 'en-route' | 'start'; label: string } | undefined> = {
  ASSIGNED: { step: 'confirm', label: 'Accept visit' },
  CONFIRMED: { step: 'en-route', label: 'I’m on my way' },
  EN_ROUTE: { step: 'start', label: 'Start service' }
};

export default function StaffDashboard() {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getMyAssignedVisits()
      .then((r) => setVisits((r.data || []) as Visit[]))
      .catch((e) => setError(e.status === 401 || e.status === 403 ? 'auth' : e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error === 'auth') {
    return <div className="notice" style={{ marginTop: 20 }}>Please <Link href="/staff/login" style={{ color: 'var(--brand)' }}>sign in as medical staff</Link>.</div>;
  }

  return (
    <>
      <section className="hero" style={{ padding: '28px' }}>
        <span className="eyebrow">Medical staff</span>
        <h1 style={{ fontSize: 32 }}>Your visits</h1>
        <p>Collect the patient&apos;s supplies from the listed pharmacy on your way. They&apos;re packed and waiting.</p>
      </section>
      {error && <div className="notice bad" style={{ marginTop: 16 }}>{error}</div>}
      <div className="grid cards" style={{ marginTop: 16 }}>
        {visits === null && <div className="muted">Loading…</div>}
        {visits?.length === 0 && <div className="muted">No visits assigned yet.</div>}
        {visits?.map((v) => {
          const store = v.supplies && typeof v.supplies.pharmacyVendor === 'object' ? v.supplies.pharmacyVendor : null;
          const next = NEXT_STEP[v.status];
          return (
            <div key={v._id} className="card stack">
              <div className="row"><b>{v.serviceType.replace(/_/g, ' ')}</b><span className="pill violet">{v.status}</span></div>
              <div className="muted">{String(v.scheduledDate).slice(0, 10)} · {v.scheduledTime}</div>
              <div className="muted">{v.serviceLocation?.address?.street}, {v.serviceLocation?.address?.pincode}</div>
              {v.supplies?.status === 'ORDERED' && (
                <div className="notice good">
                  Pick up from <b>{store?.name || 'partner pharmacy'}</b>{store?.address?.line1 ? `, ${store.address.line1}` : ''}
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {v.supplies.items.filter((i) => i.source === 'STAFF_BRINGS').map((i) => <li key={i.key}>{i.quantity} × {i.name}</li>)}
                  </ul>
                  <div className="muted">Collect ₹{v.supplies.amount} from the patient for supplies.</div>
                </div>
              )}
              {v.supplies?.items?.some((i) => i.source === 'PATIENT_HAS') && (
                <div className="muted">Patient has: {v.supplies.items.filter((i) => i.source === 'PATIENT_HAS').map((i) => i.name).join(', ')}</div>
              )}
              {next && (
                <button className="btn" onClick={() => api.updateVisitStep(v._id, next.step).then(load).catch((e) => setError(e.message))}>
                  {next.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
