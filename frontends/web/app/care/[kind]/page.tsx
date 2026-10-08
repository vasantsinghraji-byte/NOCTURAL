'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams, notFound } from 'next/navigation';
import type { MarketService, ShopCard as Shop, CareMode, ShopKind } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { KINDS, kindFromSlug, problem, useVisitPlace, inr } from '@/lib/care';
import CareArt from '../../_components/care/CareArt';
import PlacePicker from '../../_components/care/PlacePicker';
import ShopCard from '../../_components/care/ShopCard';

const SORTS = [['recommended', 'Recommended'], ['price', 'Price'], ['distance', 'Nearest'], ['rating', 'Rating']] as const;

export default function KindPage() {
  return <Suspense fallback={<div className="mk-skel" style={{ minHeight: 260 }} />}><KindBrowser /></Suspense>;
}

function KindBrowser() {
  const params = useParams<{ kind: string }>();
  const found = kindFromSlug(params.kind) as Exclude<ShopKind, 'LAB'> | null;
  const kind = found || 'PHYSIO';
  const meta = KINDS[kind];
  const router = useRouter();
  const search = useSearchParams();
  const { patient } = useAuth();
  const { place, setPlace, useMyLocation, locating } = useVisitPlace(patient?.savedAddresses);

  const homeOnly = kind === 'HOMECARE';
  const serviceId = search.get('service') || '';
  const mode = (homeOnly ? 'HOME' : (search.get('mode') as CareMode) || 'HOME') as CareMode;
  const sort = search.get('sort') || 'recommended';
  const gender = search.get('gender') || '';

  const [services, setServices] = useState<MarketService[] | null>(null);
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [error, setError] = useState('');

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    api.marketServices(kind).then((r) => setServices(r.services)).catch((e) => setError(problem(e).message));
  }, [kind]);

  useEffect(() => {
    if (mode === 'HOME' && !place.coords) { setShops([]); return; }
    setShops(null);
    setError('');
    api.marketStores({
      kind, serviceId: serviceId || undefined, mode, sort: sort as 'recommended',
      gender: (gender || undefined) as 'FEMALE' | undefined,
      lat: place.coords?.lat, lng: place.coords?.lng
    }).then((r) => setShops(r.stores)).catch((e) => { setError(problem(e).message); setShops([]); });
  }, [kind, serviceId, mode, sort, gender, place.coords]);

  const chosen = useMemo(() => services?.find((s) => s._id === serviceId), [services, serviceId]);
  if (!found) notFound();

  return (
    <div>
      <section className="mk-hero" aria-labelledby="kind-title">
        <div className="in" style={{ gridTemplateColumns: '1.2fr .8fr' }}>
          <div>
            <h1 id="kind-title">{meta.label}</h1>
            <p>{meta.pitch}</p>
            {chosen && chosen.fromPrice != null && <p style={{ margin: 0, fontWeight: 700 }}>{chosen.displayName}: from {inr(chosen.fromPrice)} per {meta.unit}</p>}
          </div>
          <div className="art" style={{ maxWidth: 240 }}><CareArt kind={meta.art} /></div>
        </div>
      </section>

      <div className="mk-chips" role="group" aria-label="Service">
        <button type="button" className="mk-chip" aria-pressed={!serviceId} onClick={() => setParam('service', '')}>All</button>
        {(services || []).map((s) => (
          <button key={s._id} type="button" className="mk-chip" aria-pressed={serviceId === s._id} onClick={() => setParam('service', s._id)}>
            {s.displayName}
          </button>
        ))}
      </div>
      {chosen?.shortDescription && <p className="mk-help" style={{ margin: '0 0 8px' }}>{chosen.shortDescription}</p>}

      <div className="mk-toolbar">
        {!homeOnly ? (
          <div className="mk-seg" role="group" aria-label="Where">
            <button type="button" aria-pressed={mode === 'HOME'} onClick={() => setParam('mode', 'HOME')}>At Home</button>
            <button type="button" aria-pressed={mode === 'CLINIC'} onClick={() => setParam('mode', 'CLINIC')}>At Clinic</button>
          </div>
        ) : <span className="mk-badge dark">At your home</span>}
        <div className="mk-chips" role="group" aria-label="Sort" style={{ padding: 0 }}>
          {SORTS.map(([v, label]) => <button key={v} type="button" className="mk-chip" aria-pressed={sort === v} onClick={() => setParam('sort', v)}>{label}</button>)}
          <button type="button" className="mk-chip" aria-pressed={gender === 'FEMALE'} onClick={() => setParam('gender', gender === 'FEMALE' ? '' : 'FEMALE')}>Female</button>
          <button type="button" className="mk-chip" aria-pressed={gender === 'MALE'} onClick={() => setParam('gender', gender === 'MALE' ? '' : 'MALE')}>Male</button>
        </div>
      </div>

      <PlacePicker saved={patient?.savedAddresses || []} place={place} onChange={setPlace} onLocate={useMyLocation} locating={locating} signedIn={Boolean(patient)} />

      <div aria-live="polite" style={{ marginTop: 16 }}>
        {error && <p className="mk-note">{error}</p>}
        {!shops && <div className="mk-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="mk-skel" style={{ minHeight: 170 }} />)}</div>}
        {shops && shops.length === 0 && !error && (
          <div className="mk-empty">
            <div className="art"><CareArt kind="empty" /></div>
            <strong>{mode === 'HOME' && !place.coords ? 'Choose the visit address first' : `No ${meta.plural} here yet`}</strong>
            <span>{mode === 'HOME' && !place.coords ? 'We use it to show who can come to you and the travel fee.' : 'Try another service, the clinic option, or a different address.'}</span>
          </div>
        )}
        {shops && shops.length > 0 && (
          <div className="mk-grid">
            {shops.map((s) => <ShopCard key={`${s._id}${s.sponsored ? '-ad' : ''}`} shop={s} mode={mode} serviceId={serviceId || undefined} unit={meta.unit} />)}
          </div>
        )}
      </div>
    </div>
  );
}
