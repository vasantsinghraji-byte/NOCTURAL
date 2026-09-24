'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { DemandItem, InventoryImport } from '@medrush/shared';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** Upload a CSV from billing software, confirm unmatched rows, see unmet demand, export the H1 register. */
export function StockTools() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<InventoryImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demand, setDemand] = useState<DemandItem[] | null>(null);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());

  useEffect(() => {
    api.vendorDemand(14).then((r) => setDemand(r.items)).catch(() => setDemand([]));
  }, []);

  async function upload() {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('The file is over 1 MB. Split it into smaller files.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const text = await file.text();
      const res = await api.vendorImportInventory(text);
      setResult(res.import);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function resolve(line: number, choice: { medicineId?: string; skip?: boolean }) {
    if (!result) return;
    try {
      const res = await api.vendorResolveImportRow(result._id, line, choice);
      setResult(res.import);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that row');
    }
  }

  const review = result ? result.rows.filter((r) => r.status === 'NEEDS_REVIEW') : [];
  const problems = result ? result.rows.filter((r) => r.status === 'ERROR') : [];

  return (
    <section style={{ marginTop: 28 }}>
      <div className="section-title" style={{ marginBottom: 10 }}>Stock tools</div>
      <div className="grid two">
        <div className="card stack">
          <h3>Upload stock from your billing software</h3>
          <span className="muted">
            Export a CSV from Marg, GoFrugal, Busy or Excel with columns like Name, Barcode, MRP, Rate, Stock, Batch, Expiry.
            Stock is your current count. Rows we can&apos;t match for sure wait for you to confirm.
          </span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="btn" disabled={!file || uploading} onClick={upload}>{uploading ? 'Uploading…' : 'Upload'}</button>
          {error && <div className="notice bad">{error}</div>}
          {result && (
            <div className="notice good">
              {result.counts.applied} updated · {result.counts.needsReview} to confirm · {result.counts.errors} with problems
            </div>
          )}
        </div>

        <div className="card stack">
          <h3>Schedule H1 register</h3>
          <span className="muted">Every Schedule H1 medicine you supplied through Nabz: patient, doctor, batch and quantity.</span>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-start' }}>
            <label className="muted">From <input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="muted">To <input className="input" type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <a className="btn secondary" href={api.h1RegisterLink(from, `${to}T23:59:59`)}>Download CSV</a>
        </div>
      </div>

      {review.length > 0 && (
        <div className="card stack" style={{ marginTop: 14 }}>
          <h3>Confirm these products</h3>
          <span className="muted">We found close matches but won&apos;t guess with medicines. Pick the right product or skip the row.</span>
          {review.map((r) => (
            <div key={r.line} className="row" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, flexWrap: 'wrap' }}>
              <span><b>Row {r.line}:</b> {r.raw.name || r.raw.barcode} · stock {r.raw.stock}</span>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {(r.candidates || []).map((c) => (
                  <button key={c.medicine} className="btn secondary" onClick={() => resolve(r.line, { medicineId: c.medicine })}>
                    {c.name}{c.packSize ? ` (${c.packSize})` : ''}
                  </button>
                ))}
                <button className="linkish" onClick={() => resolve(r.line, { skip: true })}>Skip</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {problems.length > 0 && (
        <div className="card stack" style={{ marginTop: 14 }}>
          <h3>Rows with problems</h3>
          {problems.slice(0, 50).map((r) => (
            <span key={r.line} className="muted">Row {r.line} ({r.raw.name || r.raw.barcode || 'no name'}): {r.error}</span>
          ))}
        </div>
      )}

      <div className="card stack" style={{ marginTop: 14 }}>
        <h3>What customers near you couldn&apos;t find</h3>
        <span className="muted">Searches in the last 14 days where no nearby store had it in stock.</span>
        {demand === null && <span className="muted">Loading…</span>}
        {demand && demand.length === 0 && <span className="muted">Nothing yet. Good sign.</span>}
        {demand && demand.map((d) => (
          <div key={d.medicineId} className="row">
            <span>{d.name}{d.packSize ? ` · ${d.packSize}` : ''}</span>
            <span className="muted">{d.unmet} searches{d.youList ? ' · you list it, restock?' : ''}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
