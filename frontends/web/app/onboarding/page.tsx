'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, type AuthUser, type OnboardingReviewer, type PartnerKind } from '@medrush/shared';
import { api } from '@/lib/api';
import { StepUpDialog } from '../_components/AdminMfa';
import ApplicationsPanel, { KIND_LABEL } from '../admin/ApplicationsPanel';
import DocumentsPanel from '../admin/DocumentsPanel';

/** One tab per partner kind; the documents shown are those of the roles that kind becomes. */
const KINDS: Array<{ kind: PartnerKind; roles: string[] }> = [
  { kind: 'MEDICAL_STAFF', roles: ['nurse', 'physiotherapist', 'medical_staff'] },
  { kind: 'PHARMACY', roles: ['pharmacy_vendor'] },
  { kind: 'DELIVERY', roles: ['delivery_partner'] },
  { kind: 'PATH_LAB', roles: ['lab_partner'] },
  { kind: 'PHLEBOTOMIST', roles: ['phlebotomist'] },
  { kind: 'PRP_TECHNICIAN', roles: [] },
  { kind: 'HOSPITAL', roles: [] }
];
type Tab = PartnerKind | 'TEAM';
type View = 'requests' | 'documents';
const PANEL_ROLES = ['onboarding_reviewer', 'platform_admin'];

/**
 * Onboarding panel: partner requests and their documents, one tab per partner
 * kind, for the onboarding team (and platform admins). Platform admins also
 * get the Team tab to add reviewers. Every account here signs in with an
 * authenticator code, and every decision asks for a fresh one.
 */
export default function OnboardingPanel() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>('MEDICAL_STAFF');
  const [view, setView] = useState<View>('requests');
  const [counts, setCounts] = useState<Partial<Record<PartnerKind, number>>>({});
  const [error, setError] = useState<string | null>(null);
  // Decisions need a fresh authenticator code: park the action, ask, retry.
  const [pending, setPending] = useState<(() => Promise<void>) | null>(null);

  const allowed = !!user && PANEL_ROLES.includes(user.role);
  const isPlatformAdmin = user?.role === 'platform_admin';

  const loadCounts = useCallback(() => {
    api.onboardingCounts().then((r) => setCounts(r.counts)).catch(() => undefined);
  }, []);

  useEffect(() => {
    api.staffMe()
      .then((res) => {
        setUser(res.user);
        const wanted = new URLSearchParams(window.location.search).get('tab') as Tab | null;
        if (wanted && (KINDS.some((k) => k.kind === wanted) || (wanted === 'TEAM' && res.user.role === 'platform_admin'))) setTab(wanted);
        if (PANEL_ROLES.includes(res.user.role)) loadCounts();
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, [loadCounts]);

  async function sensitive(action: () => Promise<void>) {
    try {
      setError(null);
      await action();
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { stepUpRequired?: boolean } | undefined) : undefined;
      if (details?.stepUpRequired) { setPending(() => action); return; }
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  function open(next: Tab) {
    setTab(next);
    setView('requests');
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  }

  async function signOut() {
    await api.logout().catch(() => undefined);
    router.replace('/onboarding/login');
  }

  if (checking) return <p className="muted" style={{ marginTop: 20 }}>Checking session…</p>;

  if (!allowed) {
    return (
      <div className="card" style={{ marginTop: 20, maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>Onboarding panel</h2>
        <p className="muted">{user ? 'This account can’t open the onboarding panel.' : 'Sign in with your onboarding team ID.'}</p>
        <Link href="/onboarding/login" className="btn">Sign in</Link>
      </div>
    );
  }

  const current = KINDS.find((k) => k.kind === tab);
  const totalPending = Object.values(counts).reduce((a, b) => a + (b || 0), 0);

  return (
    <>
      <div className="admin-head">
        <div>
          <h1 className="section-title" style={{ margin: 0 }}>Onboarding</h1>
          <span className="muted">{totalPending ? `${totalPending} request${totalPending === 1 ? '' : 's'} waiting` : 'No requests waiting'}</span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="muted">Signed in as {user?.name}</span>
          <button className="btn secondary" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <nav className="admin-tabs" role="tablist" aria-label="Partner types">
        {KINDS.map((k) => (
          <button key={k.kind} role="tab" aria-selected={tab === k.kind} className={tab === k.kind ? 'on' : ''} onClick={() => open(k.kind)}>
            {KIND_LABEL[k.kind]}
            {counts[k.kind] ? <span className="tab-count" aria-label={`${counts[k.kind]} waiting`}>{counts[k.kind]}</span> : null}
          </button>
        ))}
        {isPlatformAdmin && (
          <button role="tab" aria-selected={tab === 'TEAM'} className={tab === 'TEAM' ? 'on' : ''} onClick={() => open('TEAM')}>Team</button>
        )}
      </nav>

      {error && <div className="notice bad" role="alert">{error}</div>}
      <StepUpDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirmed={() => { const action = pending; setPending(null); if (action) sensitive(action); }}
      />

      {current && (
        <>
          {current.roles.length > 0 && (
            <div className="segmented" role="tablist" aria-label="Requests or documents" style={{ marginTop: 12 }}>
              <button role="tab" aria-selected={view === 'requests'} className={view === 'requests' ? 'on' : ''} onClick={() => setView('requests')}>New requests</button>
              <button role="tab" aria-selected={view === 'documents'} className={view === 'documents' ? 'on' : ''} onClick={() => setView('documents')}>Document checks</button>
            </div>
          )}
          {view === 'requests' || current.roles.length === 0
            ? <ApplicationsPanel key={current.kind} scope="onboarding" kind={current.kind} sensitive={sensitive} onChanged={loadCounts} />
            : <DocumentsPanel key={current.kind} scope="onboarding" roles={current.roles} sensitive={sensitive} />}
        </>
      )}

      {tab === 'TEAM' && isPlatformAdmin && <TeamPanel sensitive={sensitive} />}
    </>
  );
}

/** Platform admin: who can sign in to the onboarding panel. */
function TeamPanel({ sensitive }: { sensitive: (action: () => Promise<void>) => Promise<void> }) {
  const [reviewers, setReviewers] = useState<OnboardingReviewer[] | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [form, setForm] = useState({ name: '', email: '' });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.onboardingTeam().then((r) => { setReviewers(r.reviewers); setDomains(r.allowedDomains); }).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const inviteNotice = (who: string, invite: { sent: boolean; link?: string }) => (invite.sent
    ? `${who}: set-password link emailed. They set up their authenticator app the first time they sign in.`
    : `${who}: email isn't set up here. Send this one-time link privately: ${invite.link || '(not available in production)'}`);

  function add(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setError(null);
    return sensitive(async () => {
      const r = await api.onboardingAddReviewer({ name: form.name.trim(), email: form.email.trim() });
      setNotice(inviteNotice(r.reviewer.name, r.invite));
      setForm({ name: '', email: '' });
      load();
    });
  }

  const setActive = (r: OnboardingReviewer, active: boolean) => sensitive(async () => {
    await api.onboardingSetReviewerActive(r._id, active);
    setNotice(`${r.name}: ${active ? 'restored' : 'suspended, and signed out everywhere'}.`);
    load();
  });

  const resend = (r: OnboardingReviewer) => sensitive(async () => {
    const res = await api.onboardingResendInvite(r._id);
    setNotice(inviteNotice(r.name, res.invite));
  });

  return (
    <section style={{ marginTop: 12 }}>
      {notice && <div className="notice good" role="status" style={{ wordBreak: 'break-all' }}>{notice}</div>}
      {error && <div className="notice bad" role="alert">{error}</div>}
      <form className="card" onSubmit={add} style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Add a reviewer</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          You choose their login ID. They get a one-time link to set their own password, then set up an authenticator app at first sign-in.
          {domains.length ? ` Login IDs must be on ${domains.map((d) => `@${d}`).join(' or ')}.` : ' Any email domain is allowed until ONBOARDING_LOGIN_DOMAINS is set (do this once the Nabz domain is live).'}
        </p>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div>
            <label htmlFor="rv-name">Full name</label>
            <input id="rv-name" className="input" autoComplete="off" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required minLength={2} />
          </div>
          <div>
            <label htmlFor="rv-email">Login ID (email)</label>
            <input id="rv-email" className="input" type="email" autoComplete="off" spellCheck={false} value={form.email}
              placeholder={domains[0] ? `name@${domains[0]}` : 'name@company.com'} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
        </div>
        <button className="btn" type="submit" style={{ marginTop: 12 }}>Add reviewer & send link</button>
      </form>

      {reviewers && reviewers.length === 0 && <p className="muted">No reviewers yet.</p>}
      <div className="grid cards">
        {reviewers?.map((r) => (
          <article key={r._id} className="card review-card">
            <div className="row">
              <h3>{r.name}</h3>
              <span className={`pill ${r.isActive ? 'mint' : 'rx'}`}>{r.isActive ? 'Active' : 'Suspended'}</span>
            </div>
            <span className="muted mono">{r.email}</span>
            <dl className="kv compact">
              <dt>Authenticator</dt><dd>{r.mfaEnrolled ? 'Set up' : 'Not set up yet'}</dd>
              <dt>Added</dt><dd>{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
              {domains.length > 0 && !domains.includes((r.email.split('@')[1] || '').toLowerCase()) && <><dt>Domain</dt><dd>Not allowed: can’t sign in</dd></>}
            </dl>
            <div className="review-actions">
              {r.isActive && <button className="btn secondary" onClick={() => resend(r)}>Send new link</button>}
              {r.isActive
                ? <button className="btn secondary danger" onClick={() => setActive(r, false)}>Suspend</button>
                : <button className="btn" onClick={() => setActive(r, true)}>Restore</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
