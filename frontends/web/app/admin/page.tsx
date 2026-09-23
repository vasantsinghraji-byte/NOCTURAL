'use client';

import { useCallback, useEffect, useState } from 'react';
import RevenuePanel from './RevenuePanel';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AuthUser, Medicine, PharmacyVendor } from '@medrush/shared';

const VENDOR_ACTIONS: Record<string, string[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['SUSPENDED'],
  SUSPENDED: ['APPROVED'],
  REJECTED: ['APPROVED']
};

export default function AdminConsole() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<'vendors' | 'medicines'>('vendors');
  const [vendors, setVendors] = useState<PharmacyVendor[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [error, setError] = useState<string | null>(null);

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
        if (res.user.role === 'admin' || res.user.role === 'platform_admin') load();
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, [load]);

  async function setVendorStatus(id: string, status: string) {
    try { await api.adminSetVendorStatus(id, status); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
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
      <div className="row" style={{ marginTop: 16 }}>
        <div className="section-title" style={{ margin: 0 }}>Admin — {user?.name}</div>
        <div className="row" style={{ gap: 8 }}>
          <button className={tab === 'vendors' ? 'btn' : 'btn secondary'} onClick={() => setTab('vendors')}>Vendors</button>
          <button className={tab === 'medicines' ? 'btn' : 'btn secondary'} onClick={() => setTab('medicines')}>Medicines</button>
        </div>
      </div>
      {user?.role === 'platform_admin' && <RevenuePanel />}
      {error && <div className="notice">{error}</div>}

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
                <span className="muted">{m.genericName || m.category} · {m.packSize || m.form} · MRP ₹{m.referenceMrp ?? '—'}</span>
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
