'use client';

import { useEffect, useState } from 'react';
import type { MyRateCardItem } from '@medrush/shared';
import { api } from '@/lib/api';
import { inr, problem } from '@/lib/care';
import { Modal } from '../Dialog';

/**
 * After (or during) a visit, the professional suggests a treatment plan. The
 * customer sees it with the shop's own prices and books it if they agree.
 */
export default function ProposalDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [items, setItems] = useState<MyRateCardItem[] | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [mode, setMode] = useState<'HOME' | 'CLINIC'>('HOME');
  const [sessions, setSessions] = useState('10');
  const [perWeek, setPerWeek] = useState('3');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.myShop().then((r) => {
      const live = r.rateCard.filter((i) => i.isActive && (i.home.enabled || i.clinic.enabled));
      setItems(live);
      if (live[0]) { setServiceId(live[0].service._id); setMode(live[0].home.enabled ? 'HOME' : 'CLINIC'); }
    }).catch((e) => { setErr(problem(e).message); setItems([]); });
  }, []);
  const item = items?.find((i) => i.service._id === serviceId);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await api.proposePlan(bookingId, { serviceId, mode, sessions: Number(sessions), sessionsPerWeek: Number(perWeek) || undefined, note: note.trim() || undefined });
      setDone(true);
    } catch (e2) { setErr(problem(e2).message); } finally { setSaving(false); }
  };
  return (
    <Modal onClose={onClose} labelledBy="propose-title" as="form" onSubmit={submit}>
      <div style={{ display: 'grid', gap: 14 }}>
        <h2 id="propose-title" className="mk-title" style={{ fontSize: 22 }}>Suggest a treatment plan</h2>
        {done ? (
          <>
            <p className="mk-note green">Sent. The customer sees your suggestion with your prices and can book it in a tap.</p>
            <button type="button" className="mk-btn" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            {!items && <div className="mk-skel" />}
            {items && items.length === 0 && <p className="mk-note">Add services to your rate card first (My Shop → Rate Card).</p>}
            {items && items.length > 0 && (
              <>
                <div className="mk-field"><label htmlFor="p-svc">Service</label>
                  <select id="p-svc" className="mk-select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                    {items.map((i) => <option key={i._id} value={i.service._id}>{i.service.displayName}</option>)}
                  </select>
                </div>
                <div className="mk-seg" role="group" aria-label="Where" style={{ justifySelf: 'start' }}>
                  <button type="button" aria-pressed={mode === 'HOME'} disabled={!item?.home.enabled} onClick={() => setMode('HOME')}>At Home{item?.home.enabled ? ` ${inr(item.home.price)}` : ''}</button>
                  <button type="button" aria-pressed={mode === 'CLINIC'} disabled={!item?.clinic.enabled} onClick={() => setMode('CLINIC')}>At Clinic{item?.clinic.enabled ? ` ${inr(item.clinic.price)}` : ''}</button>
                </div>
                <div className="mk-split">
                  <div className="mk-field"><label htmlFor="p-n">Sessions</label><input id="p-n" type="number" min={1} max={30} className="mk-input" value={sessions} onChange={(e) => setSessions(e.target.value)} /></div>
                  <div className="mk-field"><label htmlFor="p-w">Per week</label><input id="p-w" type="number" min={1} max={7} className="mk-input" value={perWeek} onChange={(e) => setPerWeek(e.target.value)} /></div>
                </div>
                <div className="mk-field"><label htmlFor="p-note">Note for the patient</label><textarea id="p-note" className="mk-textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this plan helps, exercises between sessions…" /></div>
              </>
            )}
            {err && <p className="mk-note" role="alert">{err}</p>}
            <div className="mk-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="mk-btn ghost" onClick={onClose}>Close</button>
              <button type="submit" className="mk-btn" disabled={saving || !serviceId}>{saving ? 'Sending…' : 'Send Suggestion'}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
