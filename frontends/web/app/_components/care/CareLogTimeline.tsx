'use client';

import { Activity, CheckCircle2, HeartPulse, NotebookPen, Pill, PlayCircle, Utensils } from 'lucide-react';
import type { CareLogView, CareVitals } from '@medrush/shared';

export const LOG_KINDS = {
  VITALS: { label: 'Readings', Icon: HeartPulse },
  MEDICINE: { label: 'Medicine', Icon: Pill },
  MEAL: { label: 'Meal', Icon: Utensils },
  ACTIVITY: { label: 'Activity', Icon: Activity },
  NOTE: { label: 'Note', Icon: NotebookPen }
} as const;

export function vitalsLine(v?: CareVitals) {
  if (!v) return '';
  return [
    v.bpSys && v.bpDia ? `BP ${v.bpSys}/${v.bpDia}` : '', v.sugar ? `Sugar ${v.sugar} mg/dL` : '', v.pulse ? `Pulse ${v.pulse}` : '',
    v.spo2 ? `SpO₂ ${v.spo2}%` : '', v.temp ? `Temp ${v.temp}°F` : ''
  ].filter(Boolean).join(' · ');
}
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** What happened during a visit, in time order. */
export default function CareLogTimeline({ log }: { log: CareLogView }) {
  const rows = [
    ...(log.startedAt ? [{ key: 'start', at: log.startedAt, Icon: PlayCircle, title: 'Visit started', text: '', strong: true }] : []),
    ...log.entries.map((e) => ({ key: e._id, at: e.at, Icon: LOG_KINDS[e.kind].Icon, title: LOG_KINDS[e.kind].label, text: e.kind === 'VITALS' ? vitalsLine(e.vitals) : e.text || '', strong: false })),
    ...(log.completedAt ? [{ key: 'end', at: log.completedAt, Icon: CheckCircle2, title: 'Visit finished', text: '', strong: true }] : [])
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  if (!rows.length) return <p className="mk-meta">Nothing logged yet. Entries appear here as the professional adds them.</p>;
  return (
    <div className="mk-steps">
      {rows.map((r) => (
        <div key={r.key} className={`mk-step ${r.strong ? 'on' : ''}`}>
          <span className="dot" aria-hidden="true"><r.Icon size={14} /></span>
          <div><strong>{r.title}</strong> <span className="mk-meta">{clock(r.at)}</span>{r.text && <p className="mk-meta" style={{ margin: '2px 0 0', color: 'var(--ink-soft)' }}>{r.text}</p>}</div>
        </div>
      ))}
    </div>
  );
}
