'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Power, SlidersHorizontal } from 'lucide-react';
import type { AdCampaignView, SettingField } from '@medrush/shared';
import { api } from '@/lib/api';
import { inr, fmtDay } from '@/lib/care';
import { promptDialog, confirmDialog } from '../_components/Dialog';

type Sensitive = (action: () => Promise<void>) => Promise<void>;

/** Ads review and reports, platform settings with propose → approve (docs/product/ADMIN_AND_ADS_GUIDE.md). */
export default function AdsSettingsPanel({ sensitive }: { sensitive: Sensitive }) {
  const [view, setView] = useState<'ads' | 'settings'>('ads');
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="mk-chips" role="tablist" aria-label="Ads and settings">
        <button type="button" role="tab" className="mk-chip" aria-selected={view === 'ads'} aria-pressed={view === 'ads'} onClick={() => setView('ads')}><Megaphone size={14} aria-hidden="true" /> Ads</button>
        <button type="button" role="tab" className="mk-chip" aria-selected={view === 'settings'} aria-pressed={view === 'settings'} onClick={() => setView('settings')}><SlidersHorizontal size={14} aria-hidden="true" /> Fees & Settings</button>
      </div>
      {view === 'ads' ? <Ads sensitive={sensitive} /> : <Settings sensitive={sensitive} />}
    </div>
  );
}

const STATUS = ['PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'REJECTED', 'ENDED'] as const;

function Ads({ sensitive }: { sensitive: Sensitive }) {
  const [status, setStatus] = useState<typeof STATUS[number]>('PENDING_REVIEW');
  const [data, setData] = useState<{ campaigns: AdCampaignView[]; report: Awaited<ReturnType<typeof api.adminAds>>['report'] } | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => api.adminAds(status).then((r) => setData(r)).catch(() => setData({ campaigns: [], report: [] })), [status]);
  useEffect(() => { setData(null); load(); }, [load]);
  const decide = async (c: AdCampaignView, decision: 'APPROVE' | 'REJECT' | 'PAUSE' | 'RESUME') => {
    const reason = ['REJECT', 'PAUSE'].includes(decision) ? await promptDialog({ title: decision === 'REJECT' ? 'Why reject this ad?' : 'Why pause this ad?', label: 'Reason (the advertiser sees it)', minLength: 3, maxLength: 300 }) : undefined;
    if (['REJECT', 'PAUSE'].includes(decision) && !reason) return;
    sensitive(async () => { await api.adminReviewAd(c._id, decision, reason || undefined); setNotice('Done.'); await load(); });
  };
  const houseAd = async () => {
    const title = await promptDialog({ title: 'New house ad (home spotlight)', label: 'Headline', minLength: 2, maxLength: 60, placeholder: 'Nabz Plus: no visit fee for a month' });
    if (!title) return;
    const path = await promptDialog({ title: 'Where does it open?', label: 'App path', placeholder: '/plus', maxLength: 120, minLength: 1, pattern: /^\/[A-Za-z0-9\-/_?=&.]*$/, patternHint: 'Starts with /' });
    if (!path) return;
    sensitive(async () => { await api.adminCreateHouseAd({ name: title, creative: { title, ctaPath: path } }); setNotice('House ad is live.'); setStatus('ACTIVE'); await load(); });
  };
  const totals = (data?.report || []).reduce((t, r) => ({ impressions: t.impressions + r.impressions, clicks: t.clicks + r.clicks, spend: t.spend + r.spend, bookings: t.bookings + r.bookings, invalid: t.invalid + r.invalidClicks }), { impressions: 0, clicks: 0, spend: 0, bookings: 0, invalid: 0 });
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      {data && (
        <div className="mk-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {[['Views (14 days)', totals.impressions], ['Taps', totals.clicks], ['Tap rate', totals.impressions ? `${((totals.clicks / totals.impressions) * 100).toFixed(1)}%` : '–'], ['Bookings from ads', totals.bookings], ['Ad revenue', inr(totals.spend)], ['Invalid taps (free)', totals.invalid]].map(([l, v], i) => (
            <div key={String(l)} className={`mk-card ${i === 4 ? 'red' : ''}`} style={{ padding: 12 }}><p className="mk-meta" style={{ margin: 0 }}>{l}</p><p className="mk-price" style={{ color: i === 4 ? '#fff' : undefined }}>{v}</p></div>
          ))}
        </div>
      )}
      <div className="mk-row" style={{ flexWrap: 'wrap' }}>
        <div className="mk-chips grow" style={{ padding: 0 }}>{STATUS.map((s) => <button key={s} type="button" className="mk-chip" aria-pressed={status === s} onClick={() => setStatus(s)}>{s.replace('_', ' ').toLowerCase()}</button>)}</div>
        <button type="button" className="mk-btn soft small" onClick={houseAd}>New House Ad</button>
      </div>
      {notice && <p className="mk-note green" role="status">{notice}</p>}
      {!data && <div className="mk-skel" />}
      {data && data.campaigns.length === 0 && <p className="mk-meta">Nothing here.</p>}
      {(data?.campaigns || []).map((c) => (
        <article key={c._id} className="mk-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
          <div className="mk-row" style={{ flexWrap: 'wrap' }}>
            <div className="grow">
              <p className="mk-title">{c.creative?.title || c.name}</p>
              <p className="mk-meta" style={{ margin: 0 }}>{c.store?.name || 'Nabz (house ad)'} · {c.product.replace(/_/g, ' ').toLowerCase()} · {c.bidCpc ? `${inr(c.bidCpc)}/tap, ${inr(c.dailyBudget)}/day` : c.weeklyPrice ? `${inr(c.weeklyPrice)}/week` : 'free'} · {fmtDay(c.startAt)} to {fmtDay(c.endAt)}</p>
              {c.creative?.subtitle && <p className="mk-meta" style={{ margin: 0 }}>“{c.creative.subtitle}”</p>}
            </div>
            <div className="mk-row" style={{ gap: 6 }}>
              {c.status === 'PENDING_REVIEW' && <><button type="button" className="mk-btn small" onClick={() => decide(c, 'APPROVE')}>Approve</button><button type="button" className="mk-btn ghost small" onClick={() => decide(c, 'REJECT')}>Reject</button></>}
              {c.status === 'ACTIVE' && <button type="button" className="mk-btn ghost small" onClick={() => decide(c, 'PAUSE')}>Pause</button>}
              {c.status === 'PAUSED' && <button type="button" className="mk-btn soft small" onClick={() => decide(c, 'RESUME')}>Resume</button>}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function Settings({ sensitive }: { sensitive: Sensitive }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.adminSettings>> | null>(null);
  const [edits, setEdits] = useState<Record<string, string | boolean>>({});
  const [notice, setNotice] = useState('');
  const load = useCallback(() => api.adminSettings().then((r) => { setData(r); setEdits({}); }).catch(() => undefined), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="mk-skel" />;
  const fieldKey = (f: SettingField) => `${f.key}:${f.path}`;
  const propose = async (group: 'revenue' | 'ads') => {
    const changes: Record<string, number | boolean> = {};
    for (const f of data.fields.filter((x) => x.key === group)) {
      const v = edits[fieldKey(f)];
      if (v === undefined) continue;
      changes[f.path] = f.type === 'boolean' ? Boolean(v) : Number(v);
    }
    if (!Object.keys(changes).length) return;
    const reason = await promptDialog({ title: 'Why this change?', label: 'Reason (kept in the history)', minLength: 5, maxLength: 300 });
    if (!reason) return;
    sensitive(async () => { await api.adminProposeSetting({ key: group, changes, reason }); setNotice('Proposed. Another admin approves it (or you, if you are the only admin).'); await load(); });
  };
  const killSwitch = async () => {
    const on = data.fields.find((f) => f.key === 'ads' && f.path === 'enabled')?.value === true;
    if (!(await confirmDialog({ title: on ? 'Turn ALL ads off?' : 'Turn ads back on?', confirmLabel: on ? 'Turn Off' : 'Turn On', danger: on }))) return;
    sensitive(async () => { await api.adminProposeSetting({ key: 'ads', changes: { enabled: !on }, reason: on ? 'Kill switch: ads off' : 'Ads back on' }); await load(); });
  };
  const review = (id: string, decision: 'APPROVE' | 'REJECT') => sensitive(async () => { await api.adminReviewSetting(id, decision); setNotice(decision === 'APPROVE' ? 'Applied. New bookings use it now.' : 'Rejected.'); await load(); });
  const group = (g: 'revenue' | 'ads', title: string) => (
    <section className="mk-card" style={{ display: 'grid', gap: 10 }} aria-label={title}>
      <p className="mk-title">{title}</p>
      {data.fields.filter((f) => f.key === g).map((f) => {
        const k = fieldKey(f);
        const v = edits[k] ?? f.value;
        return (
          <div key={k} className="mk-row" style={{ flexWrap: 'wrap' }}>
            <label htmlFor={k} className="grow" style={{ fontSize: 14 }}>{f.label}</label>
            {f.type === 'boolean'
              ? <input id={k} type="checkbox" checked={Boolean(v)} onChange={(e) => setEdits({ ...edits, [k]: e.target.checked })} />
              : <input id={k} type="number" step="any" min={f.min} max={f.max} className="mk-input" style={{ width: 130, minHeight: 38 }} value={String(v)} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} />}
          </div>
        );
      })}
      <button type="button" className="mk-btn small" style={{ justifySelf: 'start' }} disabled={!Object.keys(edits).some((k) => k.startsWith(`${g}:`))} onClick={() => propose(g)}>Propose Change</button>
    </section>
  );
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {notice && <p className="mk-note green" role="status">{notice}</p>}
      <div className="mk-card red mk-row" style={{ flexWrap: 'wrap' }}>
        <Power size={22} aria-hidden="true" />
        <div className="grow"><p className="mk-title">Ads kill switch</p><p className="mk-meta" style={{ margin: 0 }}>Ads are {data.fields.find((f) => f.key === 'ads' && f.path === 'enabled')?.value ? 'ON' : 'OFF'} everywhere.</p></div>
        <button type="button" className="mk-btn dark" onClick={killSwitch}>Switch</button>
      </div>
      {data.pending.length > 0 && (
        <section className="mk-card" style={{ display: 'grid', gap: 8 }} aria-label="Waiting for approval">
          <p className="mk-title">Waiting for approval</p>
          {data.pending.map((p) => (
            <div key={p._id} className="mk-row" style={{ flexWrap: 'wrap' }}>
              <div className="grow"><strong>{p.changes.map((c) => `${c.path}: ${String(c.previous)} → ${String(c.value)}`).join(', ')}</strong><p className="mk-meta" style={{ margin: 0 }}>{p.reason} · by {p.proposedBy?.name || 'admin'}</p></div>
              <button type="button" className="mk-btn small" onClick={() => review(p._id, 'APPROVE')}>Approve</button>
              <button type="button" className="mk-btn ghost small" onClick={() => review(p._id, 'REJECT')}>Reject</button>
            </div>
          ))}
        </section>
      )}
      <div className="mk-grid two">
        {group('revenue', 'Fees, commission and plans')}
        {group('ads', 'Ad placements')}
      </div>
      <section className="mk-card" aria-label="History">
        <p className="mk-title">History</p>
        <table className="mk-table"><thead><tr><th>When</th><th>Change</th><th>Why</th><th>Status</th></tr></thead>
          <tbody>{data.history.map((h) => <tr key={h._id}><td>{fmtDay(h.createdAt)}</td><td>{h.changes.map((c) => `${c.path}: ${String(c.previous)} → ${String(c.value)}`).join(', ')}</td><td>{h.reason}</td><td>{h.status.toLowerCase()}{h.selfApproved ? ' (self-approved)' : ''}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
