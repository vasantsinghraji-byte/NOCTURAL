'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCheck, PackagePlus, Plus, Search } from 'lucide-react';
import type { InventoryBatch, Medicine, StockFilter, StoreStockItem } from '@medrush/shared';
import { api } from '@/lib/api';
import { inr, problem } from '@/lib/care';
import { Modal, confirmDialog } from '../../_components/Dialog';
import VendorShell from '../VendorShell';
import { StockTools } from '../StockTools';

const FILTERS: Array<{ value: StockFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Running low' },
  { value: 'out', label: 'Out of stock' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'hidden', label: 'Hidden' }
];
const PAGE = 50;
const monthYear = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '');
const num = (t: string) => (t.trim() === '' ? NaN : Number(t));

/** "MM/YYYY" (as printed on packs) → the last day of that month, or null. */
function parseExpiry(text: string): string | null {
  const m = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

type ReceiveStart = { medicine?: Pick<Medicine, '_id' | 'name'>; mrp?: number; sellingPrice?: number };

/** Website version of the app's Stock tab, plus CSV upload and the H1 register. */
export default function VendorStockPage() {
  return <VendorShell>{() => <Suspense fallback={<div className="mk-skel" />}><Stock /></Suspense>}</VendorShell>;
}

function Stock() {
  const params = useSearchParams();
  const initial = params.get('filter') as StockFilter | null;
  const [filter, setFilter] = useState<StockFilter>(initial && FILTERS.some((f) => f.value === initial) ? initial : 'all');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<StoreStockItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<StoreStockItem | null>(null);
  const [receiving, setReceiving] = useState<ReceiveStart | null>(params.get('receive') ? {} : null);
  const [adding, setAdding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (nextPage: number, query: string, f: StockFilter) => {
    try {
      const r = await api.vendorListInventory({ q: query.trim() || undefined, filter: f, page: nextPage, limit: PAGE });
      setItems((prev) => (nextPage === 1 ? r.items : [...(prev || []), ...r.items]));
      setTotal(r.pagination.total);
      setPage(nextPage);
      setError('');
    } catch (e) { setError(problem(e).message); }
  }, []);
  useEffect(() => { load(1, q, filter); }, [filter, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearch = (text: string) => {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(1, text, filter), 350);
  };
  const reload = (msg?: string) => { if (msg) setNotice(msg); load(1, q, filter); };

  async function confirmCounts() {
    if (!(await confirmDialog({ title: 'Confirm stock counts?', message: 'Tell Nabz your shelf matches the counts here. Stores with fresh counts rank higher.', confirmLabel: 'Counts are right' }))) return;
    try { const r = await api.vendorConfirmInventory(); setNotice(`Confirmed ${r.confirmed} product(s).`); } catch (e) { setError(problem(e).message); }
  }

  return (
    <div style={{ display: 'grid', gap: 14, marginTop: 8 }}>
      <div className="mk-toolbar" style={{ margin: 0 }}>
        <h1 className="mk-h2" style={{ margin: 0 }}>Stock</h1>
        <div className="mk-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="mk-btn small" onClick={() => setReceiving({})}><PackagePlus size={16} aria-hidden="true" /> Receive stock</button>
          <button type="button" className="mk-btn small ghost" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Add product</button>
          <button type="button" className="mk-btn small soft" onClick={confirmCounts}><CheckCheck size={16} aria-hidden="true" /> Confirm counts</button>
        </div>
      </div>
      <label className="mk-row mk-card" style={{ padding: '4px 14px', gap: 10 }}>
        <Search size={18} aria-hidden="true" />
        <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Search your stock</span>
        <input className="mk-input" style={{ border: 0, padding: 0 }} value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search name, salt or maker…" autoComplete="off" spellCheck={false} />
      </label>
      <div className="mk-chips" role="group" aria-label="Filter stock">
        {FILTERS.map((f) => <button key={f.value} type="button" className="mk-chip" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>)}
      </div>
      {error && <p className="mk-error" role="alert">{error}</p>}
      {notice && <p className="mk-note green" role="status" aria-live="polite">{notice}</p>}

      {!items ? <div className="mk-skel" /> : items.length === 0 ? (
        <div className="mk-empty">
          <b>{filter === 'all' && !q ? 'No products yet' : 'Nothing here'}</b>
          <span>{filter === 'all' && !q ? 'Receive stock or add a product to start selling on Nabz.' : 'Try another search or filter.'}</span>
        </div>
      ) : (
        <div className="mk-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="mk-table">
            <caption className="mk-meta" style={{ textAlign: 'left', padding: '12px 14px 0' }}>{total} product{total === 1 ? '' : 's'}. Click a product to edit it.</caption>
            <thead><tr><th scope="col">Product</th><th scope="col" style={{ textAlign: 'right' }}>Your price</th><th scope="col" style={{ textAlign: 'right' }}>MRP</th><th scope="col" style={{ textAlign: 'right' }}>In stock</th><th scope="col">Expiry</th><th scope="col"><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Edit</span></th></tr></thead>
            <tbody>
              {items.map((it) => {
                const out = it.isAvailable && it.stockQty <= 0;
                const b = it.batchSummary;
                return (
                  <tr key={it._id}>
                    <td>
                      <b>{it.medicine.name}</b>
                      <div className="mk-meta">{[it.medicine.manufacturer, it.medicine.packSize || it.medicine.strength].filter(Boolean).join(' · ')}</div>
                      <div className="mk-badges" style={{ marginTop: 4 }}>
                        {!it.isAvailable && <span className="mk-badge">Hidden</span>}
                        {out && <span className="mk-badge red">Out of stock</span>}
                        {it.low && <span className="mk-badge" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>Running low</span>}
                        {b && b.pulledQty > 0 && <span className="mk-badge red">{b.pulledQty} off sale</span>}
                        {b && b.expiringQty > 0 && <span className="mk-badge" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>{b.expiringQty} expiring</span>}
                      </div>
                    </td>
                    <td className="num">{inr(it.sellingPrice)}</td>
                    <td className="num">{inr(it.mrp)}</td>
                    <td className="num" style={{ fontWeight: 800, fontSize: 17, color: out ? 'var(--night)' : undefined }}>{it.stockQty}</td>
                    <td>{b?.nextExpiry ? `${monthYear(b.nextExpiry)} · ${b.count} batch${b.count === 1 ? '' : 'es'}` : monthYear(it.expiryDate) || '—'}</td>
                    <td><button type="button" className="mk-btn small ghost" onClick={() => setEditing(it)} aria-label={`Edit ${it.medicine.name}`}>Edit</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {items && items.length < total && <button type="button" className="mk-btn ghost" onClick={() => load(page + 1, q, filter)}>Show more</button>}

      <StockTools />

      {editing && <EditModal item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload('Saved.'); }}
        onReceive={() => { const it = editing; setEditing(null); setReceiving({ medicine: it.medicine, mrp: it.mrp, sellingPrice: it.sellingPrice }); }} />}
      {receiving && <ReceiveModal start={receiving} onClose={() => setReceiving(null)} onSaved={(msg) => { setReceiving(null); reload(msg); }} />}
      {adding && <AddModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload('Product added.'); }} />}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint, text }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; text?: boolean }) {
  return (
    <label className="mk-field" style={{ flex: 1, minWidth: 140 }}>
      <span className="mk-label">{label}</span>
      <input className="mk-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={text ? 'text' : 'decimal'} autoComplete="off" spellCheck={false} />
      {hint && <span className="mk-help">{hint}</span>}
    </label>
  );
}

function EditModal({ item, onClose, onSaved, onReceive }: { item: StoreStockItem; onClose: () => void; onSaved: () => void; onReceive: () => void }) {
  const batched = Boolean(item.batchSummary);
  const [price, setPrice] = useState(String(item.sellingPrice));
  const [mrp, setMrp] = useState(String(item.mrp));
  const [count, setCount] = useState(String(item.stockQty));
  const [alertAt, setAlertAt] = useState(String(item.lowStockThreshold ?? 5));
  const [visible, setVisible] = useState(item.isAvailable);
  const [batches, setBatches] = useState<InventoryBatch[] | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!batched) return;
    api.vendorListBatches(item.medicine._id).then((r) => { setBatches(r.batches); setCounts(Object.fromEntries(r.batches.map((b) => [b._id, String(b.qty)]))); }).catch(() => setBatches([]));
  }, [batched, item.medicine._id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const sp = num(price); const m = num(mrp); const c = num(count); const a = num(alertAt);
    if (!(m > 0)) return setErr('Enter the MRP printed on the pack');
    if (!(sp >= 0) || sp > m) return setErr('Your price can’t be more than the MRP');
    if (!batched && !(Number.isInteger(c) && c >= 0)) return setErr('Units must be a whole number');
    if (!(Number.isInteger(a) && a >= 0)) return setErr('Low-stock alert must be a whole number');
    setBusy(true); setErr('');
    try {
      await api.vendorUpsertInventory({ medicineId: item.medicine._id, mrp: m, sellingPrice: sp, isAvailable: visible, lowStockThreshold: a, ...(batched || c === item.stockQty ? {} : { stockQty: c }) });
      for (const b of batches || []) {
        const n = num(counts[b._id] ?? '');
        if (Number.isInteger(n) && n >= 0 && n !== b.qty) await api.vendorSetBatchCount(b._id, n);
      }
      onSaved();
    } catch (e2) { setErr(problem(e2).message); } finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose} labelledBy="edit-stock" as="form" onSubmit={save}>
      <div style={{ display: 'grid', gap: 12 }}>
        <h2 id="edit-stock" style={{ margin: 0 }}>{item.medicine.name}</h2>
        <div className="mk-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Field label="Your price (₹)" value={price} onChange={setPrice} />
          <Field label="MRP (₹)" value={mrp} onChange={setMrp} />
        </div>
        {!batched ? (
          <div className="mk-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Field label="Units on shelf" value={count} onChange={setCount} />
            <Field label="Alert me below" value={alertAt} onChange={setAlertAt} />
          </div>
        ) : (
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            <legend className="mk-label" style={{ marginBottom: 6 }}>Counted by batch</legend>
            {!batches ? <span className="mk-meta">Loading batches…</span> : batches.map((b) => (
              <label key={b._id} className="mk-row" style={{ gap: 10 }}>
                <span className="grow"><b>{b.batchNumber}</b> <span className="mk-meta">exp {monthYear(b.expiryDate)}{b.status !== 'ACTIVE' ? ` · ${b.status === 'RECALLED' ? 'Recalled' : 'Off sale (near expiry)'}` : ''}</span></span>
                <input className="mk-input" style={{ width: 100, textAlign: 'center' }} inputMode="numeric" value={counts[b._id] ?? ''} onChange={(e) => setCounts((p) => ({ ...p, [b._id]: e.target.value }))} aria-label={`Units in batch ${b.batchNumber}`} />
              </label>
            ))}
            <Field label="Alert me below" value={alertAt} onChange={setAlertAt} />
          </fieldset>
        )}
        <label className="mk-row" style={{ gap: 10 }}>
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} style={{ width: 20, height: 20 }} />
          <span><b>Show to customers</b><br /><span className="mk-meta">Untick to stop selling it on Nabz without losing its count.</span></span>
        </label>
        {err && <p className="mk-error" role="alert">{err}</p>}
        <div className="mk-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button type="submit" className="mk-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="mk-btn ghost" onClick={onReceive}>Receive more of this</button>
          <button type="button" className="mk-btn soft" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function ProductPicker({ value, onPick }: { value?: Pick<Medicine, '_id' | 'name'>; onPick: (m: Medicine | undefined) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Medicine[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (value) {
    return (
      <div className="mk-note neutral" style={{ alignItems: 'center' }}>
        <b className="grow" style={{ flex: 1 }}>{value.name}</b>
        <button type="button" className="linkish" onClick={() => onPick(undefined)}>Change</button>
      </div>
    );
  }
  const search = (text: string) => {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      api.searchMedicines({ q: text.trim(), limit: 8 }).then((r) => setResults(r.results as Medicine[])).catch(() => setResults([]));
    }, 300);
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label className="mk-field">
        <span className="mk-label">Product</span>
        <input className="mk-input" value={q} onChange={(e) => search(e.target.value)} placeholder="Type the medicine name…" autoComplete="off" spellCheck={false} autoFocus />
      </label>
      {results.map((m) => (
        <button key={m._id} type="button" className="choice" onClick={() => onPick(m)}>
          <b>{m.name}</b>
          <div className="mk-meta">{[m.manufacturer, m.packSize || m.strength].filter(Boolean).join(' · ')}</div>
        </button>
      ))}
      {q.trim().length >= 2 && results.length === 0 && <span className="mk-help">No match yet. Try fewer letters.</span>}
    </div>
  );
}

function ReceiveModal({ start, onClose, onSaved }: { start: ReceiveStart; onClose: () => void; onSaved: (msg: string) => void }) {
  const [medicine, setMedicine] = useState(start.medicine);
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [qty, setQty] = useState('');
  const [mrp, setMrp] = useState(start.mrp ? String(start.mrp) : '');
  const [price, setPrice] = useState(start.sellingPrice ? String(start.sellingPrice) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!medicine) return setErr('Pick the product first');
    if (!batch.trim()) return setErr('Enter the batch number printed on the pack');
    const exp = parseExpiry(expiry);
    if (!exp) return setErr('Enter the expiry as month/year, like 08/2027');
    const n = num(qty);
    if (!(Number.isInteger(n) && n > 0)) return setErr('Enter how many units you received');
    setBusy(true); setErr('');
    try {
      await api.vendorReceiveBatch({ medicineId: medicine._id, batchNumber: batch.trim(), expiryDate: exp, qty: n, ...(num(mrp) > 0 ? { mrp: num(mrp) } : {}), ...(num(price) >= 0 ? { sellingPrice: num(price) } : {}) });
      onSaved(`${n} unit${n === 1 ? '' : 's'} of ${medicine.name} added. Oldest expiry is sold first.`);
    } catch (e2) { setErr(problem(e2).message); } finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose} labelledBy="receive-stock" as="form" onSubmit={save}>
      <div style={{ display: 'grid', gap: 12 }}>
        <h2 id="receive-stock" style={{ margin: 0 }}>Receive stock</h2>
        <ProductPicker value={medicine} onPick={setMedicine} />
        <div className="mk-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Field label="Batch no." value={batch} onChange={setBatch} placeholder="B12345" text />
          <Field label="Expiry (MM/YYYY)" value={expiry} onChange={setExpiry} placeholder="08/2027" text />
        </div>
        <div className="mk-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Field label="Units received" value={qty} onChange={setQty} placeholder="20" />
          <Field label="MRP on pack (₹)" value={mrp} onChange={setMrp} />
        </div>
        <Field label="Your price (₹)" value={price} onChange={setPrice} hint="Needed only for a product you don’t sell yet." />
        {err && <p className="mk-error" role="alert">{err}</p>}
        <div className="mk-row" style={{ gap: 8 }}>
          <button type="submit" className="mk-btn" disabled={busy}>{busy ? 'Adding…' : 'Add to stock'}</button>
          <button type="button" className="mk-btn soft" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [medicine, setMedicine] = useState<Medicine | undefined>();
  const [mrp, setMrp] = useState('');
  const [price, setPrice] = useState('');
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = (m: Medicine | undefined) => { setMedicine(m); if (m?.referenceMrp && !mrp) setMrp(String(m.referenceMrp)); };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!medicine) return setErr('Pick the product first');
    const m = num(mrp); const sp = num(price); const c = count.trim() ? num(count) : 0;
    if (!(m > 0)) return setErr('Enter the MRP printed on the pack');
    if (!(sp >= 0) || sp > m) return setErr('Your price can’t be more than the MRP');
    if (!(Number.isInteger(c) && c >= 0)) return setErr('Units must be a whole number');
    setBusy(true); setErr('');
    try { await api.vendorUpsertInventory({ medicineId: medicine._id, mrp: m, sellingPrice: sp, stockQty: c, isAvailable: true }); onSaved(); } catch (e2) { setErr(problem(e2).message); } finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose} labelledBy="add-product" as="form" onSubmit={save}>
      <div style={{ display: 'grid', gap: 12 }}>
        <h2 id="add-product" style={{ margin: 0 }}>Add a product</h2>
        <ProductPicker value={medicine} onPick={pick} />
        <div className="mk-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Field label="MRP (₹)" value={mrp} onChange={setMrp} />
          <Field label="Your price (₹)" value={price} onChange={setPrice} />
        </div>
        <Field label="Units on shelf" value={count} onChange={setCount} placeholder="0" hint="Tracking by batch and expiry? Leave 0 and use Receive stock." />
        {err && <p className="mk-error" role="alert">{err}</p>}
        <div className="mk-row" style={{ gap: 8 }}>
          <button type="submit" className="mk-btn" disabled={busy}>{busy ? 'Adding…' : 'Add product'}</button>
          <button type="button" className="mk-btn soft" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
