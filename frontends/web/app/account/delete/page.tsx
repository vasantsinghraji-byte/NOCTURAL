'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Delete a customer account (also linked from the app store listing). */
export default function DeleteAccount() {
  const { patient, loading, logout } = useAuth();
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (typed !== 'DELETE') return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteMyAccount(typed);
      await logout();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the account');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="card" style={{ marginTop: 20, padding: 28 }}>
        <h2 style={{ marginTop: 0 }}>Account deleted</h2>
        <p className="muted">Your personal data has been erased and you are signed out everywhere.</p>
        <button className="btn" onClick={() => router.replace('/')}>Home</button>
      </section>
    );
  }

  return (
    <section className="card" style={{ marginTop: 20, padding: 28, maxWidth: 560 }}>
      <h2 style={{ marginTop: 0 }}>Delete your Nabz account</h2>
      <p>This erases your name, phone number, email, addresses, health profile, emergency contacts and saved passkeys, and signs you out on every device.</p>
      <p className="muted">
        Past orders, visits and invoices stay as anonymous records because Indian law requires us to keep them
        (tax and pharmacy registers). You can&apos;t delete while a visit or medicine order is in progress.
      </p>
      {loading ? <p className="muted">Checking your sign-in…</p> : !patient ? (
        <Link href="/login?next=/account/delete" className="btn">Sign in to continue</Link>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="confirm">Type <b>DELETE</b> to confirm ({patient.email})</label>
          <input id="confirm" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          {error && <div className="error">{error}</div>}
          <button className="btn" type="submit" disabled={busy || typed !== 'DELETE'} style={{ marginTop: 12, background: 'var(--night)' }}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </form>
      )}
    </section>
  );
}
