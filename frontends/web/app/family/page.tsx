'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, HeartHandshake, ShieldCheck, UserPlus, Users } from 'lucide-react';
import type { FamilyLinkView } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { problem } from '@/lib/care';
import { confirmDialog } from '../_components/Dialog';
import CareArt from '../_components/care/CareArt';

const RELATIONS = ['Mother', 'Father', 'Grandparent', 'Spouse', 'Child', 'Other'];

/** Care Circle (same as the apps): help a parent with their care, or let family help you. */
export default function FamilyPage() {
  const { patient } = useAuth();
  const [data, setData] = useState<{ members: FamilyLinkView[]; helpers: FamilyLinkView[]; invites: FamilyLinkView[] } | null>(null);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('Mother');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => api.myFamily().then((r) => { setData(r); setError(''); }).catch((e) => setError(problem(e).message)), []);
  useEffect(() => { if (patient) load(); }, [patient, load]);

  if (!patient) return <div className="mk-empty"><div className="art"><CareArt kind="homecare" /></div><strong>Sign in to use Care Circle</strong><Link className="mk-btn" href="/login?next=/family">Sign In</Link></div>;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try { await api.inviteFamily({ phone, relation }); setPhone(''); setNotice('Invitation sent. They’ll see it in their Nabz app.'); await load(); } catch (err) { setNotice(problem(err).message); } finally { setSaving(false); }
  };
  const answer = async (l: FamilyLinkView, accept: boolean) => { await api.answerFamilyInvite(l._id, accept).catch((e) => setError(problem(e).message)); await load(); };
  const remove = async (l: FamilyLinkView) => {
    if (!(await confirmDialog({ title: l.role === 'HELPER' ? `Stop helping ${l.person?.name}?` : `Stop ${l.person?.name} helping you?`, message: 'They will no longer see the visits or get updates.', confirmLabel: 'Stop', danger: true }))) return;
    await api.removeFamilyLink(l._id).catch((e) => setError(problem(e).message));
    await load();
  };

  return (
    <div>
      <section className="mk-hero" aria-labelledby="family-title">
        <div className="in slim">
          <div>
            <h1 id="family-title">Care for family, <b>together</b></h1>
            <p>See a parent’s visits, get every update and book for them. They accept first, and either of you can stop it any time.</p>
          </div>
          <div className="art"><CareArt kind="homecare" /></div>
        </div>
      </section>
      {error && <p className="mk-note" role="alert">{error}</p>}
      {!data && <div className="mk-skel" style={{ minHeight: 160 }} />}
      {data && (
        <div className="mk-book">
          <div style={{ display: 'grid', gap: 14 }}>
            {data.invites.map((l) => (
              <article key={l._id} className="mk-card" style={{ display: 'grid', gap: 10, boxShadow: '0 0 0 2px var(--night)' }}>
                <div className="mk-row"><span className="mk-tile"><HeartHandshake size={22} aria-hidden="true" /></span><div className="grow"><p className="mk-title">{l.person?.name} wants to help with your care</p><p className="mk-meta" style={{ margin: 0 }}>They’ll see your visits and can book for you. Your lab reports stay private.</p></div></div>
                <div className="mk-row" style={{ gap: 8 }}><button type="button" className="mk-btn" onClick={() => answer(l, true)}>Allow</button><button type="button" className="mk-btn ghost" onClick={() => answer(l, false)}>No</button></div>
              </article>
            ))}
            <h2 className="mk-h2" style={{ marginTop: 0 }}>People I help</h2>
            {data.members.length === 0 && <p className="mk-note neutral">Add a parent or relative. Nothing is shared until they accept.</p>}
            {data.members.map((l) => (
              <div key={l._id} className="mk-card" style={{ padding: 14 }}>
                <div className="mk-row">
                  <span className="mk-avatar" style={{ width: 46, height: 46, borderRadius: 16, fontSize: 18 }} aria-hidden="true">{(l.person?.name || '?')[0]}</span>
                  <div className="grow"><p className="mk-title">{l.person?.name}</p><p className="mk-meta" style={{ margin: 0 }}>{l.relation || 'Family'} · {l.status === 'ACTIVE' ? 'Visits, plans and updates' : 'Waiting for them to accept'}</p></div>
                  {l.status === 'ACTIVE'
                    ? <Link className="mk-btn soft small" href={`/family/${l.person?._id}?name=${encodeURIComponent(l.person?.name || '')}&relation=${encodeURIComponent(l.relation || '')}`}>Open <ChevronRight size={14} aria-hidden="true" /></Link>
                    : <button type="button" className="mk-btn ghost small" onClick={() => remove(l)}>Cancel</button>}
                </div>
              </div>
            ))}
            {data.helpers.length > 0 && <h2 className="mk-h2">Helping me</h2>}
            {data.helpers.map((l) => (
              <div key={l._id} className="mk-card" style={{ padding: 14 }}>
                <div className="mk-row"><span className="mk-tile"><Users size={20} aria-hidden="true" /></span><div className="grow"><p className="mk-title">{l.person?.name}</p><p className="mk-meta" style={{ margin: 0 }}>Sees your visits and can book for you</p></div><button type="button" className="mk-btn ghost small" onClick={() => remove(l)}>Remove</button></div>
              </div>
            ))}
          </div>
          <aside className="mk-sticky" aria-label="Add a family member">
            <form className="mk-card" onSubmit={invite} style={{ display: 'grid', gap: 12 }}>
              <p className="mk-title"><UserPlus size={18} aria-hidden="true" /> Add a family member</p>
              <div className="mk-field"><label htmlFor="f-phone">Their mobile number</label><input id="f-phone" className="mk-input" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" /></div>
              <div className="mk-field"><span className="mk-label">They are my</span><div className="mk-chips" style={{ padding: 0 }}>{RELATIONS.map((r) => <button key={r} type="button" className="mk-chip" aria-pressed={relation === r} onClick={() => setRelation(r)}>{r}</button>)}</div></div>
              {notice && <p className="mk-note neutral" role="status">{notice}</p>}
              <button type="submit" className="mk-btn" disabled={saving || phone.replace(/\D/g, '').length < 10}>{saving ? 'Sending…' : 'Send Invitation'}</button>
              <p className="mk-help" style={{ margin: 0 }}><ShieldCheck size={12} aria-hidden="true" /> Lab reports and payments stay private to each person.</p>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
