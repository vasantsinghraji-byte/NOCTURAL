/**
 * Last delivery point the patient browsed from (storefront geolocation).
 * Checkout sends it as `deliveryLocation` so the API can check the store
 * really delivers there and snapshot distance + ETA on the order.
 */
export interface Coords { lat: number; lng: number }

const KEY = 'medrush:deliveryCoords';

export function saveDeliveryCoords(coords: Coords): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(coords));
  } catch {
    /* storage unavailable (private mode) — checkout just skips the geo check */
  }
}

export function loadDeliveryCoords(): Coords | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lng) ? parsed : null;
  } catch {
    return null;
  }
}
