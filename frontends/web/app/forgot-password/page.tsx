'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { api } from '@/lib/api';
import AuthShell from '../_components/AuthShell';

/** Works for customers and partners (staff, pharmacy, lab). */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email.'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api.forgotPassword(email.trim());
      setSent(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" sideTitle="Back in a minute.">
        <div className="check-mail">
          <div className="icon"><MailCheck size={34} /></div>
          <p className="sub" style={{ margin: '0 0 16px' }}>{sent}</p>
          <p className="hint">Didn’t get it? Check spam, or wait a minute and try again. For your safety we send at most 3 links an hour.</p>
          <Link href="/login" className="btn block lg" style={{ marginTop: 20 }}>Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot password?" subtitle="Enter the email on your account. We’ll send a link to choose a new password." sideTitle="Back in a minute.">
      <form onSubmit={submit} noValidate>
        <label htmlFor="email">Email</label>
        <input id="email" className="input" type="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <div className="notice bad" style={{ marginTop: 14 }}>{error}</div>}
        <button className="btn block lg" type="submit" disabled={busy} style={{ marginTop: 20 }}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="switch">Remembered it? <Link href="/login" className="link">Sign in</Link></p>
    </AuthShell>
  );
}
