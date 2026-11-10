'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Medicine, MedicineScheduleType } from '@medrush/shared';
import { api } from '@/lib/api';
import { confirmDialog } from '../_components/Dialog';

type Sensitive = (action: () => Promise<void>) => Promise<void>;
const SCHEDULES: MedicineScheduleType[] = ['OTC', 'PRESCRIPTION', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X'];
const err = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

/**
 * Master medicine catalogue: search, edit (schedule, MRP, limits, ban or
 * discontinue), merge duplicates and recall a batch. Banning or discontinuing
 * takes a product off sale everywhere at once.
 */
export default function MedicinesPanel({ sensitive, reloadKey }: { sensitive: Sensitive; reloadKey: number }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Medicine[] | null>(null);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.adminListMedicines({ q: q.trim() || undefined, limit: 100 }).then((r) => setRows(r.medicines)).catch((e) => setError(err(e)));
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load, reloadKey]);

  return (
    <section className="admin-section" style={{ marginTop: 12 }}>
      <RecallBatch sensitive={sensitive} onDone={(m) => setNotice(m)} />
      <div className="admin-toolbar">
        <input className="input" type="search" aria-label="Search medicines" placeholder="Search by name, salt or brand" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {notice && <div className="notice good" role="status">{notice}</div>}
      {error && <div className="notice bad" role="alert">{error}</div>}
      {editing && (
        <MedicineEditor medicine={editing} sensitive={sensitive} onClose={() => setEditing(null)}
          onSaved={(m) => { setNotice(m); setEditing(null); load(); }} />
      )}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">No medicines match.</p>}
      <div className="grid cards">
        {rows?.map((m) => (
          <div key={m._id} className="card admin-card">
            <div className="row">
              <h3>{m.name}</h3>
              {m.isBanned ? <span className="pill rx">Banned</span> : m.isDiscontinued ? <span className="pill rx">Discontinued</span> : m.requiresPrescription ? <span className="pill rx">Rx</span> : <span className="pill">OTC</span>}
            </div>
            <span className="muted">{m.genericName || m.category} · {m.packSize || m.form} · MRP ₹{m.referenceMrp ?? '-'} · {m.scheduleType}</span>
            <div className="review-actions"><button className="btn secondary" onClick={() => { setEditing(m); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MedicineEditor({ medicine: m, sensitive, onClose, onSaved }: { medicine: Medicine; sensitive: Sensitive; onClose: () => void; onSaved: (msg: string) => void }) {
  const [d, setD] = useState({
    name: m.name, genericName: m.genericName || '', manufacturer: m.manufacturer || '', strength: m.strength || '', packSize: m.packSize || '',
    scheduleType: m.scheduleType, referenceMrp: m.referenceMrp != null ? String(m.referenceMrp) : '', maxQtyPerOrder: m.maxQtyPerOrder ? String(m.maxQtyPerOrder) : '',
    coldChain: !!m.coldChain, isBanned: !!m.isBanned, isDiscontinued: !!m.isDiscontinued, isActive: m.isActive !== false
  });
  const [mergeQ, setMergeQ] = useState('');
  const [matches, setMatches] = useState<Medicine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mergeQ.trim().length < 2) { setMatches([]); return undefined; }
    const t = setTimeout(() => api.adminListMedicines({ q: mergeQ.trim(), limit: 8 }).then((r) => setMatches(r.medicines.filter((x) => x._id !== m._id))).catch(() => setMatches([])), 250);
    return () => clearTimeout(t);
  }, [mergeQ, m._id]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const off = (d.isBanned && !m.isBanned) || (d.isDiscontinued && !m.isDiscontinued);
    const run = () => sensitive(async () => {
      await api.adminUpdateMedicine(m._id, {
        name: d.name.trim(), genericName: d.genericName.trim() || undefined, manufacturer: d.manufacturer.trim() || undefined,
        strength: d.strength.trim() || undefined, packSize: d.packSize.trim() || undefined, scheduleType: d.scheduleType,
        referenceMrp: d.referenceMrp ? Number(d.referenceMrp) : undefined, maxQtyPerOrder: d.maxQtyPerOrder ? Number(d.maxQtyPerOrder) : undefined,
        coldChain: d.coldChain, isBanned: d.isBanned, isDiscontinued: d.isDiscontinued, isActive: d.isActive
      });
      onSaved(`${d.name}: saved.${off ? ' It is off sale in every store now.' : ''}`);
    });
    if (off) confirmDialog({ title: `Take ${m.name} off sale?`, message: 'Every store stops selling it straight away, and carts with it must be changed.', confirmLabel: 'Take off sale', danger: true }).then((ok) => { if (ok) run(); });
    else run();
  }

  const merge = (into: Medicine) => confirmDialog({
    title: `Merge ${m.name} into ${into.name}?`,
    message: 'Store listings and order history move to the other product, and this one is retired. This can’t be undone.',
    confirmLabel: 'Merge', danger: true
  }).then((ok) => { if (ok) void sensitive(async () => {
    try {
      await api.adminMergeMedicine(m._id, into._id);
    } catch (e) {
      // No composition recorded, or the forms differ: only after a pharmacist checked both packs.
      if (!/force|different forms/i.test(err(e))) throw e;
      if (!(await confirmDialog({ title: 'Check both packs first', message: `${err(e)}. Merge anyway only if a pharmacist confirmed they are the same product.`, confirmLabel: 'They are the same: merge', danger: true }))) return;
      await api.adminMergeMedicine(m._id, into._id, true);
    }
    onSaved(`${m.name} merged into ${into.name}.`);
  }); });

  const text = (k: 'name' | 'genericName' | 'manufacturer' | 'strength' | 'packSize', label: string) => (
    <div><label htmlFor={`me-${k}`}>{label}</label><input id={`me-${k}`} className="input" value={d[k]} required={k === 'name'} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></div>
  );
  const check = (k: 'coldChain' | 'isBanned' | 'isDiscontinued' | 'isActive', label: string, hint: string) => (
    <label className="check-row" htmlFor={`me-${k}`}>
      <input id={`me-${k}`} type="checkbox" checked={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.checked })} />
      <span><strong>{label}</strong><small>{hint}</small></span>
    </label>
  );

  return (
    <form className="card admin-card" onSubmit={save}>
      <div className="row"><h3 style={{ margin: 0 }}>Edit {m.name}</h3><span className="muted mono">{m._id}</span></div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {text('name', 'Name')}
        {text('genericName', 'Salt / generic name')}
        {text('manufacturer', 'Manufacturer')}
        {text('strength', 'Strength')}
        {text('packSize', 'Pack size')}
        <div>
          <label htmlFor="me-schedule">Schedule</label>
          <select id="me-schedule" className="input" value={d.scheduleType} onChange={(e) => setD({ ...d, scheduleType: e.target.value as MedicineScheduleType })}>
            {SCHEDULES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div><label htmlFor="me-mrp">MRP (₹)</label><input id="me-mrp" className="input" type="number" min={0} step="0.01" value={d.referenceMrp} onChange={(e) => setD({ ...d, referenceMrp: e.target.value })} /></div>
        <div><label htmlFor="me-max">Most per order (optional)</label><input id="me-max" className="input" type="number" min={1} max={1000} value={d.maxQtyPerOrder} onChange={(e) => setD({ ...d, maxQtyPerOrder: e.target.value })} /></div>
      </div>
      <div className="access-groups" style={{ marginTop: 10 }}>
        <fieldset className="access-group"><legend>Selling</legend>
          {check('isActive', 'Listed', 'Shown in search and store menus.')}
          {check('coldChain', 'Needs refrigeration', 'Only stores with cold storage can sell it.')}
        </fieldset>
        <fieldset className="access-group"><legend>Off sale</legend>
          {check('isDiscontinued', 'Discontinued', 'The maker stopped it.')}
          {check('isBanned', 'Banned', 'Government ban: never sold.')}
        </fieldset>
      </div>
      <div className="review-actions">
        <button className="btn" type="submit">Save</button>
        <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
      </div>
      <fieldset className="access-group" style={{ marginTop: 12 }}>
        <legend>Duplicate? Merge it into the right product</legend>
        <input className="input" type="search" aria-label="Find the product to keep" placeholder="Find the product to keep" value={mergeQ} onChange={(e) => setMergeQ(e.target.value)} />
        {matches.map((x) => (
          <div key={x._id} className="row" style={{ padding: '6px 0' }}>
            <span>{x.name} <span className="muted">· {x.genericName || x.form} · {x.packSize || ''}</span></span>
            <button type="button" className="btn secondary danger" onClick={() => merge(x)}>Merge into this</button>
          </div>
        ))}
      </fieldset>
    </form>
  );
}

function RecallBatch({ sensitive, onDone }: { sensitive: Sensitive; onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<Medicine[]>([]);
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [batch, setBatch] = useState('');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    if (q.trim().length < 2 || medicine) { setMatches([]); return undefined; }
    const t = setTimeout(() => api.adminListMedicines({ q: q.trim(), limit: 8 }).then((r) => setMatches(r.medicines)).catch(() => setMatches([])), 250);
    return () => clearTimeout(t);
  }, [q, medicine]);

  if (!open) return <button className="btn secondary danger" style={{ justifySelf: 'start' }} onClick={() => setOpen(true)}>Recall a batch</button>;

  function recall(e: React.FormEvent) {
    e.preventDefault();
    if (!medicine) return;
    confirmDialog({
      title: `Recall batch ${batch.trim()} of ${medicine.name}?`,
      message: `Every store's units of this batch go off sale at once${notify ? ', and customers who bought it are told' : ''}.`,
      confirmLabel: 'Recall batch', danger: true
    }).then((ok) => { if (ok) void sensitive(async () => {
      const r = await api.adminRecallBatch({ medicineId: medicine._id, batchNumber: batch.trim(), reason: reason.trim() || undefined, notifyPatients: notify });
      const n = r as { stores?: number; unitsPulled?: number; openOrders?: unknown[]; patientsNotified?: number };
      onDone(`Batch ${batch.trim()} of ${medicine.name} recalled: ${n.unitsPulled ?? 0} units off sale in ${n.stores ?? 0} store(s).${n.openOrders?.length ? ` ${n.openOrders.length} open order(s) need a swap.` : ''}${n.patientsNotified ? ` ${n.patientsNotified} customer(s) told.` : ''}`);
      setOpen(false); setMedicine(null); setQ(''); setBatch(''); setReason('');
    }); });
  }

  return (
    <form className="card admin-card" onSubmit={recall}>
      <h3 style={{ marginTop: 0 }}>Recall a batch</h3>
      {!medicine ? (
        <>
          <input className="input" type="search" aria-label="Find the medicine" placeholder="Find the medicine" value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.map((x) => (
            <button key={x._id} type="button" className="linkbtn" style={{ display: 'block', textAlign: 'left', padding: '6px 0' }} onClick={() => setMedicine(x)}>{x.name} <span className="muted">· {x.packSize || x.form}</span></button>
          ))}
        </>
      ) : (
        <p style={{ margin: 0 }}><b>{medicine.name}</b> <button type="button" className="linkbtn" onClick={() => setMedicine(null)}>change</button></p>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 8 }}>
        <div><label htmlFor="rc-batch">Batch number</label><input id="rc-batch" className="input mono" required maxLength={40} value={batch} onChange={(e) => setBatch(e.target.value)} /></div>
        <div><label htmlFor="rc-reason">Reason</label><input id="rc-reason" className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="CDSCO alert, NSQ…" /></div>
      </div>
      <label className="check-row" htmlFor="rc-notify"><input id="rc-notify" type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /><span><strong>Tell customers who bought it</strong><small>They get a notification with what to do.</small></span></label>
      <div className="review-actions">
        <button className="btn danger" type="submit" disabled={!medicine || !batch.trim()}>Recall</button>
        <button className="btn secondary" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
