import { useEffect, useState } from 'react';

/**
 * "Book for Mom": who the next booking is for, set from the Care Circle and
 * picked up by the booking flow (prefills "Someone else"). Lives in memory for
 * this app session only; cleared after a booking or when the person cancels.
 */
export interface BookingFor { name: string; relation?: string; memberId?: string }

let current: BookingFor | null = null;
const listeners = new Set<(v: BookingFor | null) => void>();

export function setBookingFor(v: BookingFor | null) {
  current = v;
  listeners.forEach((l) => l(v));
}

export function getBookingFor() {
  return current;
}

export function useBookingFor() {
  const [v, setV] = useState<BookingFor | null>(current);
  useEffect(() => {
    listeners.add(setV);
    return () => { listeners.delete(setV); };
  }, []);
  return v;
}
