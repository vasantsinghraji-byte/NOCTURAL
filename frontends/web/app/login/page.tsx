'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login, patient } = useAuth();
  const router = useRouter();
  const [next, setNext] = useState('/pharmacy');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('next');
    if (q) setNext(q);
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
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2 style={{ marginTop: 0 }}>Login</h2>
      <label htmlFor="email">Email</label>
      <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label htmlFor="password">Password</label>
      <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <div className="error">{error}</div>}
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16, width: '100%' }}>
        {busy ? 'Signing in…' : 'Login'}
      </button>
      <p className="muted" style={{ marginTop: 14 }}>
        New here? <Link href="/register" style={{ color: 'var(--brand)' }}>Create an account</Link>
      </p>
    </form>
  );
}
