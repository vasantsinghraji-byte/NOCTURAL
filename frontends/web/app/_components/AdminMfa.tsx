'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';

type Stage = 'setup' | 'code' | 'recovery' | 'saveCodes';

/**
 * Second step of an admin login. First time: scan a QR code with an
 * authenticator app, confirm a code, save the recovery codes. Afterwards: a
 * 6-digit code (or a one-time recovery code if the phone is lost).
 * The QR code is drawn in the browser; the secret never goes to a third party.
 */
export default function AdminMfa({ mfaToken, enrolled, onDone, onRestart }: {
  mfaToken: string;
  enrolled: boolean;
  onDone: () => void;
  onRestart: () => void;
}) {
  const [stage, setStage] = useState<Stage>(enrolled ? 'code' : 'setup');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (enrolled) return;
    api.adminMfaEnrollStart(mfaToken)
      .then(async (r) => {
        setSecret(r.secret);
        setQr(await QRCode.toDataURL(r.otpauthUri, { margin: 1, width: 220 }));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not start setup'));
  }, [enrolled, mfaToken]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); } finally { setBusy(false); }
  }

  const confirmSetup = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api.adminMfaEnrollVerify(mfaToken, code.trim());
      setCodes(r.recoveryCodes);
      setStage('saveCodes');
    });
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = stage === 'recovery'
        ? await api.adminMfaVerify(mfaToken, { recoveryCode: recovery.trim() })
        : await api.adminMfaVerify(mfaToken, { code: code.trim() });
      if (r.recoveryCodesLeft !== undefined) {
        setNote(`Recovery code used. ${r.recoveryCodesLeft} left. Generate new ones in the admin console if you're running low.`);
        setTimeout(onDone, 2500);
        return;
      }
      onDone();
    });
  };

  function downloadCodes() {
    const blob = new Blob([`Nabz admin recovery codes\nEach code works once.\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nabz-admin-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  const codeInput = (
    <input
      id="mfa-setup-code" className="input mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
      placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="6-digit code"
    />
  );

  return (
    <div className="card auth-card">
      {stage === 'setup' && (
        <form onSubmit={confirmSetup}>
          <h2 style={{ margin: '0 0 4px', display: 'flex', gap: 8, alignItems: 'center' }}><Smartphone size={22} /> Set up two-step verification</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Admin accounts need a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password).
          </p>
          <ol className="muted" style={{ paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Open the app and add an account.</li>
            <li>Scan this QR code (or type the key).</li>
            <li>Enter the 6-digit code it shows.</li>
          </ol>
          <div style={{ display: 'grid', placeItems: 'center', margin: '12px 0' }}>
            {qr ? <img src={qr} alt="QR code for your authenticator app" width={220} height={220} style={{ borderRadius: 12, background: '#fff' }} /> : <div className="muted">Loading…</div>}
          </div>
          {secret && <p className="muted" style={{ textAlign: 'center', wordBreak: 'break-all' }}>Key: <code>{secret.replace(/(.{4})/g, '$1 ').trim()}</code></p>}
          <label htmlFor="mfa-setup-code">Code from the app</label>
          {codeInput}
          {error && <div className="notice bad" style={{ marginTop: 12 }}>{error}</div>}
          <button className="btn block" type="submit" disabled={busy || code.length !== 6} style={{ marginTop: 16 }}>{busy ? 'Checking…' : 'Turn on'}</button>
        </form>
      )}

      {stage === 'saveCodes' && (
        <div>
          <h2 style={{ margin: '0 0 4px', display: 'flex', gap: 8, alignItems: 'center' }}><KeyRound size={22} /> Save your recovery codes</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            If you lose your phone, each code signs you in once. Store them somewhere safe (password manager or printed). They won’t be shown again.
          </p>
          <div className="mfa-codes">{codes.map((c) => <code key={c}>{c}</code>)}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn secondary" type="button" onClick={downloadCodes}>Download</button>
            <button className="btn secondary" type="button" onClick={() => { navigator.clipboard.writeText(codes.join('\n')).then(() => setSaved(true)).catch(() => undefined); }}>Copy</button>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I’ve saved these codes
          </label>
          <button className="btn block" type="button" disabled={!saved} onClick={onDone} style={{ marginTop: 14 }}>Continue to admin</button>
        </div>
      )}

      {(stage === 'code' || stage === 'recovery') && (
        <form onSubmit={verify}>
          <h2 style={{ margin: '0 0 4px', display: 'flex', gap: 8, alignItems: 'center' }}><ShieldCheck size={22} /> Two-step verification</h2>
          {stage === 'code' ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>Enter the 6-digit code from your authenticator app.</p>
              {codeInput}
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>Enter one of your recovery codes. Each works once.</p>
              <input className="input" autoFocus required placeholder="XXXXX-XXXXX" value={recovery} onChange={(e) => setRecovery(e.target.value)} aria-label="Recovery code" />
            </>
          )}
          {error && <div className="notice bad" style={{ marginTop: 12 }}>{error}</div>}
          {note && <div className="notice good" style={{ marginTop: 12 }}>{note}</div>}
          <button className="btn block" type="submit" disabled={busy} style={{ marginTop: 16 }}>{busy ? 'Checking…' : 'Verify'}</button>
          <p className="muted" style={{ marginTop: 14, marginBottom: 0, display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="linkish" onClick={() => { setError(null); setStage(stage === 'code' ? 'recovery' : 'code'); }}>
              {stage === 'code' ? 'Lost your phone? Use a recovery code' : 'Use the authenticator app'}
            </button>
            <button type="button" className="linkish" onClick={onRestart}>Start over</button>
          </p>
        </form>
      )}
    </div>
  );
}

/** Prompt for a fresh code before a sensitive admin action, then retry it. */
export function StepUpDialog({ open, onClose, onConfirmed }: { open: boolean; onClose: () => void; onConfirmed: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.adminMfaStepUp(code.trim());
      setCode('');
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mfa-overlay" role="dialog" aria-modal="true" aria-label="Confirm with your authenticator code">
      <form className="card auth-card" onSubmit={submit}>
        <h3 style={{ marginTop: 0, display: 'flex', gap: 8, alignItems: 'center' }}><ShieldCheck size={20} /> Confirm it’s you</h3>
        <p className="muted" style={{ marginTop: 0 }}>This action needs a fresh code from your authenticator app.</p>
        <input className="input mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required placeholder="123456"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="6-digit code" />
        {error && <div className="notice bad" style={{ marginTop: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Confirm'}</button>
        </div>
      </form>
    </div>
  );
}
