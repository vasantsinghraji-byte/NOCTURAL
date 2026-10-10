'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, CircleDashed, Clock, FileUp, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { VerificationItem, VerificationStatus } from '@medrush/shared';
import { api } from '@/lib/api';
import { Modal } from '../../_components/Dialog';

/**
 * Website version of the Partner app's verification screen: the documents
 * this partner needs, their status, upload / re-upload, and Aadhaar through
 * DigiLocker when it's available.
 */

const STATE: Record<VerificationItem['state'], { label: string; tone: string; icon: typeof CircleCheck }> = {
  VERIFIED: { label: 'Verified', tone: 'mint', icon: CircleCheck },
  EXPIRING: { label: 'Expiring soon', tone: 'amber', icon: TriangleAlert },
  PENDING: { label: 'In review', tone: 'sky', icon: Clock },
  APPROVED: { label: 'Verified', tone: 'mint', icon: CircleCheck },
  REJECTED: { label: 'Needs a new upload', tone: 'rx', icon: TriangleAlert },
  EXPIRED: { label: 'Expired', tone: 'rx', icon: TriangleAlert },
  MISSING: { label: 'Not added', tone: '', icon: CircleDashed }
};
const DL_MESSAGES: Record<string, { tone: 'good' | 'bad'; text: string }> = {
  ok: { tone: 'good', text: 'Aadhaar received from DigiLocker.' },
  declined: { tone: 'bad', text: 'DigiLocker sharing was cancelled. Try again or upload a masked Aadhaar.' },
  expired: { tone: 'bad', text: 'That DigiLocker link expired. Start again.' },
  failed: { tone: 'bad', text: 'We couldn’t get your Aadhaar from DigiLocker. Try again or upload a masked Aadhaar.' }
};
const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function VerificationPage() {
  const [data, setData] = useState<VerificationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [uploading, setUploading] = useState<VerificationItem | null>(null);

  const load = useCallback(() => {
    api.getMyVerification().then((r) => setData(r.verification)).catch((e) => setError(e.status === 401 || e.status === 403 ? 'auth' : e.message));
  }, []);
  useEffect(() => {
    load();
    const dl = new URLSearchParams(window.location.search).get('digilocker');
    if (dl && DL_MESSAGES[dl]) setNotice(DL_MESSAGES[dl]);
  }, [load]);

  async function digilocker() {
    try {
      const r = await api.startDigilocker('web');
      window.location.assign(r.url);
    } catch (e) {
      setNotice({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not open DigiLocker' });
    }
  }

  if (error === 'auth') {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>Verification</h2>
        <p className="muted">Sign in with your partner account to add your documents.</p>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <Link href="/staff/login" className="btn">Medical staff login</Link>
          <Link href="/vendor/login" className="btn secondary">Pharmacy login</Link>
        </div>
      </div>
    );
  }

  const done = data ? data.items.filter((i) => i.state === 'VERIFIED' || i.state === 'EXPIRING').length : 0;
  return (
    <>
      <section className="hero staff-hero">
        <Link href="/partner/account" className="link-on"><ArrowLeft size={16} aria-hidden="true" /> My account</Link>
        <h1 style={{ fontSize: 34, margin: '12px 0 4px' }}>Your documents</h1>
        <p style={{ margin: 0 }}>We check every partner before they work with patients. Most checks take a working day.</p>
        {data && (
          <div className="verify-progress" aria-label={`${done} of ${data.items.length} documents verified`}>
            <div className="verify-bar"><span style={{ width: `${Math.round((done / Math.max(1, data.items.length)) * 100)}%` }} /></div>
            <span>{data.complete ? 'All required documents verified' : `${done} of ${data.items.length} verified`}{data.inReview ? `, ${data.inReview} in review` : ''}</span>
          </div>
        )}
      </section>

      {notice && <div className={`notice ${notice.tone}`} role="status" style={{ marginTop: 16 }}>{notice.text}</div>}
      {error && error !== 'auth' && <div className="notice bad" role="alert" style={{ marginTop: 16 }}>{error}</div>}

      <div className="doc-list" style={{ marginTop: 16 }}>
        {!data && !error && [0, 1, 2, 3].map((i) => <div key={i} className="card skeleton-card" aria-hidden="true" />)}
        {data?.items.map((item) => {
          const s = STATE[item.state];
          const doc = item.valid || item.latest;
          const canUpload = !item.latest || item.latest.status !== 'PENDING' || item.state === 'EXPIRING';
          return (
            <article key={item.kind} className="card doc-card">
              <div className="doc-head">
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{item.label}{item.optional && <span className="muted" style={{ fontWeight: 500 }}> (optional)</span>}</h3>
                  {item.hint && <p className="muted" style={{ margin: '4px 0 0' }}>{item.hint}</p>}
                </div>
                <span className={`pill ${s.tone}`}><s.icon size={13} aria-hidden="true" /> {s.label}</span>
              </div>
              {doc && (
                <dl className="kv compact">
                  {doc.source === 'DIGILOCKER' && <><dt>From</dt><dd>DigiLocker{doc.digilocker ? `, ${doc.digilocker.name}` : ''}</dd></>}
                  {doc.number && <><dt>{item.kind === 'AADHAAR' ? 'Aadhaar' : 'Number'}</dt><dd className="mono">{item.kind === 'AADHAAR' ? `XXXX XXXX ${doc.number}` : doc.number}</dd></>}
                  {doc.expiresAt && <><dt>Valid until</dt><dd>{fmt(doc.expiresAt)}</dd></>}
                  <dt>Added</dt><dd>{fmt(doc.uploadedAt)}</dd>
                </dl>
              )}
              {item.latest?.status === 'REJECTED' && item.latest.note && <div className="notice bad">Reason: {item.latest.note}</div>}
              {item.state === 'EXPIRING' && item.latest?.status === 'PENDING' && <p className="muted" style={{ margin: 0 }}>Your renewal is in review.</p>}
              {canUpload && (
                <div className="row" style={{ gap: 8, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                  {item.digilocker && data.digilocker.available && (
                    <button className="btn" onClick={digilocker}><ShieldCheck size={16} aria-hidden="true" /> Share from DigiLocker</button>
                  )}
                  <button className={item.digilocker && data.digilocker.available ? 'btn secondary' : 'btn'} onClick={() => setUploading(item)}>
                    <FileUp size={16} aria-hidden="true" /> {item.state === 'MISSING' ? (item.kind === 'AADHAAR' ? 'Upload masked Aadhaar' : 'Upload') : item.state === 'EXPIRING' ? 'Upload renewal' : 'Upload again'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
        Your documents are stored privately and only Nabz’s verification team can open them. Every view is recorded.
        We never store your full Aadhaar number.
      </p>

      {uploading && <UploadDialog item={uploading} onClose={() => setUploading(null)} onDone={() => { setUploading(null); setNotice({ tone: 'good', text: 'Uploaded. We’ll review it within a working day.' }); load(); }} />}
    </>
  );
}

function UploadDialog({ item, onClose, onDone }: { item: VerificationItem; onClose: () => void; onDone: () => void }) {
  const [number, setNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAadhaar = item.kind === 'AADHAAR';
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Choose a photo or PDF of the document.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('The file is over 10 MB. Take a smaller photo or compress the PDF.'); return; }
    if (isAadhaar && !/^\d{4}$/.test(number)) { setError('Enter only the last 4 digits of your Aadhaar.'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.uploadPartnerDocument({ kind: item.kind, number: number.trim() || undefined, expiresAt: expiresAt || undefined, file, filename: file.name });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="upload-title" as="form" onSubmit={submit}>
      <h2 id="upload-title" style={{ margin: 0 }}>{item.label}</h2>
      {isAadhaar ? (
        <div className="notice">
          Cover the first 8 digits before you upload, so only the last 4 are visible. The Aadhaar app’s “masked Aadhaar” download does this for you.
        </div>
      ) : item.hint && <p className="muted" style={{ margin: 0 }}>{item.hint}</p>}
      <label htmlFor="doc-file">Photo or PDF (up to 10 MB)</label>
      <input id="doc-file" name="partnerDocument" ref={fileRef} className="input" type="file" accept="image/jpeg,image/png,application/pdf" required />
      {item.numberLabel && (
        <>
          <label htmlFor="doc-number">{item.numberLabel}{item.optional ? ' (optional)' : ''}</label>
          <input id="doc-number" name="number" className="input mono" autoComplete="off" spellCheck={false}
            inputMode={isAadhaar ? 'numeric' : undefined} maxLength={isAadhaar ? 4 : 40}
            placeholder={isAadhaar ? '4 digits…' : ''} value={number}
            onChange={(e) => setNumber(isAadhaar ? e.target.value.replace(/\D/g, '') : e.target.value.toUpperCase())} />
        </>
      )}
      {item.hasExpiry && (
        <>
          <label htmlFor="doc-expiry">Valid until</label>
          <input id="doc-expiry" name="expiresAt" className="input" type="date" min={tomorrow} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
        </>
      )}
      {error && <div className="field-error" role="alert">{error}</div>}
      <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Uploading…' : 'Upload document'}</button>
      </div>
    </Modal>
  );
}
