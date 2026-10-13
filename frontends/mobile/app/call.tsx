import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Mic, MicOff, PhoneOff, ShieldCheck, Volume2, VolumeX } from 'lucide-react-native';
import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import { CallSession, RealtimeClient, type CallState } from '@medrush/shared';
import { api } from '@/lib/api';
import { takePendingCall } from '@/lib/live';
import { PhotoAvatar } from '@/lib/profilePhoto';
import { C, F } from '@/lib/theme';

const LABEL: Record<CallState, string> = {
  connecting: 'Connecting…', ringing: 'Ringing…', connected: '', reconnecting: 'Reconnecting…', ended: 'Call ended', failed: 'Couldn’t connect the call'
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * A live voice call (react-native-webrtc). Opened after starting a call from a
 * conversation, or answering one. Audio is end-to-end encrypted by WebRTC.
 */
export default function CallScreen() {
  const [call] = useState(takePendingCall);
  const [state, setState] = useState<CallState>('connecting');
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const session = useRef<CallSession | null>(null);
  const client = useRef<RealtimeClient | null>(null);
  const closed = useRef(false);

  const finish = (reason?: 'timeout' | 'hangup' | 'failed') => {
    if (closed.current || !call) return;
    closed.current = true;
    session.current?.hangup();
    client.current?.close();
    try { InCallManager.stop(); } catch { /* not started */ }
    api.endCall(call.bundle.call._id, reason).catch(() => undefined);
    setTimeout(() => (router.canGoBack() ? router.back() : router.replace(`/chat/${call.thread}`)), 900);
  };

  useEffect(() => {
    if (!call) { router.back(); return undefined; }
    const rt = call.bundle.realtime;
    if (!rt) { setState('failed'); setError('Live calling isn’t available right now.'); return undefined; }
    let cancelled = false;
    (async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
          title: 'Allow the microphone', message: 'Nabz needs the microphone for voice calls.', buttonPositive: 'Allow'
        });
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) { setState('failed'); setError('Allow the microphone in Settings to make calls.'); return; }
      }
      if (cancelled) return;
      InCallManager.start({ media: 'audio' });
      InCallManager.setKeepScreenOn(true);
      InCallManager.setForceSpeakerphoneOn(false);
      const c = new RealtimeClient({ url: rt.realtimeUrl, host: rt.httpHost, token: rt.token });
      client.current = c;
      c.connect();
      const s = new CallSession({
        rtc: { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, getUserMedia: (k) => mediaDevices.getUserMedia(k) },
        client: c,
        bundle: call.bundle,
        role: call.role,
        onState: (st) => { setState(st); if (st === 'ended' && !closed.current) finish(); }
      });
      session.current = s;
      await s.start().catch((e) => { setState('failed'); setError((e && e.message) || 'Couldn’t start the call.'); });
    })();
    return () => { cancelled = true; session.current?.end(); client.current?.close(); try { InCallManager.stop(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!call || call.role !== 'caller' || state !== 'ringing') return undefined;
    const t = setTimeout(() => finish('timeout'), 45000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (state !== 'connected') return undefined;
    const t = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  if (!call) return null;
  const toggleMute = () => { const m = !muted; setMuted(m); session.current?.setMuted(m); };
  const toggleSpeaker = () => { const sp = !speaker; setSpeaker(sp); try { InCallManager.setForceSpeakerphoneOn(sp); } catch { /* ignore */ } };

  return (
    <View style={s.screen}>
      <View style={s.top}>
        <View style={s.ring}><PhotoAvatar name={call.peer.name} url={call.peer.photoUrl} size={120} /></View>
        <Text style={s.name} accessibilityRole="header">{call.peer.name}</Text>
        <Text style={s.status} accessibilityLiveRegion="polite">{state === 'connected' ? mmss(seconds) : LABEL[state]}</Text>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={s.secure}><ShieldCheck size={14} color={C.onNightMuted} /><Text style={s.secureText}>End-to-end encrypted voice call</Text></View>
      </View>
      <View style={s.actions}>
        <Control label={muted ? 'Unmute' : 'Mute'} on={muted} onPress={toggleMute} icon={muted ? MicOff : Mic} />
        <View style={s.action}>
          <Pressable onPress={() => finish(state === 'failed' ? 'failed' : 'hangup')} style={[s.btn, s.hang]} accessibilityRole="button" accessibilityLabel="Hang up">
            <PhoneOff size={32} color="#ffffff" />
          </Pressable>
          <Text style={s.actionText}>End</Text>
        </View>
        <Control label={speaker ? 'Speaker on' : 'Speaker'} on={speaker} onPress={toggleSpeaker} icon={speaker ? Volume2 : VolumeX} />
      </View>
    </View>
  );
}

function Control({ label, on, onPress, icon: Icon }: { label: string; on: boolean; onPress: () => void; icon: typeof Mic }) {
  return (
    <View style={s.action}>
      <Pressable onPress={onPress} style={[s.btn, on && { backgroundColor: '#ffffff' }]} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label}>
        <Icon size={28} color={on ? C.wine : '#ffffff'} />
      </Pressable>
      <Text style={s.actionText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.wine, justifyContent: 'space-between', paddingTop: 100, paddingBottom: 70 },
  top: { alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  ring: { padding: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  name: { color: '#ffffff', fontFamily: F.display, fontSize: 32, marginTop: 16, textAlign: 'center' },
  status: { color: C.onNightMuted, fontFamily: F.semi, fontSize: 18, fontVariant: ['tabular-nums'] },
  error: { color: '#ffd3da', fontFamily: F.bold, fontSize: 14, textAlign: 'center' },
  secure: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, opacity: 0.85 },
  secureText: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  action: { alignItems: 'center', gap: 10, width: 96 },
  btn: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  hang: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#e5484d' },
  actionText: { color: '#ffffff', fontFamily: F.bold, fontSize: 14, textAlign: 'center' }
});
