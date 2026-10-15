import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { router } from 'expo-router';
import { Phone, PhoneOff } from 'lucide-react-native';
import { RealtimeClient, type CallBundle, type IncomingCall, type RealtimeEvent } from '@medrush/shared';
import { api } from './api';
import { useAuth } from './auth';
import { notifyLocal } from './notifications';
import { PhotoAvatar } from './profilePhoto';
import { C, F } from './theme';

type Listener = (e: RealtimeEvent) => void;
interface Live {
  connected: boolean;
  unread: number;
  refreshUnread: () => void;
  onInbox: (fn: Listener) => () => void;
}

const LiveContext = createContext<Live>({ connected: false, unread: 0, refreshUnread: () => undefined, onInbox: () => () => undefined });
export const useLive = () => useContext(LiveContext);

/** The call to show on the call screen (set before navigating to /call). */
let pendingCall: { bundle: CallBundle; role: 'caller' | 'callee'; peer: { name: string; photoUrl?: string }; thread: string } | null = null;
export const setPendingCall = (c: typeof pendingCall) => { pendingCall = c; };
export const takePendingCall = () => { const c = pendingCall; pendingCall = null; return c; };

const RENEW_MS = 50 * 60 * 1000;
const RING = [0, 900, 700];

/**
 * One live connection for the signed-in customer or partner: unread count,
 * new-message events and incoming calls (full-screen, vibrating) anywhere in
 * the app. Calls also post a phone notification.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [epoch, setEpoch] = useState(0);
  const listeners = useRef(new Set<Listener>());

  const refreshUnread = useCallback(() => { api.chatUnread().then((r) => setUnread(r.unread)).catch(() => undefined); }, []);

  useEffect(() => {
    if (!session) { setUnread(0); return undefined; }
    let client: RealtimeClient | null = null;
    let cancelled = false;
    refreshUnread();
    api.chatRealtime().then(({ realtime }) => {
      if (cancelled || !realtime.enabled || !realtime.realtimeUrl || !realtime.httpHost || !realtime.token || !realtime.channels) return;
      client = new RealtimeClient({ url: realtime.realtimeUrl, host: realtime.httpHost, token: realtime.token });
      client.onState(setConnected);
      client.subscribe(realtime.channels.inbox, realtime.token, (e) => {
        if (e.type === 'message') setUnread((n) => n + 1);
        if (e.type === 'call.incoming' && e.call) {
          const call = e.call as IncomingCall;
          setIncoming(call);
          if (AppState.currentState !== 'active') notifyLocal(`${call.from.name} is calling`, 'Open Nabz to answer', { callThread: call.thread }).catch(() => undefined);
        }
        if (e.type === 'call.ended') setIncoming((cur) => (cur && cur._id === e.callId ? null : cur));
        listeners.current.forEach((l) => l(e));
      });
      client.connect();
    }).catch(() => undefined);
    const renew = setTimeout(() => setEpoch((n) => n + 1), RENEW_MS);
    // Coming back to the app: reconnect (the OS may have closed the socket).
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { refreshUnread(); if (client && !client.connected) setEpoch((n) => n + 1); } });
    return () => { cancelled = true; clearTimeout(renew); sub.remove(); if (client) client.close(); setConnected(false); };
  }, [session?.token, epoch, refreshUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!incoming) { Vibration.cancel(); return undefined; }
    Vibration.vibrate(RING, true);
    const t = setTimeout(() => setIncoming(null), (incoming.ringSeconds || 45) * 1000);
    return () => { clearTimeout(t); Vibration.cancel(); };
  }, [incoming]);

  const onInbox = useCallback((fn: Listener) => { listeners.current.add(fn); return () => { listeners.current.delete(fn); }; }, []);

  const answer = async () => {
    const c = incoming;
    setIncoming(null);
    if (!c) return;
    try {
      const bundle = await api.acceptCall(c._id);
      setPendingCall({ bundle, role: 'callee', peer: c.from, thread: c.thread });
      router.push('/call');
    } catch {
      router.push(`/chat/${c.thread}`);
    }
  };
  const decline = () => {
    const c = incoming;
    setIncoming(null);
    if (c) api.endCall(c._id, 'decline').catch(() => undefined);
  };

  return (
    <LiveContext.Provider value={{ connected, unread, refreshUnread, onInbox }}>
      {children}
      <Modal visible={!!incoming} animationType="fade" transparent={false} onRequestClose={decline} statusBarTranslucent>
        {incoming ? (
          <View style={s.screen}>
            <View style={s.top}>
              <Text style={s.kicker}>Nabz voice call</Text>
              <View style={s.ring}><PhotoAvatar name={incoming.from.name} url={incoming.from.photoUrl} size={120} /></View>
              <Text style={s.name} accessibilityRole="header">{incoming.from.name}</Text>
              <Text style={s.sub}>{incoming.title || 'is calling you'}</Text>
            </View>
            <View style={s.actions}>
              <View style={s.action}>
                <Pressable onPress={decline} style={[s.btn, { backgroundColor: '#e5484d' }]} accessibilityRole="button" accessibilityLabel="Decline call">
                  <PhoneOff size={30} color="#ffffff" />
                </Pressable>
                <Text style={s.actionText}>Decline</Text>
              </View>
              <View style={s.action}>
                <Pressable onPress={answer} style={[s.btn, { backgroundColor: '#1f9d6b' }]} accessibilityRole="button" accessibilityLabel="Answer call">
                  <Phone size={30} color="#ffffff" />
                </Pressable>
                <Text style={s.actionText}>Answer</Text>
              </View>
            </View>
          </View>
        ) : null}
      </Modal>
    </LiveContext.Provider>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.wine, justifyContent: 'space-between', paddingTop: 90, paddingBottom: 70 },
  top: { alignItems: 'center', gap: 10 },
  kicker: { color: C.onNightMuted, fontFamily: F.bold, fontSize: 14, letterSpacing: 1, textTransform: 'uppercase' },
  ring: { padding: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 18 },
  name: { color: '#ffffff', fontFamily: F.display, fontSize: 32, marginTop: 12, textAlign: 'center', paddingHorizontal: 24 },
  sub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 16, textAlign: 'center', paddingHorizontal: 24 },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly' },
  action: { alignItems: 'center', gap: 10 },
  btn: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#ffffff', fontFamily: F.bold, fontSize: 15 }
});
