'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { api } from '@/lib/api';
import { confirmDialog } from '../_components/Dialog';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
type Passkey = Awaited<ReturnType<typeof api.passkeys>>['credentials'][number];
const when = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

/**
 * Passkeys for this admin account: a phishing-resistant alternative to the
 * 6-digit code (Face ID / fingerprint / screen lock / security key). Adding or
 * removing one needs a fresh confirmation and alerts the main admins.
 */
export default function PasskeysDialog({ onClose, sensitive }: { onClose: () => void; sensitive: Sensitive }) {
  const [rows, setRows] = useState<Passkey[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== 'undefined' && browserSupportsWebAuthn();

  const load = useCallback(() => { api.passkeys().then((r) => setRows(r.credentials)).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  const add = () => sensitive(async () => {
    setError(null);
    const opts = await api.passkeyRegistrationOptions();
    let response;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response = await startRegistration({ optionsJSON: opts.options as any });
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Cancelled.' : 'This device could not make a passkey for this site.');
      return;
    }
    const name = navigator.userAgent.includes('Android') ? 'Android phone' : navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('Mac') ? 'Mac' : 'This computer';
    await api.passkeyRegistrationVerify(opts.challengeId, response, name);
    setNotice('Passkey added. Next time, choose "Use a passkey" after your password.');
    load();
  });

  const remove = (p: Passkey) => confirmDialog({ title: `Remove “${p.name || 'Passkey'}”?`, message: 'You can still sign in with your authenticator code.', confirmLabel: 'Remove', danger: true })
    .then((ok) => { if (ok) void sensitive(async () => { await api.removePasskey(p.credentialId); setNotice('Passkey removed.'); load(); }); });

  return (
    <div className="mfa-overlay" role="dialog" aria-modal="true" aria-labelledby="pk-title">
      <div className="card auth-card" style={{ maxWidth: 520, width: '100%' }}>
        <div className="row">
          <h3 id="pk-title" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><KeyRound size={20} /> Passkeys</h3>
          <button type="button" className="linkbtn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="muted">Sign in with your fingerprint, face or screen lock instead of typing a code. A passkey only works on the real Nabz site, so a fake login page can&apos;t steal it.</p>
        {notice && <div className="notice good" role="status">{notice}</div>}
        {error && <div className="notice bad" role="alert">{error}</div>}
        {!rows && !error && <p className="muted">Loading…</p>}
        {rows && rows.length === 0 && <p className="muted">No passkeys yet.</p>}
        {rows?.map((p) => (
          <div key={p.credentialId} className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span><strong>{p.name || 'Passkey'}</strong><br /><small className="muted">Added {when(p.createdAt)} · last used {when(p.lastUsedAt)}</small></span>
            <button type="button" className="btn secondary danger" onClick={() => remove(p)}>Remove</button>
          </div>
        ))}
        {supported
          ? <button type="button" className="btn" style={{ marginTop: 12 }} onClick={add}>Add a passkey on this device</button>
          : <p className="muted">This browser can&apos;t make passkeys.</p>}
      </div>
    </div>
  );
}
