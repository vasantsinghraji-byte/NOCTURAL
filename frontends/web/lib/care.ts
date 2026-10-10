'use client';

/**
 * Care marketplace helpers for the website: money and India-time dates, kind
 * labels, and the visit location (a saved address or the browser's position).
 */
import { useCallback, useEffect, useState } from 'react';
import type { ShopKind, SavedAddress, LatLng } from '@medrush/shared';
import { ApiError } from '@medrush/shared';
import { loadDeliveryCoords, saveDeliveryCoords } from './location';

const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₹1,060 for whole rupees, ₹14,844.40 when there are paise. */
export const inr = (n: number | null | undefined) => {
  if (!Number.isFinite(n as number)) return '–';
  const v = n as number;
  return Math.round(v * 100) % 100 === 0 ? inrWhole.format(v) : inrPaise.format(v);
};

const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const longFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
/** "Mon, 12 Oct" for a YYYY-MM-DD (India time) or an ISO date. */
export const fmtDay = (d: string) => dayFmt.format(new Date(d.length === 10 ? `${d}T06:00:00Z` : d));
export const fmtLongDay = (d: string) => longFmt.format(new Date(d.length === 10 ? `${d}T06:00:00Z` : d));
/** "17:30" → "5:30 pm" */
export function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}
export const todayIst = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
export const weekdayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function hoursLabel(minutes: number) {
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  return minutes > 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

export const KINDS: Record<'PHYSIO' | 'HOMECARE' | 'NURSING' | 'LAB', { label: string; plural: string; path: string; art: 'physio' | 'homecare' | 'heart' | 'lab'; pitch: string; unit: string }> = {
  PHYSIO: { label: 'Physiotherapy', plural: 'physiotherapists', path: '/care/physio', art: 'physio', pitch: 'Compare physios near you, at home or at their clinic.', unit: 'session' },
  HOMECARE: { label: 'Home care', plural: 'caregivers', path: '/care/homecare', art: 'homecare', pitch: 'The same trusted caregiver at home, on the days and hours you choose.', unit: 'shift' },
  NURSING: { label: 'Nursing', plural: 'nurses', path: '/care/nursing', art: 'heart', pitch: 'Planned nursing visits from verified nurses.', unit: 'visit' },
  LAB: { label: 'Lab tests', plural: 'labs', path: '/lab-tests', art: 'lab', pitch: 'Compare labs, collect at home, reports on your phone.', unit: 'test' }
};
export const kindFromSlug = (slug: string): ShopKind | null => ({ physio: 'PHYSIO', homecare: 'HOMECARE', nursing: 'NURSING' } as Record<string, ShopKind>)[slug] || null;

/** A friendly message for an API error, plus its machine code. */
export function problem(err: unknown): { message: string; code?: string; details?: any } {
  if (err instanceof ApiError) return { message: err.message, code: err.code, details: err.details };
  return { message: err instanceof Error ? err.message : 'Something went wrong. Please try again.' };
}

export interface VisitPlace {
  label: string;
  coords: LatLng | null;
  addressId?: string;
  address?: { street: string; city?: string; pincode?: string; landmark?: string; coordinates: LatLng };
}

/**
 * Where the care happens: a saved address (default first), else the last
 * browser position, else nothing until the customer picks.
 */
export function useVisitPlace(saved: SavedAddress[] | undefined) {
  const [place, setPlace] = useState<VisitPlace>({ label: 'Choose address', coords: null });
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (place.coords) return;
    const withPin = (saved || []).filter((a) => Number.isFinite(a.coordinates?.lat) && Number.isFinite(a.coordinates?.lng));
    const def = withPin.find((a) => a.isDefault) || withPin[0];
    if (def) {
      setPlace(fromSaved(def));
      return;
    }
    const last = loadDeliveryCoords();
    if (last) setPlace({ label: 'Near your last location', coords: last });
  }, [saved, place.coords]);

  const useMyLocation = useCallback(() => new Promise<void>((resolve) => {
    if (!('geolocation' in navigator)) { resolve(); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition((pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      saveDeliveryCoords(coords);
      setPlace({ label: 'Current location', coords });
      setLocating(false);
      resolve();
    }, () => { setLocating(false); resolve(); }, { enableHighAccuracy: true, timeout: 10000 });
  }), []);

  return { place, setPlace, useMyLocation, locating };
}

export function fromSaved(a: SavedAddress): VisitPlace {
  const coords = { lat: Number(a.coordinates?.lat), lng: Number(a.coordinates?.lng) };
  return {
    label: a.label || a.street || 'Saved address',
    coords,
    addressId: a._id,
    address: { street: a.street || a.label || 'Saved address', city: a.city, pincode: a.pincode, landmark: a.landmark, coordinates: coords }
  };
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
