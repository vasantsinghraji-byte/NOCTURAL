'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, ShieldCheck } from 'lucide-react';
import { CallSession, RealtimeClient, type CallBundle, type CallState } from '@medrush/shared';
import { api } from '@/lib/api';
import { Avatar } from '../ProfilePhoto';

const LABEL: Record<CallState, string> = {
  connecting: 'Connecting…',
  ringing: 'Ringing…',
  connected: '',
  reconnecting: 'Reconnecting…',
  ended: 'Call ended',
  failed: 'Couldn’t connect the call'
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * A live voice call (browser WebRTC). The caller's side rings for the
 * server's ring time, then ends as missed. Audio is end-to-end encrypted.
 */
export default function CallPanel({ bundle, role, peer, onClose }: {
  bundle: CallBundle;
  role: 'caller' | 'callee';
  peer: { name: string; photoUrl?: string };
  onClose: (summary: string) => void;
}) {
  const [state, setState] = useState<CallState>('connecting');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const session = useRef<CallSession | null>(null);
  const client = useRef<RealtimeClient | null>(null);
  const closed = useRef(false);

  const finish = (summary: string, reason?: 'timeout' | 'hangup' | 'failed') => {
    if (closed.current) return;
    closed.current = true;
    session.current?.hangup();
    client.current?.close();
    api.endCall(bundle.call._id, reason).catch(() => undefined).finally(() => onClose(summary));
  };

  useEffect(() => {
    const rt = bundle.realtime;
    if (!rt || typeof window === 'undefined' || !window.RTCPeerConnection || !navigator.mediaDevices) {
      setState('failed');
      setError(!rt ? 'Live calling isn’t available right now.' : 'This browser can’t make calls.');
      return undefined;
    }
    const c = new RealtimeClient({ url: rt.realtimeUrl, host: rt.httpHost, token: rt.token });
    client.current = c;
    c.connect();
    const s = new CallSession({
      rtc: { RTCPeerConnection: window.RTCPeerConnection, getUserMedia: (k) => navigator.mediaDevices.getUserMedia(k) },
      client: c,
      bundle,
      role,
      onState: (st) => {
        setState(st);
        if (st === 'ended' && !closed.current) finish('Call ended');
      },
      onRemoteStream: (stream) => { if (audio.current) { audio.current.srcObject = stream; audio.current.play().catch(() => undefined); } }
    });
    session.current = s;
    s.start().catch((e) => {
      setState('failed');
      setError(e && e.name === 'NotAllowedError' ? 'Allow the microphone to make calls.' : (e && e.message) || 'Couldn’t start the call.');
    });
    return () => { s.end(); c.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ringing too long: missed.
  useEffect(() => {
    if (role !== 'caller' || state !== 'ringing') return undefined;
    const t = setTimeout(() => finish('No answer', 'timeout'), 45000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, state]);

  useEffect(() => {
    if (state !== 'connected') return undefined;
    const t = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  const toggleMute = () => { const m = !muted; setMuted(m); session.current?.setMuted(m); };

  return (
    <div className="call-panel" role="dialog" aria-modal="true" aria-labelledby="call-peer">
      <div className="call-peer">
        <Avatar name={peer.name} url={peer.photoUrl} size={96} />
        <h2 id="call-peer">{peer.name}</h2>
        <p aria-live="polite">{state === 'connected' ? mmss(seconds) : LABEL[state]}</p>
        {error && <p className="call-error" role="alert">{error}</p>}
        <p className="call-secure"><ShieldCheck size={14} aria-hidden="true" /> End-to-end encrypted voice call</p>
      </div>
      <div className="call-actions">
        <button type="button" className={`call-btn ${muted ? 'on' : ''}`} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} disabled={state === 'failed'}>
          {muted ? <MicOff size={22} aria-hidden="true" /> : <Mic size={22} aria-hidden="true" />}
        </button>
        <button type="button" className="call-btn decline big" onClick={() => finish(state === 'connected' ? `Call ended · ${mmss(seconds)}` : 'Call cancelled', state === 'failed' ? 'failed' : 'hangup')} aria-label="Hang up">
          <PhoneOff size={26} aria-hidden="true" />
        </button>
      </div>
      <audio ref={audio} autoPlay playsInline />
    </div>
  );
}
