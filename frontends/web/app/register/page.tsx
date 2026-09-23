'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const { register, patient } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (patient) router.replace('/pharmacy');
  }, [patient, router]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ ...form, name: form.name.trim(), email: form.email.trim() });
      router.replace('/pharmacy');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2 style={{ marginTop: 0 }}>Create your account</h2>
      <label htmlFor="name">Full name</label>
      <input id="name" className="input" value={form.name} onChange={set('name')} required minLength={2} />
      <label htmlFor="email">Email</label>
      <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} required />
      <label htmlFor="phone">Phone (10-digit)</label>
      <input id="phone" className="input" inputMode="numeric" pattern="[6-9][0-9]{9}" value={form.phone} onChange={set('phone')} required />
      <label htmlFor="password">Password</label>
      <input id="password" className="input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={8} />
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Min 8 chars with an uppercase, lowercase and a number.</p>
      {error && <div className="error">{error}</div>}
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16, width: '100%' }}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
      <p className="muted" style={{ marginTop: 14 }}>
        Already have an account? <Link href="/login" style={{ color: 'var(--brand)' }}>Login</Link>
      </p>
    </form>
  );
}
