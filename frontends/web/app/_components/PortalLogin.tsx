'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { LoginPortal } from '@medrush/shared';
import { api } from '@/lib/api';
import { Bike, FlaskConical, Stethoscope, Store, UserRound, Wrench, type LucideIcon } from 'lucide-react';
import { IconTile } from './icons';
import AdminMfa from './AdminMfa';

const PORTALS: Record<LoginPortal, { icon: LucideIcon; fg: string; title: string; tagline: string; tone: string; next: string }> = {
  staff: { icon: Stethoscope, fg: '#8a5a9e', title: 'Medical staff login', tagline: 'Nurses, physiotherapists & home-care staff', tone: 'var(--violet-soft)', next: '/staff' },
  pharmacy: { icon: Store, fg: '#2f7d5b', title: 'Pharmacy partner login', tagline: 'Orders, stock and payouts for your store', tone: 'var(--brand-soft)', next: '/vendor' },
  lab: { icon: FlaskConical, fg: '#b7791f', title: 'Path lab partner login', tagline: 'Sample pickups, reports and lab orders', tone: 'var(--sky-soft)', next: '/lab' },
  rider: { icon: Bike, fg: '#b7791f', title: 'Delivery partner login', tagline: 'Pickups and drops near you', tone: 'var(--amber-soft)', next: '/' },
  admin: { icon: Wrench, fg: '#d9485f', title: 'Admin login', tagline: 'Partners, zones and catalog', tone: 'var(--rose-soft)', next: '/admin' }
};

const SWITCH: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/login', label: 'Customer', icon: UserRound },
  { href: '/staff/login', label: 'Medical staff', icon: Stethoscope },
  { href: '/vendor/login', label: 'Pharmacy', icon: Store },
  { href: '/lab/login', label: 'Path lab', icon: FlaskConical }
];

/** One login screen per partner type; the server rejects accounts of other types. */
export default function PortalLogin({ portal }: { portal: LoginPortal }) {
  const cfg = PORTALS[portal];
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<{ mfaToken: string; enrolled: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.staffLogin(email.trim(), password, portal);
      if (res.mfaRequired) {
        // Admin accounts: second step before any session exists.
        setPassword('');
        setChallenge({ mfaToken: res.mfaToken, enrolled: res.enrolled });
        return;
      }
      router.replace(cfg.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <div className="form">
        <AdminMfa
          mfaToken={challenge.mfaToken}
          enrolled={challenge.enrolled}
          onDone={() => router.replace(cfg.next)}
          onRestart={() => setChallenge(null)}
        />
      </div>
    );
  }

  return (
    <div className="form">
      <form className="card auth-card" onSubmit={submit}>
        <div style={{ marginBottom: 12 }}><IconTile icon={cfg.icon} bg={cfg.tone} color={cfg.fg} size={56} /></div>
        <h2 style={{ margin: '0 0 4px' }}>{cfg.title}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{cfg.tagline}</p>
        <label htmlFor={`${portal}-email`}>Email</label>
        <input id={`${portal}-email`} className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label htmlFor={`${portal}-password`}>Password</label>
          <Link href="/forgot-password" style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 13 }}>Forgot password?</Link>
        </div>
        <input id={`${portal}-password`} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="notice bad" style={{ marginTop: 12 }}>{error}</div>}
        <button className="btn block" type="submit" disabled={busy} style={{ marginTop: 18 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
          {portal === 'admin'
            ? 'Admin sign-in needs a code from your authenticator app after your password.'
            : 'Partner accounts are created by Nabz after verification.'}
        </p>
      </form>
      <div className="portal-switch">
        {SWITCH.map((s) => <Link key={s.href} href={s.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><s.icon size={14} />{s.label}</Link>)}
      </div>
    </div>
  );
}
