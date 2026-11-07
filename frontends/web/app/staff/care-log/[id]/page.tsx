'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CareLogKind, CareLogView, CareVitals } from '@medrush/shared';
import { api } from '@/lib/api';
import { problem } from '@/lib/care';
import CareLogTimeline, { LOG_KINDS } from '../../../_components/care/CareLogTimeline';

const QUICK: Record<Exclude<CareLogKind, 'VITALS'>, string[]> = {
  MEAL: ['Breakfast eaten', 'Lunch eaten', 'Dinner eaten', 'Ate half', 'Did not eat', 'Water / fluids given'],
  MEDICINE: ['Morning medicines given', 'Afternoon medicines given', 'Night medicines given', 'Insulin given'],
  ACTIVITY: ['Short walk', 'Exercises done', 'Bath / sponge bath', 'Rested / slept', 'Position changed'],
  NOTE: ['Comfortable and calm', 'Complained of pain', 'Feeling dizzy', 'Family informed']
};
const VITALS: Array<[keyof CareVitals, string, string]> = [['bpSys', 'BP top', '120'], ['bpDia', 'BP bottom', '80'], ['sugar', 'Sugar (mg/dL)', '110'], ['pulse', 'Pulse', '72'], ['spo2', 'SpO₂ (%)', '98'], ['temp', 'Temp (°F)', '98.6']];

/** The professional's care log for a visit (same as the partner app). */
export default function StaffCareLogPage() {
  const { id } = useParams<{ id: string }>();
  const [log, setLog] = useState<CareLogView | null>(null);
  const [kind, setKind] = useState<CareLogKind>('VITALS');
  const [text, setText] = useState('');
  const [vitals, setVitals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => api.staffCareLog(id).then((r) => setLog(r.log)).catch((e) => setMsg(problem(e).message)), [id]);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      const body = kind === 'VITALS'
        ? { kind, vitals: Object.fromEntries(Object.entries(vitals).filter(([, v]) => v.trim()).map(([k, v]) => [k, Number(v)])) as CareVitals }
        : { kind, text };
      setLog((await api.addCareLogEntry(id, body)).log);
      setText('');
      setVitals({});
    } catch (err) { setMsg(problem(err).message); } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
      <Link className="link" href="/staff">← Back to visits</Link>
      <form className="mk-card" onSubmit={save} style={{ display: 'grid', gap: 12 }}>
        <h1 className="mk-title" style={{ fontSize: 22 }}>Care log</h1>
        <p className="mk-meta" style={{ margin: 0 }}>The family sees this as you write it.</p>
        <div className="mk-seg" role="group" aria-label="What to log" style={{ flexWrap: 'wrap', justifySelf: 'start' }}>
          {(Object.keys(LOG_KINDS) as CareLogKind[]).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setText(''); }}>{LOG_KINDS[k].label}</button>)}
        </div>
        {kind === 'VITALS' ? (
          <div className="mk-split">
            {VITALS.map(([k, label, ph]) => <div key={k} className="mk-field"><label htmlFor={`v-${k}`}>{label}</label><input id={`v-${k}`} className="mk-input" inputMode="decimal" placeholder={ph} value={vitals[k] || ''} onChange={(e) => setVitals({ ...vitals, [k]: e.target.value.replace(/[^\d.]/g, '') })} /></div>)}
          </div>
        ) : (
          <>
            <div className="mk-chips" style={{ padding: 0 }}>{QUICK[kind].map((q) => <button key={q} type="button" className="mk-chip" aria-pressed={text === q} onClick={() => setText(q)}>{q}</button>)}</div>
            <div className="mk-field"><label htmlFor="log-text">Note</label><textarea id="log-text" className="mk-textarea" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} /></div>
          </>
        )}
        {msg && <p className="mk-note" role="alert">{msg}</p>}
        <button type="submit" className="mk-btn" disabled={saving} style={{ justifySelf: 'start' }}>{saving ? 'Saving…' : 'Add to Log'}</button>
      </form>
      {log && <section className="mk-card"><h2 className="mk-title" style={{ marginBottom: 10 }}>Today’s log</h2><CareLogTimeline log={log} /></section>}
    </div>
  );
}
