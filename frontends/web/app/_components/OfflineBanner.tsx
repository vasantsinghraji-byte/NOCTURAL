'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { connection } from '@medrush/shared';
import { api } from '@/lib/api';

/**
 * A bar under the header while the site can't reach Nabz: the browser is
 * offline, or requests stopped getting through. It clears on its own once a
 * request gets an answer (re-checked every 15 s), or at once with "Retry".
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) connection.set(false);
    setOnline(connection.isOnline());
    const off = () => connection.set(false);
    // The browser says it's back: confirm with a real request.
    const on = () => { api.health().catch(() => undefined); };
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    const unsubscribe = connection.subscribe(setOnline);
    const stop = connection.startRecheck(() => api.health());
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); unsubscribe(); stop(); };
  }, []);
  if (online) return null;
  const retry = () => {
    setChecking(true);
    api.health().catch(() => undefined).finally(() => setChecking(false));
  };
  return (
    <div className="offline-bar" role="status" aria-live="polite">
      <WifiOff size={16} aria-hidden="true" />
      <span>No connection to Nabz. What you see may be out of date.</span>
      <button type="button" className="offline-retry" onClick={retry} disabled={checking}>{checking ? 'Checking…' : 'Retry'}</button>
    </div>
  );
}
