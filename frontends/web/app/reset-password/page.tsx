'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import AuthShell from '../_components/AuthShell';
import PasswordField from '../_components/PasswordField';

const PARTNER_LOGIN: Record<string, string> = {
  pharmacy_vendor: '/vendor/login',
  nurse: '/staff/login',
  physiotherapist: '/staff/login',
  medical_staff: '/staff/login',
  lab_partner: '/lab/login',
  phlebotomist: '/lab/login',
  admin: '/admin/login',
  platform_admin: '/admin/login'
};

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState<{ role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    // Drop the token from the address bar/history as soon as it's read.
    if (t) window.history.replaceState(null, '', '/reset-password');
    setToken(t);
    if (!t) { setValid(false); return; }
    api.checkPasswordReset(t).then((r) => setValid(r.valid)).catch(() => setValid(false));
  }, []);

  function problem(): string | null {
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[@$!%*?&#]/.test(password)) {
      return 'Use 8+ characters with an uppercase letter, a lowercase letter, a number and a symbol (@ $ ! % * ? & #).';
    }
    if (password !== confirm) return 'Passwords do not match.';
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = problem();
    if (p) { setError(p); return; }
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.resetPassword(token, password, confirm);
      setDone({ role: r.role });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const partnerLogin = PARTNER_LOGIN[done.role];
    return (
      <AuthShell title="Password updated" sideTitle="All set.">
        <div className="check-mail">
          <div className="icon"><CircleCheck size={34} /></div>
          <p className="sub">You’ve been signed out on every device. Sign in with your new password.</p>
          <button className="btn block lg" onClick={() => router.replace(partnerLogin || '/login?reset=1')} style={{ marginTop: 12 }}>Sign in</button>
          {partnerLogin && <p className="hint" style={{ marginTop: 12 }}>Using the Nabz Partner app? Sign in there with the new password too.</p>}
        </div>
      </AuthShell>
    );
  }

  if (valid === false) {
    return (
      <AuthShell title="Link expired" sideTitle="Let’s try again.">
        <div className="check-mail">
          <div className="icon" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><TriangleAlert size={32} /></div>
          <p className="sub">This reset link is invalid, already used or older than 30 minutes.</p>
          <Link href="/forgot-password" className="btn block lg" style={{ marginTop: 12 }}>Send a new link</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle={valid === null ? 'Checking your link…' : 'Pick something you haven’t used before.'} sideTitle="Almost there.">
      <form onSubmit={submit} noValidate>
        <label htmlFor="password">New password</label>
        <PasswordField id="password" value={password} onChange={setPassword} autoComplete="new-password" meter />
        <p className="hint">8+ characters with uppercase, lowercase, a number and a symbol (@ $ ! % * ? & #).</p>
        <label htmlFor="confirm">Confirm new password</label>
        <PasswordField id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && <div className="notice bad" style={{ marginTop: 14 }}>{error}</div>}
        <button className="btn block lg" type="submit" disabled={busy || valid !== true} style={{ marginTop: 20 }}>
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  );
}
