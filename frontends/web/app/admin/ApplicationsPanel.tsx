'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PartnerApplication, PartnerKind, StaffMix } from '@medrush/shared';
import { api } from '@/lib/api';

export const KIND_LABEL: Record<PartnerKind, string> = {
  MEDICAL_STAFF: 'Nurse / physio', PHARMACY: 'Pharmacy', PATH_LAB: 'Path lab', DELIVERY: 'Delivery rider',
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
// Must match PROVISIONED_KINDS in services/partnerApplicationService.js.
const CREATES_LOGIN: PartnerKind[] = ['MEDICAL_STAFF', 'PHARMACY', 'DELIVERY', 'PATH_LAB', 'PHLEBOTOMIST'];

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';
const STATUS_LABEL: Record<Status, string> = { PENDING: 'To review', APPROVED: 'Approved', REJECTED: 'Rejected' };

/**
 * Partner applications. In the admin console (scope "admin") it shows every
 * pending application; in the onboarding panel (scope "onboarding") one tab
 * per partner kind (`kind`). Approving a kind that gets a login creates it
 * with verification pending and emails a set-password link.
 */
export default function ApplicationsPanel({ sensitive, scope = 'admin', kind, onChanged }: {
  sensitive: (action: () => Promise<void>) => Promise<void>;
  scope?: 'admin' | 'onboarding';
  kind?: PartnerKind;
  onChanged?: () => void;
}) {
  const [status, setStatus] = useState<Status>('PENDING');
  const [apps, setApps] = useState<PartnerApplication[] | null>(null);
  const [mix, setMix] = useState<StaffMix | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onboarding = scope === 'onboarding';

  const load = useCallback(() => {
    setError(null);
    const list = onboarding ? api.onboardingApplications(status, kind) : api.adminListPartnerApplications(status);
    list.then((r) => setApps(kind ? r.applications.filter((a) => a.kind === kind) : r.applications)).catch((e) => setError(e.message));
    if (!onboarding && status === 'PENDING') api.adminStaffMix().then((r) => setMix(r.mix)).catch(() => undefined);
  }, [onboarding, status, kind]);
  useEffect(load, [load]);

  function decide(a: PartnerApplication, decision: 'APPROVED' | 'REJECTED') {
    setNotice(null);
    setError(null);
    return sensitive(async () => {
      const email = (emails[a._id] || a.email || '').trim();
      const body = { status: decision, ...(email ? { email } : {}) };
      const res = onboarding ? await api.onboardingReviewApplication(a._id, body) : await api.adminReviewPartnerApplication(a._id, body);
      const inv = res.application.invite;
      if (decision === 'REJECTED') setNotice(`${a.name}: rejected.`);
      else if (!inv) setNotice(`${a.name}: approved (waitlist, no login yet).`);
      else if (inv.sent) setNotice(`${a.name}: approved. Set-password link emailed to ${email}. Verify their documents before they go live.`);
      else setNotice(`${a.name}: approved, but email isn't set up here. Send them this one-time link privately: ${inv.link || '(not available in production)'}`);
      load();
      onChanged?.();
    });
  }

  return (
    <section style={{ marginTop: 12 }}>
      <div className="admin-toolbar">
        <div className="segmented" role="tablist" aria-label="Application status">
          {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
            <button key={s} role="tab" aria-selected={status === s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>
      {notice && <div className="notice" role="status" style={{ wordBreak: 'break-all' }}>{notice}</div>}
      {error && <div className="notice bad" role="alert">{error}</div>}
      {mix && !onboarding && (
        <div className="row" style={{ gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
          <b>Staff mix (target physios 2 M : 8 F)</b>
          <MixRow label="Physios" m={mix.physiotherapist} />
          <MixRow label="Nurses" m={mix.nurse} />
        </div>
      )}
      {kind && !CREATES_LOGIN.includes(kind) && (
        <div className="notice" style={{ marginBottom: 10 }}>{KIND_LABEL[kind]} is a waitlist for now: approving records the decision but creates no login.</div>
      )}
      {apps && apps.length === 0 && <p className="muted">{status === 'PENDING' ? 'No requests to review.' : `No ${STATUS_LABEL[status].toLowerCase()} applications.`}</p>}
      <div className="grid cards">
        {!apps && !error && [0, 1, 2].map((i) => <div key={i} className="card skeleton-card" aria-hidden="true" />)}
        {apps?.map((a) => (
          <article key={a._id} className="card review-card">
            <div className="row"><h3>{a.name}</h3><span className="pill">{KIND_LABEL[a.kind] || a.kind}</span></div>
            <span className="muted">{a.phone} · {a.city || 'Jaipur'}{a.gender ? ` · ${GENDER_LABEL[a.gender]}` : ''}</span>
            <dl className="kv compact">
              {a.details?.businessName && <><dt>Business</dt><dd>{a.details.businessName}</dd></>}
              {a.details?.qualification && <><dt>Qualification</dt><dd>{a.details.qualification}</dd></>}
              {a.details?.registrationNumber && <><dt>Registration</dt><dd className="mono">{a.details.registrationNumber}</dd></>}
              {a.details?.experienceYears !== undefined && <><dt>Experience</dt><dd>{a.details.experienceYears} yrs</dd></>}
              {a.details?.vehicle && <><dt>Vehicle</dt><dd>{a.details.vehicle}</dd></>}
              {a.details?.address && <><dt>Address</dt><dd>{a.details.address}</dd></>}
              {a.createdAt && <><dt>Applied</dt><dd>{new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd></>}
            </dl>
            {status === 'PENDING' && (
              <>
                {CREATES_LOGIN.includes(a.kind) && (
                  <input className="input" type="email" aria-label={`Login email for ${a.name}`} placeholder="Email for their login" style={{ marginTop: 8 }}
                    value={emails[a._id] ?? a.email ?? ''} onChange={(e) => setEmails((m) => ({ ...m, [a._id]: e.target.value }))} />
                )}
                <div className="review-actions">
                  <button className="btn" onClick={() => decide(a, 'APPROVED')}>{CREATES_LOGIN.includes(a.kind) ? 'Approve & invite' : 'Approve'}</button>
                  <button className="btn secondary" onClick={() => decide(a, 'REJECTED')}>Reject</button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
