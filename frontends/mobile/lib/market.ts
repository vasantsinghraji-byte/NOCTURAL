import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { ApiError, type LatLng, type PatientProfile, type SavedAddress, type ShopKind } from '@medrush/shared';
import { api } from './api';
import { useAuth } from './auth';

/**
 * Care marketplace helpers for the apps (mirror frontends/web/lib/care.ts):
 * money and India-time dates without relying on Intl time zones (Hermes),
 * kind labels, API problems with their codes, and the visit location
 * (a saved address or the phone's position).
 */

/** Indian digit grouping: 1,23,456. */
function groupIn(n: number) {
  const s = String(Math.floor(Math.abs(n)));
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  return `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}
/** ₹1,060 for whole rupees, ₹14,844.40 when there are paise. */
export function inr(n: number | null | undefined) {
  if (!Number.isFinite(n as number)) return '–';
  const v = Math.round((n as number) * 100) / 100;
  const paise = Math.round(Math.abs(v) * 100) % 100;
  return `${v < 0 ? '−' : ''}₹${groupIn(v)}${paise ? `.${String(paise).padStart(2, '0')}` : ''}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const IST_MS = 330 * 60000;
/** A date in India time as a UTC-fields Date (read with getUTC*). */
const ist = (d: string) => (d.length === 10 ? new Date(`${d}T00:00:00Z`) : new Date(new Date(d).getTime() + IST_MS));

/** "Mon, 12 Oct" for a YYYY-MM-DD (India time) or an ISO instant. */
export function fmtDay(d: string) {
  const x = ist(d);
  return `${DAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`;
}
export function fmtLongDay(d: string) {
  const x = ist(d);
  return `${LONG_DAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${LONG_MONTHS[x.getUTCMonth()]}`;
}
/** "17:30" → "5:30 pm" */
export function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}
/** Clock time of an ISO instant in India: "5:30 pm". */
export function fmtClock(iso: string) {
  const x = ist(iso);
  return fmtTime(`${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}`);
}
/** "12 Oct, 5:30 pm" for an ISO instant. */
export const fmtStamp = (iso: string) => { const x = ist(iso); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}, ${fmtClock(iso)}`; };
export const todayIst = () => new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
export const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_NAMES = LONG_DAYS;
export const dayShort = (d: string) => DAYS[weekdayOf(d)];
export function hoursLabel(minutes: number) {
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  return minutes > 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

export type CareKind = Exclude<ShopKind, 'LAB'>;
export const KINDS: Record<ShopKind, { label: string; plural: string; art: 'physio' | 'homecare' | 'heart' | 'lab'; pitch: string; unit: string }> = {
  PHYSIO: { label: 'Physiotherapy', plural: 'physiotherapists', art: 'physio', pitch: 'Compare physios near you, at home or at their clinic.', unit: 'session' },
  HOMECARE: { label: 'Home care', plural: 'caregivers', art: 'homecare', pitch: 'The same trusted caregiver at home, on the days and hours you choose.', unit: 'shift' },
  NURSING: { label: 'Nursing', plural: 'nurses', art: 'heart', pitch: 'Planned nursing visits from verified nurses.', unit: 'visit' },
  LAB: { label: 'Lab tests', plural: 'labs', art: 'lab', pitch: 'Compare labs, collect at home, reports on your phone.', unit: 'test' }
};

/** A friendly message for an API error, plus its machine code. */
export function problem(err: unknown): { message: string; code?: string; details?: any } {
  if (err instanceof ApiError) return { message: err.message, code: err.code, details: err.details };
  const message = err instanceof Error ? err.message : '';
  if (/network request failed|failed to fetch|timeout/i.test(message)) return { message: 'Can’t reach Nabz. Check your internet connection and try again.' };
  return { message: message || 'Something went wrong. Please try again.' };
}

/** The signed-in customer's profile (name, phone, saved addresses); refreshable. */
export function useMe() {
  const { session } = useAuth();
  const [me, setMe] = useState<PatientProfile | null>(null);
  const reload = useCallback(() => {
    if (session?.kind !== 'patient') { setMe(null); return Promise.resolve(); }
    return api.me().then((r) => setMe(r.patient)).catch(() => undefined);
  }, [session?.kind, session?.token]);
  useEffect(() => { reload(); }, [reload]);
  return { me, signedIn: session?.kind === 'patient', reload };
}

export interface VisitPlace {
  label: string;
  coords: LatLng | null;
  addressId?: string;
  address?: { street: string; city?: string; pincode?: string; landmark?: string; coordinates: LatLng };
}

export const usableAddresses = (saved?: SavedAddress[]) =>
  (saved || []).filter((a) => a._id && Number.isFinite(Number(a.coordinates?.lat)) && Number.isFinite(Number(a.coordinates?.lng)));

export function fromSaved(a: SavedAddress): VisitPlace {
  const coords = { lat: Number(a.coordinates?.lat), lng: Number(a.coordinates?.lng) };
  return {
    label: a.label ? `${a.label}: ${a.street || ''}`.replace(/: $/, '') : a.street || 'Saved address',
    coords,
    addressId: a._id,
    address: { street: a.street || a.label || 'Saved address', city: a.city, pincode: a.pincode, landmark: a.landmark, coordinates: coords }
  };
}

/** Where the care happens: the default saved address, else the phone's position once asked. */
export function useVisitPlace(saved: SavedAddress[] | undefined) {
  const [place, setPlace] = useState<VisitPlace>({ label: 'Choose address', coords: null });
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (place.coords) return;
    const withPin = usableAddresses(saved);
    const def = withPin.find((a) => a.isDefault) || withPin[0];
    if (def) setPlace(fromSaved(def));
  }, [saved, place.coords]);

  const useMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return false;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      let label = 'Current location';
      let street = 'Current location';
      let city: string | undefined;
      let pincode: string | undefined;
      try {
        const [a] = await Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng });
        if (a) {
          street = [a.name, a.street, a.district].filter(Boolean).join(', ') || street;
          city = a.city || a.subregion || undefined;
          pincode = a.postalCode || undefined;
          label = [a.district || a.street || a.name, city].filter(Boolean).join(', ') || label;
        }
      } catch { /* the name is a nicety */ }
      setPlace({ label, coords, address: { street, city, pincode, coordinates: coords } });
      return true;
    } catch {
      return false;
    } finally {
      setLocating(false);
    }
  }, []);

  return { place, setPlace, useMyLocation, locating };
}

/** The visit address part of a quote / order body. */
export function placeBody(place: VisitPlace) {
  if (place.addressId) return { addressId: place.addressId };
  if (place.coords) return { address: place.address || { street: place.label, coordinates: place.coords } };
  return {};
}

export const PLAN_STATUS_LABEL: Record<'PENDING_PAYMENT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED', string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired'
};

export const LAB_STATUS_LABEL: Record<'SCHEDULED' | 'COLLECTED' | 'AT_LAB' | 'PROCESSING' | 'REPORT_READY' | 'SAMPLE_REJECTED' | 'CANCELLED', string> = {
  SCHEDULED: 'Collection booked',
  COLLECTED: 'Sample collected',
  AT_LAB: 'At the lab',
  PROCESSING: 'Testing',
  REPORT_READY: 'Report ready',
  SAMPLE_REJECTED: 'New sample needed',
  CANCELLED: 'Cancelled'
};

export const SESSION_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirmed', ASSIGNED: 'Confirmed', REQUESTED: 'Needs a new time', EN_ROUTE: 'On the way',
  IN_PROGRESS: 'In progress', COMPLETED: 'Done', CANCELLED: 'Cancelled'
};
