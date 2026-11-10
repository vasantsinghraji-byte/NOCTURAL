'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { AdminSection, OnboardingReviewer } from '@medrush/shared';

type SectionInfo = { key: AdminSection; label: string; group: string; hint: string };
type KindInfo = { key: string; label: string };
type Access = { sections: AdminSection[]; partnerKinds: string[] };
const VERIFY_SECTIONS: AdminSection[] = ['partners', 'documents', 'verification'];
const EMPTY: Access = { sections: [], partnerKinds: [] };

/**
 * Admin team (main admin only): add people and choose exactly which parts of
 * the admin panel they can open, and which partner types they can verify
 * (e.g. one person for delivery partners, another for nurses). The server
 * enforces it on every request; this screen only edits it.
 */
export default function TeamPanel({ sensitive }: { sensitive: (action: () => Promise<void>) => Promise<void> }) {
  const [team, setTeam] = useState<OnboardingReviewer[] | null>(null);
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [kinds, setKinds] = useState<KindInfo[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [form, setForm] = useState({ name: '', email: '' });
  const [access, setAccess] = useState<Access>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; access: Access } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.onboardingTeam().then((r) => {
      setTeam(r.reviewers); setDomains(r.allowedDomains); setSections(r.sections); setKinds(r.partnerKinds);
    }).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const labelOf = useMemo(() => Object.fromEntries(sections.map((s) => [s.key, s.label])), [sections]);
  const kindLabel = useMemo(() => Object.fromEntries(kinds.map((k) => [k.key, k.label])), [kinds]);

  const inviteNotice = (who: string, invite: { sent: boolean; link?: string }) => (invite.sent
    ? `${who}: set-password link emailed. They set up their authenticator app the first time they sign in.`
    : `${who}: email isn't set up here. Send this one-time link privately: ${invite.link || '(not available in production)'}`);

  function add(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setError(null);
    return sensitive(async () => {
      const r = await api.onboardingAddReviewer({ name: form.name.trim(), email: form.email.trim(), access });
      setNotice(inviteNotice(r.reviewer.name, r.invite));
      setForm({ name: '', email: '' });
      setAccess(EMPTY);
      load();
    });
  }

  const saveAccess = () => editing && sensitive(async () => {
    const r = await api.onboardingSetAccess(editing.id, editing.access);
    setNotice(`${r.reviewer.name}: access updated. It applies from their next click.`);
    setEditing(null);
    load();
  });

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
    <section className="admin-section">
      <header className="admin-section-head">
        <div>
          <h2>Team &amp; access</h2>
          <p className="muted">Give each person only the parts of the admin panel they need, for example one person to verify delivery partners and another for nurses.</p>
        </div>
      </header>
      {notice && <div className="notice good" role="status" style={{ wordBreak: 'break-all' }}>{notice}</div>}
      {error && <div className="notice bad" role="alert">{error}</div>}

      <form className="card admin-card" onSubmit={add}>
        <h3 style={{ marginTop: 0 }}>Add a team member</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          You choose their login ID. They get a one-time link to set their own password, then set up an authenticator app at first sign-in. You never see or choose their password.
          {domains.length ? ` Login IDs must be on ${domains.map((d) => `@${d}`).join(' or ')}.` : ''}
        </p>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div>
            <label htmlFor="tm-name">Full name</label>
            <input id="tm-name" className="input" autoComplete="off" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required minLength={2} />
          </div>
          <div>
            <label htmlFor="tm-email">Login ID (email)</label>
            <input id="tm-email" className="input" type="email" autoComplete="off" spellCheck={false} value={form.email}
              placeholder={domains[0] ? `name@${domains[0]}` : 'name@company.com'} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
        </div>
        <AccessEditor sections={sections} kinds={kinds} value={access} onChange={setAccess} idPrefix="new" />
        <button className="btn" type="submit" disabled={!access.sections.length} style={{ marginTop: 14 }}>Add &amp; send set-password link</button>
      </form>

      {team && team.length === 0 && <p className="muted">No team members yet.</p>}
      <div className="team-grid">
        {team?.map((r) => (
          <article key={r._id} className="card admin-card team-card">
            <div className="row">
              <div>
                <h3 style={{ margin: 0 }}>{r.name}</h3>
                <span className="muted mono">{r.email}</span>
              </div>
              <span className={`pill ${r.isActive ? 'mint' : 'rx'}`}>{r.isActive ? 'Active' : 'Suspended'}</span>
            </div>

            {editing?.id === r._id ? (
              <>
                <AccessEditor sections={sections} kinds={kinds} value={editing.access} onChange={(a) => setEditing({ id: r._id, access: a })} idPrefix={r._id} />
                <div className="review-actions">
                  <button className="btn" onClick={saveAccess} disabled={!editing.access.sections.length}>Save access</button>
                  <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="access-summary">
                  <span className="access-label">Can open</span>
                  <div className="access-chips">
                    {r.access.sections.length ? r.access.sections.map((s) => <span key={s} className="access-chip">{labelOf[s] || s}</span>) : <span className="muted">Nothing yet</span>}
                  </div>
                  {r.access.sections.some((s) => VERIFY_SECTIONS.includes(s)) && (
                    <>
                      <span className="access-label">Verifies</span>
                      <div className="access-chips">
                        {r.access.partnerKinds === null
                          ? <span className="access-chip kind">Every partner type</span>
                          : r.access.partnerKinds.map((k) => <span key={k} className="access-chip kind">{kindLabel[k] || k}</span>)}
                      </div>
                    </>
                  )}
                </div>
                <dl className="kv compact">
                  <dt>Authenticator</dt><dd>{r.mfaEnrolled ? 'Set up' : 'Not set up yet'}</dd>
                  <dt>Last active</dt><dd>{r.lastActive ? new Date(r.lastActive).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Never'}</dd>
                  {r.role === 'onboarding_reviewer' && <><dt>Account</dt><dd>Older onboarding reviewer</dd></>}
                </dl>
                <div className="review-actions">
                  {r.isActive && <button className="btn" onClick={() => setEditing({ id: r._id, access: { sections: r.access.sections, partnerKinds: r.access.partnerKinds || kinds.map((k) => k.key) } })}>Edit access</button>}
                  {r.isActive && <button className="btn secondary" onClick={() => resend(r)}>Send new link</button>}
                  {r.isActive
                    ? <button className="btn secondary danger" onClick={() => setActive(r, false)}>Suspend</button>
                    : <button className="btn" onClick={() => setActive(r, true)}>Restore</button>}
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Section checkboxes grouped by area, plus partner types when a verification section is on. */
function AccessEditor({ sections, kinds, value, onChange, idPrefix }: {
  sections: SectionInfo[]; kinds: KindInfo[]; value: Access; onChange: (a: Access) => void; idPrefix: string;
}) {
  const groups = useMemo(() => {
    const out: Array<{ group: string; items: SectionInfo[] }> = [];
    for (const s of sections) {
      const g = out.find((x) => x.group === s.group);
      if (g) g.items.push(s); else out.push({ group: s.group, items: [s] });
    }
    return out;
  }, [sections]);
  const verifies = value.sections.some((s) => VERIFY_SECTIONS.includes(s));
  const toggle = (key: AdminSection) => onChange({ ...value, sections: value.sections.includes(key) ? value.sections.filter((s) => s !== key) : [...value.sections, key] });
  const toggleKind = (key: string) => onChange({ ...value, partnerKinds: value.partnerKinds.includes(key) ? value.partnerKinds.filter((k) => k !== key) : [...value.partnerKinds, key] });

  return (
    <div className="access-editor">
      <h4>What can they open?</h4>
      <div className="access-groups">
        {groups.map((g) => (
          <fieldset key={g.group} className="access-group">
            <legend>{g.group}</legend>
            {g.items.map((s) => (
              <label key={s.key} className="check-row" htmlFor={`${idPrefix}-${s.key}`}>
                <input id={`${idPrefix}-${s.key}`} type="checkbox" checked={value.sections.includes(s.key)} onChange={() => toggle(s.key)} />
                <span><strong>{s.label}</strong><small>{s.hint}</small></span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      {verifies && (
        <fieldset className="access-group kinds">
          <legend>Which partners can they verify?</legend>
          <div className="kind-row">
            {kinds.map((k) => (
              <label key={k.key} className={`kind-chip ${value.partnerKinds.includes(k.key) ? 'on' : ''}`} htmlFor={`${idPrefix}-k-${k.key}`}>
                <input id={`${idPrefix}-k-${k.key}`} type="checkbox" checked={value.partnerKinds.includes(k.key)} onChange={() => toggleKind(k.key)} />
                {k.label}
              </label>
            ))}
          </div>
          {!value.partnerKinds.length && <p className="muted" style={{ margin: '6px 0 0' }}>Pick at least one partner type.</p>}
        </fieldset>
      )}
    </div>
  );
}
