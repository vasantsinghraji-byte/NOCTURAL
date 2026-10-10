'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, ShieldCheck } from 'lucide-react';
import type { AdminDocumentRow } from '@medrush/shared';
import { api } from '@/lib/api';
import { promptDialog } from '../_components/Dialog';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'ALL';
const nice = (t?: string | null) => (t || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Verification documents from partners, oldest first. Opening a file,
 * approving and rejecting need a fresh 2FA code and are audited. Approving a
 * document that expires needs its expiry date (prefilled from the upload).
 */
export default function DocumentsPanel({ sensitive }: { sensitive: Sensitive }) {
  const [status, setStatus] = useState<Status>('PENDING');
  const [rows, setRows] = useState<AdminDocumentRow[] | null>(null);
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.adminDocuments(status).then((r) => setRows(r.documents)).catch((e) => setError(e.message));
  }, [status]);
  useEffect(load, [load]);

  const view = (d: AdminDocumentRow) => sensitive(async () => {
    const r = await api.adminViewDocument(d._id);
    window.open(r.url, '_blank', 'noopener,noreferrer');
  });

  const approve = (d: AdminDocumentRow) => sensitive(async () => {
    const r = await api.adminReviewDocument(d._id, { decision: 'APPROVED', expiresAt: expiry[d._id] || d.expiresAt?.slice(0, 10) || undefined });
    setNotice(r.awaitingSecondApproval ? `${d.label} for ${d.user?.name}: first approval saved. A second admin must approve it.` : `${d.label} for ${d.user?.name} approved.`);
    load();
  });

  async function reject(d: AdminDocumentRow) {
    const note = await promptDialog({
      title: `Reject ${d.label.toLowerCase()}?`,
      message: `${d.user?.name} sees your reason and can upload it again.`,
      label: 'Reason',
      placeholder: 'e.g. photo is blurred, number not readable…',
      minLength: 3,
      maxLength: 300,
      confirmLabel: 'Reject document'
    });
    if (!note) return;
    await sensitive(async () => {
      await api.adminReviewDocument(d._id, { decision: 'REJECTED', note });
      setNotice(`${d.label} for ${d.user?.name} rejected.`);
      load();
    });
  }

  return (
    <section style={{ marginTop: 12 }}>
      <div className="admin-toolbar">
        <div className="segmented" role="tablist" aria-label="Document status">
          {(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'ALL'] as const).map((s) => (
            <button key={s} role="tab" aria-selected={status === s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s === 'PENDING' ? 'To review' : nice(s)}</button>
          ))}
        </div>
        <button className="btn secondary" onClick={load}>Refresh</button>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      {notice && <div className="notice good" role="status">{notice}</div>}
      {rows && rows.length === 0 && <p className="muted">{status === 'PENDING' ? 'Nothing to review. New uploads from partners appear here.' : 'No documents here.'}</p>}

      <div className="grid cards" style={{ marginTop: 10 }}>
        {!rows && !error && [0, 1, 2].map((i) => <div key={i} className="card skeleton-card" aria-hidden="true" />)}
        {rows?.map((d) => (
          <article key={d._id} className="card review-card">
            <div className="row">
              <b>{d.label}</b>
              {d.awaitingSecondApproval ? <span className="pill amber">1 of 2 approvals</span> : <span className={`pill ${d.status === 'APPROVED' ? 'mint' : d.status === 'PENDING' ? 'sky' : 'rx'}`}>{nice(d.status)}</span>}
            </div>
            <span className="muted">{d.user?.name} ({nice(d.user?.role)})</span>
            <dl className="kv compact">
              {d.source === 'DIGILOCKER' && <><dt>From</dt><dd><ShieldCheck size={13} aria-hidden="true" /> DigiLocker{d.digilocker ? `, ${d.digilocker.name}${d.digilocker.nameMatches ? '' : ' (name differs)'}` : ''}</dd></>}
              {d.number && <><dt>{d.kind === 'AADHAAR' ? 'Aadhaar' : 'Number'}</dt><dd className="mono">{d.kind === 'AADHAAR' ? `XXXX XXXX ${d.number}` : d.number}</dd></>}
              {d.expiresAt && <><dt>Valid until</dt><dd>{fmt(d.expiresAt)}</dd></>}
              <dt>Uploaded</dt><dd>{fmt(d.uploadedAt)}</dd>
              {d.note && <><dt>Note</dt><dd>{d.note}</dd></>}
            </dl>
            <div className="review-actions">
              {d.fileName && <button className="btn secondary" onClick={() => view(d)}><Eye size={16} aria-hidden="true" /> View file</button>}
              {d.status === 'PENDING' && (
                <>
                  {d.hasExpiry && (
                    <input className="input" type="date" name="expiresAt" aria-label={`Expiry date for ${d.label}`}
                      value={expiry[d._id] ?? d.expiresAt?.slice(0, 10) ?? ''} onChange={(e) => setExpiry((x) => ({ ...x, [d._id]: e.target.value }))} />
                  )}
                  <button className="btn" onClick={() => approve(d)}>Approve</button>
                  <button className="btn secondary danger" onClick={() => reject(d)}>Reject</button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Check the document against the number and expiry before approving. Opening a file and every decision need a fresh authenticator code and are recorded in the audit log.</p>
    </section>
  );
}
