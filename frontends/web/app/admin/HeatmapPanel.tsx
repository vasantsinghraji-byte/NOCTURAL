'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HeatCell, Heatmap } from '@medrush/shared';
import { api } from '@/lib/api';

const LAYERS = [
  { key: 'pharmacy', label: 'Pharmacy orders vs riders' },
  { key: 'care', label: 'Home visits vs nurses' }
] as const;
type Layer = (typeof LAYERS)[number]['key'];

// One hue, light to dark (sequential): heat 1-4 = how short of people a cell is.
const HEAT = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];
const HEAT_LABEL = ['Covered', 'Slightly short', 'Short', 'Very short', 'Most short'];
const W = 640;
const H = 420;
const PAD = 12;

const mapsLink = (c: { lat: number; lng: number }) => `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Control tower: where demand is outrunning supply right now, in ~1 km cells,
 * and which zones are on surge (automatic or set by ops). Refreshes every 30 s.
 */
export default function HeatmapPanel() {
  const [layer, setLayer] = useState<Layer>('pharmacy');
  const [data, setData] = useState<Heatmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ cell: HeatCell; x: number; y: number } | null>(null);
  const [view, setView] = useState<'map' | 'table'>('map');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await api.adminHeatmap(layer);
        if (alive) { setData(r); setError(null); }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the heat map');
      }
    };
    load();
    const t = window.setInterval(load, 30000);
    return () => { alive = false; window.clearInterval(t); };
  }, [layer]);

  // Fit every cell into the drawing (equirectangular is fine at city scale).
  const frame = useMemo(() => {
    const cells = data?.cells || [];
    if (!cells.length) return null;
    const south = Math.min(...cells.map((c) => c.bounds.south));
    const north = Math.max(...cells.map((c) => c.bounds.north));
    const west = Math.min(...cells.map((c) => c.bounds.west));
    const east = Math.max(...cells.map((c) => c.bounds.east));
    const kx = Math.cos(((south + north) / 2) * Math.PI / 180); // keep cells their real shape
    const spanX = Math.max((east - west) * kx, 0.01);
    const spanY = Math.max(north - south, 0.01);
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
    const offX = (W - spanX * scale) / 2;
    const offY = (H - spanY * scale) / 2;
    return {
      x: (lng: number) => offX + (lng - west) * kx * scale,
      y: (lat: number) => offY + (north - lat) * scale
    };
  }, [data]);

  const short = (data?.cells || []).filter((c) => c.gap > 0);
  const surging = (data?.zones || []).filter((z) => z.stress.level !== 'NORMAL');
  const supplyWord = layer === 'pharmacy' ? 'rider' : 'nurse';
  const demandWord = layer === 'pharmacy' ? 'order' : 'visit';

  return (
    <section style={{ marginTop: 12 }} className="heat-panel">
      <div className="admin-toolbar">
        <div className="segmented" role="tablist" aria-label="Layer">
          {LAYERS.map((l) => <button key={l.key} role="tab" aria-selected={layer === l.key} className={layer === l.key ? 'on' : ''} onClick={() => setLayer(l.key)}>{l.label}</button>)}
        </div>
        <div className="segmented" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>Map</button>
          <button role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
        </div>
      </div>
      {error && <p className="notice bad" role="alert">{error}</p>}

      {data && (
        <div className="heat-stats">
          <div className="stat"><b>{data.totals.demand}</b><span>{demandWord}s waiting (last {data.windowMinutes} min)</span></div>
          <div className="stat"><b>{data.totals.freeSupply}</b><span>free {supplyWord}s · {data.totals.online} online</span></div>
          <div className="stat"><b>{data.totals.shortCells}</b><span>areas short of {supplyWord}s</span></div>
          <div className="stat"><b>{surging.length}</b><span>zones on surge</span></div>
        </div>
      )}

      {data && view === 'map' && (
        <div className="card heat-card">
          {!frame ? (
            <p className="muted" style={{ margin: 0 }}>Nothing waiting and nobody online in this layer right now.</p>
          ) : (
            <div className="heat-figure" onPointerLeave={() => setHover(null)}>
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Heat map: ${plural(short.length, 'area')} short of ${supplyWord}s`}>
                {data.cells.map((c) => {
                  const x = frame.x(c.bounds.west);
                  const y = frame.y(c.bounds.north);
                  const w = Math.max(frame.x(c.bounds.east) - x, 4);
                  const h = Math.max(frame.y(c.bounds.south) - y, 4);
                  const show = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
                    const box = (e.currentTarget.closest('.heat-figure') as HTMLElement).getBoundingClientRect();
                    setHover({ cell: c, x: e.clientX - box.left, y: e.clientY - box.top });
                  };
                  return (
                    <rect
                      key={c.hash} x={x} y={y} width={w} height={h} rx={4}
                      fill={HEAT[c.heat]} stroke="var(--card)" strokeWidth={2}
                      tabIndex={0} aria-label={`${HEAT_LABEL[c.heat]}: ${plural(c.demand, demandWord)}, ${plural(c.supply, `free ${supplyWord}`)}`}
                      onPointerMove={show}
                      onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); show({ clientX: r.left + r.width / 2, clientY: r.top, currentTarget: e.currentTarget }); }}
                      onBlur={() => setHover(null)}
                      onClick={() => window.open(mapsLink(c), '_blank', 'noopener')}
                    />
                  );
                })}
              </svg>
              {hover && (
                <div className="heat-tip" style={{ left: hover.x, top: hover.y }} role="status">
                  <b>{HEAT_LABEL[hover.cell.heat]}</b>
                  <span>{plural(hover.cell.demand, demandWord)} waiting</span>
                  <span>{plural(hover.cell.supply, `free ${supplyWord}`)}</span>
                  <span className="muted">Click to open in Google Maps</span>
                </div>
              )}
            </div>
          )}
          <div className="heat-legend" aria-label="Legend">
            {HEAT.map((color, i) => <span key={color}><i style={{ background: color }} />{HEAT_LABEL[i]}</span>)}
          </div>
        </div>
      )}

      {data && view === 'table' && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Area (cell centre)</th><th className="num">{demandWord}s waiting</th><th className="num">Free {supplyWord}s</th><th className="num">Short by</th><th /></tr></thead>
            <tbody>
              {data.cells.slice(0, 50).map((c) => (
                <tr key={c.hash}>
                  <td>{c.lat.toFixed(4)}, {c.lng.toFixed(4)}</td>
                  <td className="num">{c.demand}</td><td className="num">{c.supply}</td><td className="num">{Math.max(c.gap, 0)}</td>
                  <td><a href={mapsLink(c)} target="_blank" rel="noopener noreferrer">Map</a></td>
                </tr>
              ))}
              {!data.cells.length && <tr><td colSpan={5} className="muted">Nothing to show right now.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ margin: '0 0 8px' }}>Zones</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Surge shrinks how far stores deliver so riders stay close. It turns on by itself when {demandWord}s pile up and {supplyWord}s are short, and ends when they catch up. A level set by ops under Vendors → zones always wins until it expires.
          </p>
          <div className="table-wrap">
            <table className="admin-table">
              <thead><tr><th>Zone</th><th>Surge</th><th>Why</th><th>Until</th><th>Learned speed</th></tr></thead>
              <tbody>
                {data.zones.map((z) => (
                  <tr key={z.id}>
                    <td>{z.name} <span className="muted">{z.city}</span></td>
                    <td>
                      <span className={`pill ${z.stress.level === 'NORMAL' ? 'mint' : z.stress.level === 'SEVERE' ? 'rx' : 'amber'}`}>
                        {z.stress.level === 'NORMAL' ? '● Normal' : `▲ ${z.stress.level === 'SEVERE' ? 'Severe' : 'High'}`}
                      </span>
                      {z.stress.level !== 'NORMAL' && <span className="muted"> {z.stress.auto ? 'automatic' : 'set by ops'}</span>}
                    </td>
                    <td>{z.stress.reason || '—'}</td>
                    <td>{z.stress.until ? new Date(z.stress.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td>{z.rideKmph ? `${z.rideKmph} km/h` : <span className="muted">learning</span>}</td>
                  </tr>
                ))}
                {!data.zones.length && <tr><td colSpan={5} className="muted">No zones drawn yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
