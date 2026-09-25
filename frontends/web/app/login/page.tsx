'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import AuthShell from '../_components/AuthShell';
import PasswordField from '../_components/PasswordField';

export default function LoginPage() {
  const { login, patient } = useAuth();
  const router = useRouter();
  const [next, setNext] = useState('/book');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const n = q.get('next');
    // Only same-site paths (no open redirect to another origin).
    if (n && n.startsWith('/') && !n.startsWith('//')) setNext(n);
    if (q.get('reset') === '1') setNotice('Password updated. Sign in with your new password.');
  }, []);

  useEffect(() => {
    if (patient) router.replace(next);
  }, [patient, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to book visits, order medicines and track your care.">
      <form onSubmit={submit} noValidate>
        {notice && <div className="notice good">{notice}</div>}
        <label htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div className="row-between" style={{ marginTop: 16 }}>
          <label htmlFor="password" style={{ margin: 0 }}>Password</label>
          <Link href="/forgot-password" className="link" style={{ fontSize: 13 }}>Forgot password?</Link>
        </div>
        <div style={{ marginTop: 7 }}>
          <PasswordField id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        {error && <div className="notice bad" style={{ marginTop: 14 }}>{error}</div>}
        <button className="btn block lg" type="submit" disabled={busy || !email || !password} style={{ marginTop: 20 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="switch">New to Nabz? <Link href="/signup" className="link">Create an account</Link></p>
      <div className="divider">Partners</div>
      <p className="switch" style={{ marginTop: 0 }}>
        <Link href="/staff/login" className="link">Medical staff</Link> · <Link href="/vendor/login" className="link">Pharmacy</Link>
      </p>
    </AuthShell>
  );
}
