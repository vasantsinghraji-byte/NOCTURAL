'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LocateFixed, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type { SavedAddress } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { problem } from '@/lib/care';
import { confirmDialog } from '../../_components/Dialog';
import CareArt from '../../_components/care/CareArt';

type Draft = { _id?: string; label: string; street: string; landmark: string; city: string; state: string; pincode: string; lat?: number; lng?: number; isDefault: boolean };
const EMPTY: Draft = { label: '', street: '', landmark: '', city: '', state: 'Rajasthan', pincode: '', isDefault: false };

/**
 * Saved places for visits and deliveries ("Mom's home", "Office"). Each one
 * carries a map pin: home visits and travel fees are measured from it.
 */
export default function Addresses() {
  const { patient, loading, refresh } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  if (!loading && !patient) return <div className="mk-empty"><div className="art"><CareArt kind="homecare" /></div><strong>Sign in to save addresses</strong><Link className="mk-btn" href="/login?next=/account/addresses">Sign In</Link></div>;
  const saved = patient?.savedAddresses || [];

  const edit = (a: SavedAddress) => setDraft({ _id: a._id, label: a.label || '', street: a.street || '', landmark: a.landmark || '', city: a.city || '', state: a.state || '', pincode: a.pincode || '', lat: a.coordinates?.lat, lng: a.coordinates?.lng, isDefault: Boolean(a.isDefault) });
  const pin = () => {
    if (!('geolocation' in navigator) || !draft) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setDraft((d) => (d ? { ...d, lat: pos.coords.latitude, lng: pos.coords.longitude } : d)); setLocating(false); },
      () => { setError('Allow location access, or stand at the address and try again.'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError('');
    const body = {
      label: draft.label.trim() || undefined, street: draft.street.trim(), landmark: draft.landmark.trim() || undefined,
      city: draft.city.trim(), state: draft.state.trim(), pincode: draft.pincode.trim(), isDefault: draft.isDefault,
      ...(Number.isFinite(draft.lat) && Number.isFinite(draft.lng) ? { coordinates: { lat: draft.lat as number, lng: draft.lng as number } } : {})
    };
    try {
      if (draft._id) await api.updateAddress(draft._id, body); else await api.addAddress(body);
      await refresh();
      setDraft(null);
    } catch (err) { setError(problem(err).message); } finally { setSaving(false); }
  };
  const remove = async (a: SavedAddress) => {
    if (!a._id || !(await confirmDialog({ title: `Delete ${a.label || 'this address'}?`, message: 'Booked visits keep their address.', confirmLabel: 'Delete', danger: true }))) return;
    try { await api.deleteAddress(a._id); await refresh(); } catch (err) { setError(problem(err).message); }
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="mk-toolbar">
        <h1 className="mk-h2" style={{ fontSize: 32, margin: 0 }}>Saved addresses</h1>
        {!draft && <button type="button" className="mk-btn" onClick={() => setDraft({ ...EMPTY, isDefault: saved.length === 0 })}><Plus size={16} aria-hidden="true" /> Add Address</button>}
      </div>
      <p className="mk-meta">Book care for your parents’ home, your office or anywhere else. Pin each address on the spot so travel fees are right.</p>
      {error && <p className="mk-note" role="alert">{error}</p>}

      {draft && (
        <form className="mk-card" onSubmit={save} style={{ display: 'grid', gap: 14, marginBottom: 18 }} aria-labelledby="addr-form-title">
          <h2 id="addr-form-title" className="mk-title" style={{ fontSize: 20 }}>{draft._id ? 'Edit address' : 'New address'}</h2>
          <div className="mk-chips" role="group" aria-label="Quick label" style={{ padding: 0 }}>
            {['Home', 'Mom’s home', 'Dad’s home', 'Office'].map((l) => <button key={l} type="button" className="mk-chip" aria-pressed={draft.label === l} onClick={() => setDraft({ ...draft, label: l })}>{l}</button>)}
          </div>
          <div className="mk-split">
            <div className="mk-field"><label htmlFor="a-label">Label</label><input id="a-label" name="label" className="mk-input" autoComplete="off" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Nani’s house…" maxLength={50} /></div>
            <div className="mk-field"><label htmlFor="a-pin">Pincode</label><input id="a-pin" name="postal-code" className="mk-input" autoComplete="postal-code" inputMode="numeric" required value={draft.pincode} onChange={(e) => setDraft({ ...draft, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></div>
          </div>
          <div className="mk-field"><label htmlFor="a-street">House, street and area</label><input id="a-street" name="street-address" className="mk-input" autoComplete="street-address" required value={draft.street} onChange={(e) => setDraft({ ...draft, street: e.target.value })} /></div>
          <div className="mk-split">
            <div className="mk-field"><label htmlFor="a-landmark">Landmark</label><input id="a-landmark" name="landmark" className="mk-input" autoComplete="off" value={draft.landmark} onChange={(e) => setDraft({ ...draft, landmark: e.target.value })} placeholder="Near…" /></div>
            <div className="mk-field"><label htmlFor="a-city">City</label><input id="a-city" name="address-level2" className="mk-input" autoComplete="address-level2" required value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></div>
          </div>
          <div className="mk-field"><label htmlFor="a-state">State</label><input id="a-state" name="address-level1" className="mk-input" autoComplete="address-level1" required value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value })} /></div>

          <div className="mk-card" style={{ background: 'var(--card-alt)', border: 0, display: 'grid', gap: 10 }}>
            <div className="mk-row" style={{ flexWrap: 'wrap' }}>
              <MapPin size={18} aria-hidden="true" />
              <span className="grow" style={{ fontWeight: 600 }}>{Number.isFinite(draft.lat) ? 'Pinned on the map' : 'Not pinned yet: home visits need a pin'}</span>
              <button type="button" className="mk-btn ghost small" onClick={pin} disabled={locating}><LocateFixed size={14} aria-hidden="true" /> {locating ? 'Locating…' : 'Pin My Current Location'}</button>
            </div>
            {Number.isFinite(draft.lat) && Number.isFinite(draft.lng) && (
              <iframe
                title="Pinned location"
                width="100%"
                height="200"
                style={{ border: 0, borderRadius: 16 }}
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${(draft.lng as number) - 0.004}%2C${(draft.lat as number) - 0.003}%2C${(draft.lng as number) + 0.004}%2C${(draft.lat as number) + 0.003}&layer=mapnik&marker=${draft.lat}%2C${draft.lng}`}
              />
            )}
            <p className="mk-help" style={{ margin: 0 }}>Tip: for a parent’s home, pin it the next time you’re there, or ask them to save it from their phone.</p>
          </div>
          <label className="mk-row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} /> Use as my default address</label>
          <div className="mk-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="mk-btn ghost" onClick={() => setDraft(null)}>Cancel</button>
            <button type="submit" className="mk-btn" disabled={saving}>{saving ? 'Saving…' : 'Save Address'}</button>
          </div>
        </form>
      )}

      {saved.length === 0 && !draft && <div className="mk-empty"><div className="art"><CareArt kind="homecare" /></div><strong>No saved addresses</strong><span>Add your home and your family’s homes to book for them in a tap.</span></div>}
      <div className="mk-list">
        {saved.map((a) => (
          <article key={a._id} className="mk-card" style={{ padding: 14 }}>
            <div className="mk-row" style={{ flexWrap: 'wrap' }}>
              <span className="mk-tile"><MapPin size={20} aria-hidden="true" /></span>
              <div className="grow">
                <p className="mk-title" style={{ fontSize: 16 }}>{a.label || 'Address'} {a.isDefault && <span className="mk-badge red"><Star size={11} aria-hidden="true" /> Default</span>}</p>
                <p className="mk-meta" style={{ margin: 0 }}>{[a.street, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')}</p>
                {!a.coordinates?.lat && <p className="mk-error" style={{ margin: '4px 0 0' }}>Pin this address to use it for home visits.</p>}
              </div>
              <button type="button" className="mk-icon-btn" aria-label={`Edit ${a.label || 'address'}`} onClick={() => edit(a)}><Pencil size={16} aria-hidden="true" /></button>
              <button type="button" className="mk-icon-btn" aria-label={`Delete ${a.label || 'address'}`} onClick={() => remove(a)}><Trash2 size={16} aria-hidden="true" /></button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
