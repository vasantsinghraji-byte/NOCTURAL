'use client';

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Fingerprint, ShieldCheck, Syringe, type LucideIcon } from 'lucide-react';
import type { AdminVerificationRow } from '@medrush/shared';
import { api } from '@/lib/api';
import { confirmDialog } from '../_components/Dialog';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
type Flag = 'id' | 'police' | 'council' | 'vaccinated';
const FLAGS: Array<{ key: Flag; label: string; icon: LucideIcon }> = [
  { key: 'id', label: 'ID', icon: Fingerprint },
  { key: 'police', label: 'Police', icon: ShieldCheck },
  { key: 'council', label: 'Council', icon: BadgeCheck },
  { key: 'vaccinated', label: 'Vaccinated', icon: Syringe }
];
const nice = (t?: string | null) => (t || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/**
 * Medical staff verification: nurses and physios can go online only once ID,
 * police and council checks are ticked here. Removing a core check takes them
 * offline and hands their upcoming visits to other staff.
 */
export default function VerificationPanel({ sensitive }: { sensitive: Sensitive }) {
  const [status, setStatus] = useState<'pending' | 'verified' | 'all'>('pending');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminVerificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.adminVerificationQueue(status, q.trim() || undefined).then((r) => setRows(r.staff)).catch((e) => setError(e.message));
  }, [status, q]);
  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  async function toggle(s: AdminVerificationRow, key: Flag) {
    const next = !s.verification[key];
    if (!next && key !== 'vaccinated' && !(await confirmDialog({ title: `Remove the ${key} check for ${s.name}?`, message: 'They go offline now and their upcoming visits are given to other staff.', confirmLabel: 'Remove check', danger: true }))) return;
    sensitive(async () => {
      const r = await api.adminSetStaffVerification(s._id, { [key]: next });
      setNotice(`${s.name}: ${key} check ${next ? 'added' : 'removed'}.${r.releasedVisits ? ` ${r.releasedVisits} visit(s) reassigned.` : ''}`);
      load();
    });
  }

  return (
    <section style={{ marginTop: 12 }}>
      <div className="admin-toolbar">
        <div className="segmented" role="tablist" aria-label="Verification status">
          {(['pending', 'verified', 'all'] as const).map((s) => (
            <button key={s} role="tab" aria-selected={status === s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s === 'pending' ? 'Needs checks' : nice(s)}</button>
          ))}
        </div>
        <input className="input" type="search" name="q" autoComplete="off" spellCheck={false} aria-label="Search staff" placeholder="Name, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      {notice && <div className="notice good" role="status">{notice}</div>}
      {rows && rows.length === 0 && <p className="muted">{status === 'pending' ? 'Everyone is verified.' : 'No staff found.'}</p>}

      <div className="grid cards" style={{ marginTop: 10 }}>
        {rows?.map((s) => {
          const ready = s.verification.id && s.verification.police && s.verification.council;
          return (
            <div key={s._id} className="card stack">
              <div className="row">
                <b>{s.name}</b>
                <span className={`pill ${ready ? 'mint' : ''}`}>{ready ? 'Can go online' : 'Blocked'}</span>
              </div>
              <span className="muted">{nice(s.role)}{s.qualification ? ` · ${s.qualification}` : ''}{s.gender ? ` · ${nice(s.gender)}` : ''}</span>
              <span className="muted">Council reg.: <span className="mono">{s.registrationNumber || 'not given'}</span></span>
              <span className="muted mono">{s.email} · {s.phone || '-'}</span>
              <div className="check-toggles" role="group" aria-label={`Checks for ${s.name}`}>
                {FLAGS.map(({ key, label, icon: Icon }) => (
                  <button key={key} className={s.verification[key] ? 'on' : ''} aria-pressed={s.verification[key]} onClick={() => toggle(s, key)}>
                    <Icon size={15} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
              {s.verification.verifiedAt && <span className="muted" style={{ fontSize: 12 }}>Last change {new Date(s.verification.verifiedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Check documents before ticking. Every change needs a fresh authenticator code and is recorded in the audit log.</p>
    </section>
  );
}
