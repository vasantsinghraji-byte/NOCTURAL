'use client';

import Link from 'next/link';
import { LocateFixed, MapPin, Plus } from 'lucide-react';
import type { SavedAddress } from '@medrush/shared';
import { fromSaved, type VisitPlace } from '@/lib/care';

/** Choose where the care happens: a saved address or the current location. */
export default function PlacePicker({
  saved, place, onChange, onLocate, locating, signedIn
}: {
  saved: SavedAddress[];
  place: VisitPlace;
  onChange: (p: VisitPlace) => void;
  onLocate: () => void;
  locating: boolean;
  signedIn: boolean;
}) {
  const usable = saved.filter((a) => Number.isFinite(a.coordinates?.lat) && Number.isFinite(a.coordinates?.lng));
  return (
    <div className="mk-card" style={{ padding: 14 }}>
      <div className="mk-row" style={{ flexWrap: 'wrap' }}>
        <span className="mk-tile" style={{ width: 40, height: 40, borderRadius: 14 }}><MapPin size={18} aria-hidden="true" /></span>
        <div className="grow">
          <label htmlFor="visit-place" className="mk-label">Visit address</label>
          {usable.length > 0 ? (
            <select
              id="visit-place"
              className="mk-select"
              style={{ minHeight: 40, marginTop: 4 }}
              value={place.addressId || ''}
              onChange={(e) => { const a = usable.find((x) => x._id === e.target.value); if (a) onChange(fromSaved(a)); }}
            >
              {!place.addressId && <option value="">{place.coords ? place.label : 'Choose a saved address'}</option>}
              {usable.map((a) => <option key={a._id} value={a._id}>{a.label ? `${a.label}: ` : ''}{a.street}{a.city ? `, ${a.city}` : ''}</option>)}
            </select>
          ) : (
            <p id="visit-place" className="mk-meta" style={{ margin: '4px 0 0' }}>{place.coords ? place.label : 'Add an address or use your location to see home visits and travel fees.'}</p>
          )}
        </div>
        <div className="mk-row" style={{ gap: 8 }}>
          <button type="button" className="mk-btn ghost small" onClick={onLocate} disabled={locating}>
            <LocateFixed size={15} aria-hidden="true" /> {locating ? 'Locating…' : 'My Location'}
          </button>
          {signedIn && <Link className="mk-btn soft small" href="/account/addresses"><Plus size={15} aria-hidden="true" /> Add</Link>}
        </div>
      </div>
    </div>
  );
}
