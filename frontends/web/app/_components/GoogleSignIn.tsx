'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type GsiCredential = { credential?: string };
type Gsi = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: GsiCredential) => void; ux_mode?: 'popup'; auto_select?: boolean; itp_support?: boolean; use_fedcm_for_prompt?: boolean }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};
declare global { interface Window { google?: Gsi } }

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let gsiLoading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiLoading) {
    gsiLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GSI_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gsiLoading = null; reject(new Error('Google sign-in could not load')); };
      document.head.appendChild(s);
    });
  }
  return gsiLoading;
}

/**
 * "Continue with Google" for customers (same flow as the app). Google's own
 * button gives an ID token; the server verifies it before any session exists.
 * First-time users add their mobile number to finish creating the account.
 * Renders nothing until the server says Google sign-in is set up.
 */
export default function GoogleSignIn({ onSignedIn, onFinishing }: { onSignedIn: () => void; onFinishing?: (finishing: boolean) => void }) {
  const { refresh } = useAuth();
  // Latest callbacks without re-rendering Google's button on every parent render.
  const done = useRef(onSignedIn);
  done.current = onSignedIn;
  const finishing = useRef(onFinishing);
  finishing.current = onFinishing;
  const holder = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [finish, setFinish] = useState<{ signupToken: string; name: string; email?: string } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    api.getSignInMethods().then((r) => setClientId(r.methods.google ? r.methods.googleWebClientId || null : null)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!clientId || finish) return;
    let alive = true;
    loadGsi().then(() => {
      if (!alive || !holder.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        itp_support: true,
        use_fedcm_for_prompt: true,
        callback: async ({ credential }) => {
          if (!credential) { setError('Google didn’t return a sign-in. Please try again.'); return; }
          setBusy(true); setError('');
          try {
            const res = await api.googleSignIn(credential);
            if (res.needsProfile) {
              setName(res.profile.name || '');
              setFinish({ signupToken: res.signupToken, name: res.profile.name || '', email: res.profile.email });
              finishing.current?.(true);
              return;
            }
            await refresh();
            done.current();
          } catch (e) { setError(e instanceof Error ? e.message : 'Google sign-in failed'); } finally { setBusy(false); }
        }
      });
      window.google.accounts.id.renderButton(holder.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'left', width: Math.min(holder.current.offsetWidth || 360, 400) });
    }).catch((e) => setError(e.message));
    return () => { alive = false; };
  }, [clientId, finish, refresh]);

  async function complete(e: React.FormEvent) {
    e.preventDefault();
    if (!finish) return;
    if (name.trim().length < 2) { setError('Enter your name'); return; }
    if (!/^[6-9]\d{9}$/.test(phone)) { setError('Enter your 10-digit mobile number'); return; }
    setBusy(true); setError('');
    try {
      await api.completeSignup({ signupToken: finish.signupToken, name: name.trim(), phone });
      await refresh();
      done.current();
    } catch (e2) { setError(e2 instanceof Error ? e2.message : 'Could not create your account'); } finally { setBusy(false); }
  }

  if (!clientId) return null;

  if (finish) {
    return (
      <form onSubmit={complete} noValidate style={{ display: 'grid', gap: 10 }}>
        <div className="notice good">Almost done{finish.email ? `, ${finish.email}` : ''}. Add your mobile number so your nurse can call you.</div>
        <label htmlFor="g-name">Your name</label>
        <input id="g-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <label htmlFor="g-phone">Mobile number</label>
        <input id="g-phone" className="input" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="10 digits…" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} required />
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>By continuing you agree to the <Link href="/terms" className="link">Terms and Conditions</Link>.</p>
        {error && <div className="notice bad" role="alert">{error}</div>}
        <button className="btn block lg" type="submit" disabled={busy}>{busy ? 'Creating your account…' : 'Create account'}</button>
        <button type="button" className="linkish" onClick={() => { setFinish(null); finishing.current?.(false); }}>Use email instead</button>
      </form>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div ref={holder} style={{ minHeight: 44, display: 'flex', justifyContent: 'center' }} aria-busy={busy} />
      {busy && <p className="muted" style={{ margin: 0, textAlign: 'center' }} aria-live="polite">Signing you in…</p>}
      {error && <div className="notice bad" role="alert">{error}</div>}
      <div className="divider">or use email</div>
    </div>
  );
}
