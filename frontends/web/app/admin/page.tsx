'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import RevenuePanel from './RevenuePanel';
import ApplicationsPanel from './ApplicationsPanel';
import WithdrawalsPanel from './WithdrawalsPanel';
import UsersPanel from './UsersPanel';
import VerificationPanel from './VerificationPanel';
import PaymentsPanel from './PaymentsPanel';
import LogsPanel from './LogsPanel';
import CampaignsPanel from './CampaignsPanel';
import DocumentsPanel from './DocumentsPanel';
import MarketplacePanel from './MarketplacePanel';
import AdsSettingsPanel from './AdsSettingsPanel';
import PostsPanel from './PostsPanel';
import HeatmapPanel from './HeatmapPanel';
import CallbacksPanel from './CallbacksPanel';
import TeamPanel from './TeamPanel';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ApiError, type AdminSection, type AuthUser, type Medicine, type PharmacyVendor } from '@medrush/shared';
import { StepUpDialog } from '../_components/AdminMfa';

type View = AdminSection | 'team';

/**
 * Sections of the console, grouped as in the sidebar. The server decides who
 * may open which (constants/adminAccess.js); this only labels and lays them out.
 */
const SECTIONS: Array<{ key: View; label: string; group: string; hint: string; icon: string }> = [
  { key: 'tower', label: 'Control tower', group: 'Operations', hint: 'Live demand and supply map, zone surge', icon: '◎' },
  { key: 'care', label: 'Care marketplace', group: 'Operations', hint: 'Visits, plans, lab orders, refunds, catalogue', icon: '✚' },
  { key: 'support', label: 'Call-back requests', group: 'Operations', hint: 'Customers who asked Nabz to call', icon: '☎' },
  { key: 'users', label: 'Users', group: 'People', hint: 'Customers and partners, suspend or restore', icon: '◉' },
  { key: 'partners', label: 'Partner applications', group: 'Verification', hint: 'Approve or reject people who applied to join', icon: '✎' },
  { key: 'documents', label: 'Partner documents', group: 'Verification', hint: 'ID, licence and registration documents', icon: '▤' },
  { key: 'verification', label: 'Staff checks', group: 'Verification', hint: 'Nurse and physio badges: ID, police, council', icon: '✓' },
  { key: 'vendors', label: 'Pharmacies', group: 'Pharmacy', hint: 'Approve or suspend stores', icon: '⌂' },
  { key: 'medicines', label: 'Medicines', group: 'Pharmacy', hint: 'Master catalogue', icon: '℞' },
  { key: 'payments', label: 'Payments & revenue', group: 'Money', hint: 'Revenue and the payment log', icon: '₹' },
  { key: 'withdrawals', label: 'Withdrawals', group: 'Money', hint: 'Partner payout requests', icon: '⇄' },
  { key: 'campaigns', label: 'Campaigns', group: 'Growth', hint: 'Offers and announcements', icon: '✦' },
  { key: 'ads', label: 'Ads & settings', group: 'Growth', hint: 'Sponsored listings and marketplace settings', icon: '◆' },
  { key: 'posts', label: 'Partner posts', group: 'Growth', hint: 'Photos and videos partners post', icon: '▣' },
  { key: 'logs', label: 'Live logs', group: 'System', hint: 'Server logs (redacted)', icon: '≡' },
  { key: 'team', label: 'Team & access', group: 'Admin', hint: 'Who can open what', icon: '⚑' }
];

const ROLE_LABEL: Record<string, string> = { platform_admin: 'Main admin', ops_admin: 'Team member', admin: 'Admin', onboarding_reviewer: 'Onboarding reviewer' };

/** What this account can open: the server's list, plus Team for the main admin. */
function viewsFor(user: AuthUser | null): View[] {
  if (!user) return [];
  if (user.role === 'admin') return ['vendors', 'medicines']; // older hospital-level admin
  const mine: View[] = [...(user.adminAccess?.sections || [])];
  if (user.adminAccess?.full) mine.push('team');
  return SECTIONS.map((s) => s.key).filter((k) => mine.includes(k));
}

const VENDOR_ACTIONS: Record<string, string[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['SUSPENDED'],
  SUSPENDED: ['APPROVED'],
  REJECTED: ['APPROVED']
};

export default function AdminConsole() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<View | null>(null);
  const [vendors, setVendors] = useState<PharmacyVendor[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Sensitive actions need a fresh authenticator code: park the action, ask, retry.
  const [pending, setPending] = useState<(() => Promise<void>) | null>(null);

  const views = useMemo(() => viewsFor(user), [user]);

  const loadStore = useCallback(async (which: View) => {
    setError(null);
    try {
      if (which === 'vendors') setVendors((await api.adminListVendors({ limit: 100 })).vendors);
      if (which === 'medicines') setMedicines((await api.adminListMedicines({ limit: 100 })).medicines);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    api.staffMe()
      .then((res) => {
        setUser(res.user);
        const allowed = viewsFor(res.user);
        // The open section lives in the URL (?tab=payments) so it survives refresh and can be linked.
        const wanted = new URLSearchParams(window.location.search).get('tab') as View | null;
        setView(wanted && allowed.includes(wanted) ? wanted : allowed[0] || null);
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => { if (view === 'vendors' || view === 'medicines') loadStore(view); }, [view, loadStore]);

  function open(next: View) {
    setView(next);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
    window.scrollTo({ top: 0 });
  }

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
    return sensitive(async () => { await api.adminSetVendorStatus(id, status); await loadStore('vendors'); });
  }

  async function signOut() {
    await api.logout().catch(() => undefined);
    window.location.href = '/admin/login';
  }

  if (checking) return <p className="muted" style={{ marginTop: 20 }}>Checking session…</p>;

  if (!user || views.length === 0) {
    return (
      <div className="card admin-gate">
        <h2 style={{ marginTop: 0 }}>Nabz admin</h2>
        <p className="muted">
          {user ? `Signed in as ${user.name} (${ROLE_LABEL[user.role] || user.role}). This account has no admin sections yet. Ask the main admin to give you access.` : 'Sign in with your admin account.'}
        </p>
        <Link href="/admin/login" className="btn">{user ? 'Switch account' : 'Admin login'}</Link>
      </div>
    );
  }

  const current = SECTIONS.find((s) => s.key === view);
  const groups = SECTIONS.filter((s) => views.includes(s.key)).reduce<Array<{ group: string; items: typeof SECTIONS }>>((out, s) => {
    const g = out.find((x) => x.group === s.group);
    if (g) g.items.push(s); else out.push({ group: s.group, items: [s] });
    return out;
  }, []);
  const kinds = user.adminAccess?.partnerKinds;

  return (
    <div className="admin-shell">
      <aside className="admin-side" aria-label="Admin sections">
        <div className="admin-brand">
          <span className="admin-mark" aria-hidden>n</span>
          <div>
            <strong>Nabz admin</strong>
            <small>{ROLE_LABEL[user.role] || user.role}</small>
          </div>
        </div>
        <nav className="admin-nav">
          {groups.map((g) => (
            <div key={g.group} className="admin-nav-group">
              <span className="admin-nav-title">{g.group}</span>
              {g.items.map((s) => (
                <button key={s.key} className={`admin-nav-item ${view === s.key ? 'on' : ''}`} aria-current={view === s.key ? 'page' : undefined} onClick={() => open(s.key)}>
                  <span className="admin-nav-icon" aria-hidden>{s.icon}</span>{s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-me">
          <span className="admin-avatar" aria-hidden>{(user.name || '?').slice(0, 1).toUpperCase()}</span>
          <div style={{ minWidth: 0 }}>
            <strong className="admin-me-name">{user.name}</strong>
            <small className="muted">{user.email}</small>
          </div>
          <button className="linkbtn" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-crumb">{current?.group}</span>
            <h1>{current?.label}</h1>
            <p className="muted">{current?.hint}</p>
          </div>
          {kinds && kinds.length > 0 && ['partners', 'documents', 'verification'].includes(String(view)) && (
            <span className="admin-scope" title="You only see the partner types the main admin gave you">Your partners: {kinds.length} type{kinds.length === 1 ? '' : 's'}</span>
          )}
          {user.adminAccess?.full && <Link href="/onboarding" className="btn secondary">Onboarding panel</Link>}
        </header>

        {error && <div className="notice bad" role="alert">{error}</div>}
        <StepUpDialog
          open={!!pending}
          onClose={() => setPending(null)}
          onConfirmed={() => { const action = pending; setPending(null); if (action) sensitive(action); }}
        />

        <div className="admin-content">
          {view === 'payments' && <><RevenuePanel /><PaymentsPanel /></>}
          {view === 'vendors' && (
            <div className="grid cards">
              {vendors.length === 0 && <p className="muted">No pharmacies yet.</p>}
              {vendors.map((v) => (
                <div key={v._id} className="card admin-card">
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
          {view === 'tower' && <HeatmapPanel />}
          {view === 'care' && <MarketplacePanel sensitive={sensitive} />}
          {view === 'support' && <CallbacksPanel sensitive={sensitive} />}
          {view === 'ads' && <AdsSettingsPanel sensitive={sensitive} />}
          {view === 'posts' && <PostsPanel />}
          {view === 'partners' && <ApplicationsPanel sensitive={sensitive} />}
          {view === 'withdrawals' && <WithdrawalsPanel sensitive={sensitive} />}
          {view === 'users' && <UsersPanel sensitive={sensitive} />}
          {view === 'documents' && <DocumentsPanel sensitive={sensitive} />}
          {view === 'verification' && <VerificationPanel sensitive={sensitive} />}
          {view === 'logs' && <LogsPanel />}
          {view === 'campaigns' && <CampaignsPanel sensitive={sensitive} />}
          {view === 'team' && <TeamPanel sensitive={sensitive} />}
          {view === 'medicines' && (
            <>
              <AddMedicine onAdded={() => loadStore('medicines')} onError={setError} />
              <div className="grid cards" style={{ marginTop: 12 }}>
                {medicines.map((m) => (
                  <div key={m._id} className="card admin-card">
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
        </div>
      </main>
    </div>
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
