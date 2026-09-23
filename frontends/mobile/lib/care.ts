import type { CareService } from '@medrush/shared';

export const DEMO_POINT = { lat: 26.9110, lng: 75.8010 }; // launch city demo area (C-Scheme, Jaipur)
export const LAUNCH_CITY = 'Jaipur';


export const shortName = (s: CareService) =>
  (s.displayName || s.name).replace(/ at Home| \(.*\)|Session/g, '').trim();

export const inr = (n: number) => `₹${Math.round(n * 100) / 100}`;

