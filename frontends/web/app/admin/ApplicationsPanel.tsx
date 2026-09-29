'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PartnerApplication, StaffMix } from '@medrush/shared';
import { api } from '@/lib/api';

const KIND_LABEL: Record<string, string> = {
  MEDICAL_STAFF: 'Nurse / physio', PHARMACY: 'Pharmacy', PATH_LAB: 'Path lab', DELIVERY: 'Delivery',
  PHLEBOTOMIST: 'Phlebotomist', PRP_TECHNICIAN: 'PRP technician', HOSPITAL: 'Hospital / nursing home'
};
const GENDER_LABEL: Record<string, string> = { FEMALE: 'Female', MALE: 'Male', OTHER: 'Other' };

/** Physio hiring target from the Phase 1.1 plan: 2 male : 8 female. */
function MixRow({ label, m }: { label: string; m?: { FEMALE: number; MALE: number; OTHER: number; UNKNOWN: number } }) {
  if (!m) return null;
  const total = m.FEMALE + m.MALE + m.OTHER + m.UNKNOWN;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return <span className="pill">{label}: {m.MALE} M : {m.FEMALE} F{m.UNKNOWN ? ` · ${m.UNKNOWN} not set` : ''} ({pct(m.MALE)} : {pct(m.FEMALE)}%)</span>;
}
const CREATES_LOGIN = ['MEDICAL_STAFF', 'PHARMACY'];

/**
 * Partner applications (platform_admin). Approving a nurse/physio or pharmacy
 * creates their login with verification pending and emails a set-password link.
 */
export default function ApplicationsPanel({ sensitive }: { sensitive: (action: () => Promise<void>) => Promise<void> }) {
  const [apps, setApps] = useState<PartnerApplication[]>([]);
  const [mix, setMix] = useState<StaffMix | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.adminListPartnerApplications('PENDING').then((r) => setApps(r.applications)).catch((e) => setError(e.message));
    api.adminStaffMix().then((r) => setMix(r.mix)).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  function decide(a: PartnerApplication, status: 'APPROVED' | 'REJECTED') {
    setNotice(null);
    setError(null);
    return sensitive(async () => {
      const email = (emails[a._id] || a.email || '').trim();
      const res = await api.adminReviewPartnerApplication(a._id, { status, ...(email ? { email } : {}) });
      const inv = res.application.invite;
      if (status === 'REJECTED') setNotice(`${a.name}: rejected.`);
      else if (!inv) setNotice(`${a.name}: approved (waitlist, no login yet).`);
      else if (inv.sent) setNotice(`${a.name}: approved. Set-password link emailed to ${email}. Verify their documents before they go live.`);
      else setNotice(`${a.name}: approved, but email isn't set up here. Send them this one-time link privately: ${inv.link || '(not available in production)'}`);
      load();
    });
  }

  return (
    <section style={{ marginTop: 12 }}>
      {notice && <div className="notice" style={{ wordBreak: 'break-all' }}>{notice}</div>}
      {error && <div className="error">{error}</div>}
      {mix && (
        <div className="row" style={{ gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
          <b>Staff mix (target physios 2 M : 8 F)</b>
          <MixRow label="Physios" m={mix.physiotherapist} />
          <MixRow label="Nurses" m={mix.nurse} />
        </div>
      )}
      {apps.length === 0 && <p className="muted">No pending applications.</p>}
      <div className="grid cards">
        {apps.map((a) => (
          <div key={a._id} className="card">
            <div className="row"><h3>{a.name}</h3><span className="pill">{KIND_LABEL[a.kind] || a.kind}</span></div>
            <span className="muted">{a.phone} · {a.city || 'Jaipur'}{a.gender ? ` · ${GENDER_LABEL[a.gender]}` : ''}</span>
            {a.details?.qualification && <span className="muted">{a.details.qualification}</span>}
            {a.details?.businessName && <span className="muted">{a.details.businessName}</span>}
            {a.details?.registrationNumber && <span className="muted">Reg. {a.details.registrationNumber}</span>}
            {CREATES_LOGIN.includes(a.kind) && (
              <input className="input" type="email" placeholder="Email for their login" style={{ marginTop: 8 }}
                value={emails[a._id] ?? a.email ?? ''} onChange={(e) => setEmails((m) => ({ ...m, [a._id]: e.target.value }))} />
            )}
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button className="btn" onClick={() => decide(a, 'APPROVED')}>{CREATES_LOGIN.includes(a.kind) ? 'Approve & invite' : 'Approve'}</button>
              <button className="btn secondary" onClick={() => decide(a, 'REJECTED')}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
