'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import AuthShell from '../_components/AuthShell';
import PasswordField from '../_components/PasswordField';

export default function SignupPage() {
  const { register, patient } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (patient) router.replace('/book');
  }, [patient, router]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function problem(): string | null {
    if (form.name.trim().length < 2) return 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'Enter a valid email.';
    if (!/^[6-9]\d{9}$/.test(form.phone)) return 'Enter a 10-digit Indian mobile number.';
    if (form.password.length < 8 || !/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/\d/.test(form.password)) {
      return 'Password needs 8+ characters with an uppercase letter, a lowercase letter and a number.';
    }
    if (!agree) return 'Please accept the terms to continue.';
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = problem();
    if (p) { setError(p); return; }
    setBusy(true);
    setError(null);
    try {
      await register({ ...form, name: form.name.trim(), email: form.email.trim() });
      router.replace('/book');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="It takes under a minute. You can book your first visit right after."
      sideTitle="Your care, one tap away."
    >
      <form onSubmit={submit} noValidate>
        <label htmlFor="name">Full name</label>
        <input id="name" className="input" autoComplete="name" value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Meera Sharma" />
        <label htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email')(e.target.value)} placeholder="you@example.com" />
        <label htmlFor="phone">Mobile number</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="input" style={{ width: 70, textAlign: 'center', fontWeight: 800 }}>+91</span>
          <input id="phone" className="input" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={form.phone}
            onChange={(e) => set('phone')(e.target.value.replace(/\D/g, ''))} placeholder="98765 43210" />
        </div>
        <label htmlFor="password">Password</label>
        <PasswordField id="password" value={form.password} onChange={set('password')} autoComplete="new-password" meter />
        <p className="hint">8+ characters with uppercase, lowercase and a number. A symbol makes it stronger.</p>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontWeight: 600, fontSize: 13 }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 2 }} />
          <span>I agree to the Terms and Privacy Policy, and to be contacted about my bookings.</span>
        </label>
        {error && <div className="notice bad" style={{ marginTop: 14 }}>{error}</div>}
        <button className="btn block lg" type="submit" disabled={busy} style={{ marginTop: 20 }}>
          {busy ? 'Creating your account…' : 'Create account'}
        </button>
      </form>
      <p className="switch">Already have an account? <Link href="/login" className="link">Sign in</Link></p>
      <p className="switch" style={{ marginTop: 6 }}>Nurse, pharmacy or lab? <Link href="/partners" className="link">Join as a partner</Link></p>
    </AuthShell>
  );
}
