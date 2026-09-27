'use client';

import { useCallback, useEffect, useState } from 'react';
import RevenuePanel from './RevenuePanel';
import ApplicationsPanel from './ApplicationsPanel';
import WithdrawalsPanel from './WithdrawalsPanel';
import UsersPanel from './UsersPanel';
import VerificationPanel from './VerificationPanel';
import PaymentsPanel from './PaymentsPanel';
import LogsPanel from './LogsPanel';
import CampaignsPanel from './CampaignsPanel';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ApiError, type AuthUser, type Medicine, type PharmacyVendor } from '@medrush/shared';
import { StepUpDialog } from '../_components/AdminMfa';

type Tab = 'users' | 'verification' | 'payments' | 'logs' | 'campaigns' | 'partners' | 'withdrawals' | 'vendors' | 'medicines';
// Platform-admin tabs first: the day-to-day operations.
const TABS: Array<{ key: Tab; label: string; platformOnly?: boolean }> = [
  { key: 'users', label: 'Users', platformOnly: true },
  { key: 'verification', label: 'Verification', platformOnly: true },
  { key: 'partners', label: 'Partner applications', platformOnly: true },
  { key: 'payments', label: 'Payments', platformOnly: true },
  { key: 'withdrawals', label: 'Withdrawals', platformOnly: true },
  { key: 'campaigns', label: 'Campaigns', platformOnly: true },
  { key: 'logs', label: 'Live logs', platformOnly: true },
  { key: 'vendors', label: 'Vendors' },
  { key: 'medicines', label: 'Medicines' }
];

const VENDOR_ACTIONS: Record<string, string[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['SUSPENDED'],
  SUSPENDED: ['APPROVED'],
  REJECTED: ['APPROVED']
};

export default function AdminConsole() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>('vendors');
  const [vendors, setVendors] = useState<PharmacyVendor[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Sensitive actions need a fresh authenticator code: park the action, ask, retry.
  const [pending, setPending] = useState<(() => Promise<void>) | null>(null);

  const isAdmin = user && (user.role === 'admin' || user.role === 'platform_admin');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [v, m] = await Promise.all([api.adminListVendors({ limit: 100 }), api.adminListMedicines({ limit: 100 })]);
      setVendors(v.vendors);
      setMedicines(m.medicines);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    api.staffMe()
      .then((res) => {
        setUser(res.user);
        // The open tab lives in the URL (?tab=payments) so it survives refresh and can be linked.
        const wanted = new URLSearchParams(window.location.search).get('tab') as Tab | null;
        const allowed = TABS.filter((t) => !t.platformOnly || res.user.role === 'platform_admin').map((t) => t.key);
        if (wanted && allowed.includes(wanted)) setTab(wanted);
        else if (res.user.role === 'platform_admin') setTab('users');
        if (res.user.role === 'admin' || res.user.role === 'platform_admin') load();
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, [load]);

  async function sensitive(action: () => Promise<void>) {
    try {
      await action();
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { stepUpRequired?: boolean } | undefined) : undefined;
      if (details?.stepUpRequired) { setPending(() => action); return; }
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  function setVendorStatus(id: string, status: string) {
    return sensitive(async () => { await api.adminSetVendorStatus(id, status); await load(); });
  }

  if (checking) return <p className="muted" style={{ marginTop: 20 }}>Checking session…</p>;

  if (!isAdmin) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Admin console</h2>
        <p className="muted">{user ? `Logged in as ${user.role}.` : 'Please log in as an admin.'}</p>
        <Link href="/admin/login" className="btn">Admin login</Link>
      </div>
    );
  }

  return (
    <>
      <div className="admin-head">
        <h1 className="section-title" style={{ margin: 0 }}>Admin panel</h1>
        <span className="muted">Signed in as {user?.name}</span>
      </div>
      <nav className="admin-tabs" role="tablist" aria-label="Admin sections">
        {TABS.filter((t) => !t.platformOnly || user?.role === 'platform_admin').map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''} onClick={(e) => {
            setTab(t.key);
            e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center' });
            const url = new URL(window.location.href);
            url.searchParams.set('tab', t.key);
            window.history.replaceState(null, '', url);
          }}>{t.label}</button>
        ))}
      </nav>
      {user?.role === 'platform_admin' && tab === 'payments' && <RevenuePanel />}
      {error && <div className="notice">{error}</div>}
      <StepUpDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirmed={() => { const action = pending; setPending(null); if (action) sensitive(action); }}
      />

      {tab === 'vendors' && (
        <div className="grid cards" style={{ marginTop: 12 }}>
          {vendors.length === 0 && <p className="muted">No vendors. Seed with <code>npm run db:seed:pharmacy</code>.</p>}
          {vendors.map((v) => (
            <div key={v._id} className="card">
              <div className="row"><h3>{v.name}</h3><span className="pill">{v.status}</span></div>
              <span className="muted">{v.address?.city || ''} · Rated {v.rating?.average ?? 0}</span>
              <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {(VENDOR_ACTIONS[v.status || 'PENDING'] || []).map((s) => (
                  <button key={s} className={s === 'APPROVED' ? 'btn' : 'btn secondary'} onClick={() => setVendorStatus(v._id, s)}>{s}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'partners' && <ApplicationsPanel sensitive={sensitive} />}
      {tab === 'withdrawals' && <WithdrawalsPanel sensitive={sensitive} />}
      {tab === 'users' && <UsersPanel sensitive={sensitive} />}
      {tab === 'verification' && <VerificationPanel sensitive={sensitive} />}
      {tab === 'payments' && <PaymentsPanel />}
      {tab === 'logs' && <LogsPanel />}
      {tab === 'campaigns' && <CampaignsPanel sensitive={sensitive} />}

      {tab === 'medicines' && (
        <>
          <AddMedicine onAdded={load} onError={setError} />
          <div className="grid cards" style={{ marginTop: 12 }}>
            {medicines.map((m) => (
              <div key={m._id} className="card">
                <div className="row">
                  <h3>{m.name}</h3>
                  {m.requiresPrescription ? <span className="pill rx">Rx</span> : <span className="pill">OTC</span>}
                </div>
                <span className="muted">{m.genericName || m.category} · {m.packSize || m.form} · MRP ₹{m.referenceMrp ?? '-'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function AddMedicine({ onAdded, onError }: { onAdded: () => void; onError: (m: string) => void }) {
  const [f, setF] = useState({ name: '', genericName: '', packSize: '', referenceMrp: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.adminCreateMedicine({
        name: f.name.trim(),
        genericName: f.genericName || undefined,
        packSize: f.packSize || undefined,
        referenceMrp: f.referenceMrp ? Number(f.referenceMrp) : undefined
      });
      setF({ name: '', genericName: '', packSize: '', referenceMrp: '' });
      onAdded();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not add medicine');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={add} style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Add medicine to master catalog</h3>
      <div className="grid" style={{ gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: 10 }}>
        <input className="input" placeholder="Name*" value={f.name} onChange={set('name')} required />
        <input className="input" placeholder="Generic / salt" value={f.genericName} onChange={set('genericName')} />
        <input className="input" placeholder="Pack size" value={f.packSize} onChange={set('packSize')} />
        <input className="input" placeholder="MRP" inputMode="numeric" value={f.referenceMrp} onChange={set('referenceMrp')} />
      </div>
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 10 }}>{busy ? 'Adding…' : 'Add medicine'}</button>
    </form>
  );
}
