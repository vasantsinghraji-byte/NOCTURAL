'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminUserDetail, AdminUserRow, AdminUserType } from '@medrush/shared';
import { api } from '@/lib/api';
import { Modal, promptDialog } from '../_components/Dialog';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
const ROLES = ['nurse', 'physiotherapist', 'medical_staff', 'pharmacy_vendor', 'phlebotomist', 'lab_partner', 'delivery_partner'];
const nice = (t?: string) => (t || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const date = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

/**
 * User database: customers and partners with contact details masked. Showing
 * the full email / phone and suspending need a fresh 2FA code and a reason,
 * and are written to the audit log.
 */
export default function UsersPanel({ sensitive }: { sensitive: Sensitive }) {
  const [type, setType] = useState<AdminUserType>('customers');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ users: AdminUserRow[]; total: number; pages: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AdminUserRow | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.adminUsers({ type, q: q.trim() || undefined, role: type === 'partners' && role ? role : undefined, active: active || undefined, page })
      .then((r) => setData(r))
      .catch((e) => setError(e.message));
  }, [type, q, role, active, page]);
  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  return (
    <section style={{ marginTop: 12 }}>
      <div className="admin-toolbar">
        <div className="segmented" role="tablist" aria-label="User type">
          {(['customers', 'partners'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={type === t} className={type === t ? 'on' : ''} onClick={() => { setType(t); setPage(1); }}>{nice(t)}</button>
          ))}
        </div>
        <input className="input" type="search" name="q" autoComplete="off" spellCheck={false} aria-label="Search users" placeholder="Name, email, phone or ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        {type === 'partners' && (
          <select className="input" aria-label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{nice(r)}</option>)}
          </select>
        )}
        <select className="input" aria-label="Status" value={active} onChange={(e) => { setActive(e.target.value as '' | 'true' | 'false'); setPage(1); }}>
          <option value="">Active and suspended</option>
          <option value="true">Active only</option>
          <option value="false">Suspended only</option>
        </select>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      {data && <p className="muted" style={{ margin: '8px 0' }}>{data.total.toLocaleString('en-IN')} {type}</p>}

      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Phone</th>
              {type === 'partners' ? <><th>Role</th><th>Checks</th></> : <><th>City</th><th>Bookings</th></>}
              <th>Joined</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u._id} onClick={() => setOpen(u)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(u); }} aria-label={`Open ${u.name}`}>
                <td><b>{u.name}</b></td>
                <td className="mono">{u.email || '-'}</td>
                <td className="mono">{u.phone || '-'}</td>
                {type === 'partners' ? (
                  <><td>{nice(u.role)}</td><td>{u.verification ? <Checks v={u.verification} /> : '-'}</td></>
                ) : (
                  <><td>{u.city || '-'}</td><td className="num">{u.bookings ?? 0}</td></>
                )}
                <td>{date(u.joinedAt)}</td>
                <td>{u.active ? <span className="pill mint">Active</span> : <span className="pill rx">Suspended</span>}</td>
              </tr>
            ))}
            {!data && !error && [0, 1, 2, 3, 4].map((i) => <tr key={i} aria-hidden="true"><td colSpan={7}><span className="skeleton" style={{ width: `${70 - i * 8}%` }} /></td></tr>)}
            {data && data.users.length === 0 && <tr><td colSpan={7} className="muted">No users match. Try a name, a full email, or the last digits of a phone number.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && data.pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 10 }}>
          <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="muted">Page {page} of {data.pages}</span>
          <button className="btn secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
      {open && <UserDialog row={open} sensitive={sensitive} onClose={() => setOpen(null)} onChanged={load} />}
    </section>
  );
}

function Checks({ v }: { v: NonNullable<AdminUserRow['verification']> }) {
  const all = v.id && v.police && v.council;
  return <span className={`pill ${all ? 'mint' : ''}`}>{[v.id && 'ID', v.police && 'Police', v.council && 'Council'].filter(Boolean).join(' · ') || 'None'}</span>;
}

function UserDialog({ row, sensitive, onClose, onChanged }: { row: AdminUserRow; sensitive: Sensitive; onClose: () => void; onChanged: () => void }) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [contact, setContact] = useState<{ email: string | null; phone: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api.adminUser(row.type, row._id).then((r) => setUser(r.user)).catch((e) => setError(e.message));
  }, [row]);
  useEffect(load, [load]);

  function reveal() {
    promptDialog({
      title: 'Show contact details',
      message: 'Your reason is saved in the audit log with your name.',
      label: 'Why do you need them?',
      placeholder: 'e.g. customer called about a refund…',
      minLength: 3,
      maxLength: 200,
      confirmLabel: 'Show details'
    }).then((reason) => {
      if (reason) sensitive(async () => { const r = await api.adminRevealContact(row.type, row._id, reason); setContact(r.contact); });
    });
  }

  function toggleActive() {
    if (!user) return;
    const next = !user.active;
    promptDialog({
      title: next ? `Restore ${row.name}?` : `Suspend ${row.name}?`,
      message: next ? 'They can sign in again straight away.' : 'They are signed out everywhere and can’t sign in until restored. Upcoming visits go to other staff.',
      label: 'Reason (saved in the audit log)',
      placeholder: next ? 'e.g. complaint resolved…' : 'e.g. complaint under review…',
      minLength: 3,
      maxLength: 200,
      confirmLabel: next ? 'Restore account' : 'Suspend account'
    }).then((reason) => { if (reason) suspend(next, reason); });
  }

  function suspend(next: boolean, reason: string) {
    sensitive(async () => {
      const r = await api.adminSetUserActive(row.type, row._id, next, reason);
      setNotice(next ? 'Account restored.' : `Account suspended.${r.releasedVisits ? ` ${r.releasedVisits} upcoming visit(s) sent to other staff.` : ''}`);
      load();
      onChanged();
    });
  }

  return (
    <Modal onClose={onClose} labelledBy="user-title" wide>
        <div className="row">
          <h2 id="user-title" style={{ margin: 0 }}>{row.name}</h2>
          {user && (user.active ? <span className="pill mint">Active</span> : <span className="pill rx">Suspended</span>)}
        </div>
        <p className="muted" style={{ margin: 0 }}>{row.type === 'partners' ? nice(row.role) : 'Customer'} · joined {date(row.joinedAt)} · <span className="mono">{row._id}</span></p>
        {error && <div className="notice bad" role="alert">{error}</div>}
        {notice && <div className="notice good" role="status">{notice}</div>}

        <dl className="kv">
          <dt>Email</dt><dd className="mono">{contact ? contact.email || '-' : row.email || '-'}</dd>
          <dt>Phone</dt><dd className="mono">{contact ? contact.phone || '-' : row.phone || '-'}</dd>
          {user?.stats?.visits !== undefined && <><dt>Care visits</dt><dd>{user.stats.visits}</dd></>}
          {user?.stats?.orders !== undefined && <><dt>Pharmacy orders</dt><dd>{user.stats.orders}</dd></>}
          {user?.membership !== undefined && <><dt>Nabz Plus</dt><dd>{user.membership ? `${user.membership.plan} until ${date(user.membership.endsAt)}` : 'No'}</dd></>}
          {user?.profile && <><dt>Qualification</dt><dd>{user.profile.qualification || '-'}{user.profile.registrationNumber ? ` · Reg. ${user.profile.registrationNumber}` : ''}</dd></>}
          {user?.profile?.gender && <><dt>Gender</dt><dd>{nice(user.profile.gender.toLowerCase())}</dd></>}
          {user?.verification && <><dt>Checks</dt><dd><Checks v={user.verification} /></dd></>}
          {user?.stats?.completedVisits != null && <><dt>Completed visits</dt><dd>{user.stats.completedVisits}</dd></>}
          {user?.payout !== undefined && <><dt>Payout to</dt><dd>{user.payout ? user.payout.display : 'Not set'}</dd></>}
          {user?.openWithdrawal && <><dt>Open withdrawal</dt><dd>₹{user.openWithdrawal.amount.toLocaleString('en-IN')}</dd></>}
          {user?.referralCode && <><dt>Referral code</dt><dd className="mono">{user.referralCode}</dd></>}
        </dl>

        <div className="row" style={{ gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap', marginTop: 8 }}>
          {!contact && <button className="btn secondary" onClick={reveal}>Show contact details</button>}
          {user && <button className={user.active ? 'btn secondary danger' : 'btn'} onClick={toggleActive}>{user.active ? 'Suspend account' : 'Restore account'}</button>}
          <button className="btn secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>Close</button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Showing contact details and suspending need a fresh authenticator code and are recorded in the audit log.</p>
    </Modal>
  );
}
