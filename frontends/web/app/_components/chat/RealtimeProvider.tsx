'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PhoneCall, PhoneOff } from 'lucide-react';
import { RealtimeClient, type IncomingCall, type RealtimeEvent } from '@medrush/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Listener = (e: RealtimeEvent) => void;
interface Live {
  client: RealtimeClient | null;
  connected: boolean;
  unread: number;
  refreshUnread: () => void;
  /** Events on my inbox channel (new messages, calls). */
  onInbox: (fn: Listener) => () => void;
}

const LiveContext = createContext<Live>({ client: null, connected: false, unread: 0, refreshUnread: () => undefined, onInbox: () => () => undefined });
export const useLive = () => useContext(LiveContext);

const RENEW_MS = 50 * 60 * 1000; // tokens last an hour

/**
 * One live connection per signed-in account (customer or partner): new
 * messages, the unread badge and incoming calls on every page.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { patient } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [client, setClient] = useState<RealtimeClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const listeners = useRef(new Set<Listener>());
  const signedOut = useRef(false);

  const refreshUnread = useCallback(() => {
    api.chatUnread().then((r) => setUnread(r.unread)).catch(() => undefined);
  }, []);

  // (Re)connect when someone signs in, and renew before the token expires.
  useEffect(() => {
    if (client) return undefined;
    let cancelled = false;
    api.chatRealtime().then(({ realtime }) => {
      signedOut.current = false;
      refreshUnread();
      if (cancelled || !realtime.enabled || !realtime.realtimeUrl || !realtime.httpHost || !realtime.token || !realtime.channels) return;
      const c = new RealtimeClient({ url: realtime.realtimeUrl, host: realtime.httpHost, token: realtime.token });
      c.onState(setConnected);
      c.subscribe(realtime.channels.inbox, realtime.token, (e) => {
        if (e.type === 'message') setUnread((n) => n + 1);
        if (e.type === 'call.incoming' && e.call) setIncoming(e.call as IncomingCall);
        if (e.type === 'call.ended') setIncoming((cur) => (cur && cur._id === e.callId ? null : cur));
        listeners.current.forEach((l) => l(e));
      });
      c.connect();
      setClient(c);
    }).catch(() => { signedOut.current = true; });
    return () => { cancelled = true; };
  }, [client, patient, pathname, refreshUnread]);

  useEffect(() => {
    if (!client) return undefined;
    const t = setTimeout(() => { client.close(); setClient(null); }, RENEW_MS);
    return () => clearTimeout(t);
  }, [client]);

  // Signed out (patient gone): drop the connection.
  useEffect(() => {
    if (client && patient === null && signedOut.current) { client.close(); setClient(null); }
  }, [client, patient]);

  useEffect(() => () => { if (client) client.close(); }, [client]);

  // Stop ringing after the ring time.
  useEffect(() => {
    if (!incoming) return undefined;
    const t = setTimeout(() => setIncoming(null), (incoming.ringSeconds || 45) * 1000);
    return () => clearTimeout(t);
  }, [incoming]);

  const onInbox = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);

  const answer = () => {
    const c = incoming;
    setIncoming(null);
    if (c) router.push(`/chat/${c.thread}?answer=${c._id}`);
  };
  const decline = () => {
    const c = incoming;
    setIncoming(null);
    if (c) api.endCall(c._id, 'decline').catch(() => undefined);
  };

  return (
    <LiveContext.Provider value={{ client, connected, unread, refreshUnread, onInbox }}>
      {children}
      {incoming && (
        <div className="call-toast" role="alertdialog" aria-labelledby="incoming-title" aria-describedby="incoming-sub">
          <span className="call-toast-pulse" aria-hidden="true"><PhoneCall size={22} /></span>
          <div className="grow">
            <b id="incoming-title">{incoming.from.name} is calling</b>
            <div id="incoming-sub" className="call-toast-sub">{incoming.title || 'Nabz voice call'}</div>
          </div>
          <button type="button" className="call-btn decline" onClick={decline} aria-label="Decline call"><PhoneOff size={20} aria-hidden="true" /></button>
          <button type="button" className="call-btn answer" onClick={answer} aria-label="Answer call"><PhoneCall size={20} aria-hidden="true" /></button>
        </div>
      )}
    </LiveContext.Provider>
  );
}
