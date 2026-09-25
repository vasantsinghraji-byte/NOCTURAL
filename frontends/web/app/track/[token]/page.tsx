'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Clock, MapPin, ShieldCheck } from 'lucide-react';
import type { SharedTracking } from '@medrush/shared';
import { api } from '@/lib/api';

const POLL_MS = 8000;
const STATUS: Record<string, string> = {
  REQUESTED: 'Finding a professional',
  ASSIGNED: 'Professional assigned',
  CONFIRMED: 'Visit confirmed',
  EN_ROUTE: 'On the way',
  IN_PROGRESS: 'Visit in progress',
  COMPLETED: 'Visit completed',
  CANCELLED: 'Visit cancelled'
};

/** Family tracking link shared from the Nabz app. No login; shows only minimal details. */
export default function SharedTrackingPage() {
  const { token } = useParams<{ token: string }>();
  const [tracking, setTracking] = useState<SharedTracking | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getSharedTracking(token)
      .then((r) => { setTracking(r.tracking); setError(null); })
      .catch((e) => setError(e instanceof Error && /not found/i.test(e.message) ? 'This tracking link is invalid or has expired.' : 'Could not load tracking. Retrying…'));
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const loc = tracking?.staffLocation;
  const eta = tracking?.estimatedArrival
    ? Math.max(1, Math.round((new Date(tracking.estimatedArrival).getTime() - Date.now()) / 60000))
    : null;
  const d = 0.01;
  const mapSrc = loc
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${loc.lng - d},${loc.lat - d},${loc.lng + d},${loc.lat + d}&layer=mapnik&marker=${loc.lat},${loc.lng}`
    : null;

  return (
    <main className="track-page">
      <section className="track-card">
        <p className="track-kicker">Nabz · live visit</p>
        {error && !tracking && <p className="track-error">{error}</p>}
        {!tracking && !error && <p className="track-muted">Loading…</p>}
        {tracking && (
          <>
            <h1 className="track-title">
              {tracking.expired ? 'This visit has ended' : tracking.staff ? `${tracking.staff.firstName} is ${tracking.status === 'IN_PROGRESS' ? 'with them now' : 'on the way'}` : STATUS[tracking.status] || tracking.status}
            </h1>
            <p className="track-muted">
              {STATUS[tracking.status] || tracking.status}
              {tracking.staff?.qualification ? ` · ${tracking.staff.qualification}` : ''}
              {' · '}{tracking.serviceType.replace(/_/g, ' ').toLowerCase()}
            </p>
            <div className="track-stats">
              <div><Clock size={16} /> <strong>{eta !== null ? `${eta} min` : '—'}</strong> <span>ETA</span></div>
              <div><MapPin size={16} /> <strong>{loc ? 'Live' : 'Not sharing yet'}</strong> <span>location</span></div>
            </div>
            {mapSrc ? (
              <iframe className="track-map" title="Live location" src={mapSrc} loading="lazy" />
            ) : !tracking.expired ? (
              <p className="track-muted">The map appears once the professional starts sharing their location.</p>
            ) : null}
            <p className="track-note"><ShieldCheck size={14} /> Verified Nabz professional. Contact details are only visible to the patient. In an emergency call 112.</p>
          </>
        )}
      </section>
    </main>
  );
}
