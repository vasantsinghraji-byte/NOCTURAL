'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminLogEntry } from '@medrush/shared';
import { api } from '@/lib/api';

const LEVELS = [
  { key: 'error', label: 'Errors' },
  { key: 'warn', label: 'Warnings +' },
  { key: 'info', label: 'Info +' }
];
// Kept small so the view stays fast; older lines are in CloudWatch.
const MAX_LINES = 300;

/**
 * Live server logs, refreshed every 3 seconds. The server strips secrets and
 * masks emails and phone numbers before a line is ever stored for this view.
 */
export default function LogsPanel() {
  const [level, setLevel] = useState('warn');
  const [q, setQ] = useState('');
  const [live, setLive] = useState(true);
  const [lines, setLines] = useState<AdminLogEntry[]>([]);
  const [instance, setInstance] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const after = useRef(0);

  // Filters changed: start over from the latest lines.
  useEffect(() => { after.current = 0; setLines([]); }, [level, q]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await api.adminLogs({ after: after.current, level, q: q.trim() || undefined });
        if (!alive) return;
        setError(null);
        setInstance(r.instance);
        after.current = r.latestSeq;
        if (r.entries.length) setLines((prev) => [...r.entries.reverse(), ...prev].slice(0, MAX_LINES));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load logs');
      }
    };
    const t0 = window.setTimeout(poll, 200);
    const t = live ? window.setInterval(poll, 3000) : undefined;
    return () => { alive = false; window.clearTimeout(t0); if (t) window.clearInterval(t); };
  }, [level, q, live]);

  return (
    <section style={{ marginTop: 12 }}>
      <div className="admin-toolbar">
        <div className="segmented" role="tablist" aria-label="Level">
          {LEVELS.map((l) => <button key={l.key} role="tab" aria-selected={level === l.key} className={level === l.key ? 'on' : ''} onClick={() => setLevel(l.key)}>{l.label}</button>)}
        </div>
        <input className="input" type="search" name="q" autoComplete="off" spellCheck={false} aria-label="Filter logs" placeholder="Filter, e.g. payment, refund, dispatch…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={live ? 'btn' : 'btn secondary'} onClick={() => setLive((v) => !v)} aria-pressed={live}>
          <span className={`live-dot ${live ? 'on' : ''}`} aria-hidden="true" /> {live ? 'Live' : 'Paused'}
        </button>
        <button className="btn secondary" onClick={() => setLines([])}>Clear view</button>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      <p className="muted" style={{ fontSize: 12, margin: '6px 0' }}>
        Newest first · server instance <span className="mono">{instance || '…'}</span> · secrets removed, emails and phone numbers masked. Older logs are in AWS CloudWatch.
      </p>
      <div className="log-view" role="log" aria-live="off">
        {lines.length === 0 && <div className="muted" style={{ padding: 12 }}>No {level === 'error' ? 'errors' : 'lines'} yet.{live ? ' Watching for new ones…' : ''}</div>}
        {lines.map((l) => (
          <div key={l.seq} className={`log-line ${l.level}`}>
            <button className="log-head" onClick={() => setOpen(open === l.seq ? null : l.seq)} aria-expanded={open === l.seq}>
              <span className="log-time">{new Date(l.at).toLocaleTimeString('en-IN', { hour12: false })}</span>
              <span className="log-level">{l.level}</span>
              <span className="log-msg">{l.message}</span>
            </button>
            {open === l.seq && (l.meta || l.stack) && <pre className="log-meta">{l.meta ? JSON.stringify(l.meta, null, 2) : ''}{l.stack ? `\n${l.stack}` : ''}</pre>}
          </div>
        ))}
      </div>
    </section>
  );
}
