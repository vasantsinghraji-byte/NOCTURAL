/**
 * Live chat and calls over AWS AppSync Events (managed WebSockets).
 *
 * RealtimeClient speaks the AppSync Events WebSocket protocol: connect with a
 * token from our API, subscribe to channels the token allows, publish (call
 * signalling only), keep-alive watch and reconnect with backoff. Works with the
 * browser's WebSocket and React Native's.
 *
 * CallSession runs one WebRTC voice call on top of it. The WebRTC
 * implementation is passed in (the browser's, or react-native-webrtc).
 */

export interface RealtimeAccess {
  enabled: boolean;
  realtimeUrl?: string;
  httpHost?: string;
  token?: string;
  channels?: { inbox: string; thread: string | null };
}

export type RealtimeEvent = { type: string; [key: string]: any };
type Handler = (event: RealtimeEvent) => void;

// ASCII-only base64url (tokens and hosts are ASCII), no btoa needed.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function b64url(text: string): string {
  let out = '';
  let i = 0;
  for (; i + 2 < text.length; i += 3) {
    const n = (text.charCodeAt(i) << 16) | (text.charCodeAt(i + 1) << 8) | text.charCodeAt(i + 2);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = text.length - i;
  if (rest === 1) {
    const n = text.charCodeAt(i) << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (text.charCodeAt(i) << 16) | (text.charCodeAt(i + 1) << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
  }
  return out;
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface Sub { channel: string; token: string; handler: Handler; active: boolean }

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private ready = false;
  private closedByUser = false;
  private retry = 0;
  private kaTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutMs = 300000;
  private subs = new Map<string, Sub>();
  private pending: string[] = [];
  private stateListeners = new Set<(connected: boolean) => void>();

  constructor(private opts: { url: string; host: string; token: string; WebSocketImpl?: typeof WebSocket }) {}

  /** Update the token used for the connection itself (e.g. after it expires). */
  setToken(token: string) { this.opts.token = token; }

  get connected() { return this.ready; }

  onState(listener: (connected: boolean) => void) {
    this.stateListeners.add(listener);
    return () => { this.stateListeners.delete(listener); };
  }

  connect() {
    this.closedByUser = false;
    if (this.ws) return;
    const WS = this.opts.WebSocketImpl || WebSocket;
    const header = b64url(JSON.stringify({ host: this.opts.host, Authorization: this.opts.token }));
    const ws = new WS(this.opts.url, ['aws-appsync-event-ws', `header-${header}`]);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'connection_init' }));
    ws.onmessage = (e: MessageEvent) => this.onMessage(String(e.data));
    ws.onclose = () => this.onClose();
    ws.onerror = () => { /* onclose follows */ };
  }

  close() {
    this.closedByUser = true;
    this.clearTimers();
    this.subs.clear();
    if (this.ws) { try { this.ws.close(); } catch { /* already closed */ } }
    this.ws = null;
    this.setReady(false);
  }

  /** Listen on a channel; returns a function that stops listening. */
  subscribe(channel: string, token: string, handler: Handler): () => void {
    const id = newId().replace(/[^a-zA-Z0-9-]/g, '');
    const sub: Sub = { channel, token, handler, active: false };
    this.subs.set(id, sub);
    if (this.ready) this.sendSubscribe(id, sub);
    return () => {
      if (!this.subs.has(id)) return;
      this.subs.delete(id);
      if (this.ready) this.send({ type: 'unsubscribe', id });
    };
  }

  /** Publish one event (call signalling); queued until connected. */
  publish(channel: string, token: string, event: RealtimeEvent) {
    const msg = JSON.stringify({ type: 'publish', id: newId(), channel, events: [JSON.stringify(event)], authorization: { Authorization: token, host: this.opts.host } });
    if (this.ready && this.ws) this.ws.send(msg); else this.pending.push(msg);
  }

  private send(obj: object) { if (this.ws) this.ws.send(JSON.stringify(obj)); }

  private sendSubscribe(id: string, sub: Sub) {
    this.send({ type: 'subscribe', id, channel: sub.channel, authorization: { Authorization: sub.token, host: this.opts.host } });
  }

  private setReady(v: boolean) {
    if (this.ready === v) return;
    this.ready = v;
    this.stateListeners.forEach((l) => l(v));
  }

  private onMessage(raw: string) {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case 'connection_ack':
        this.retry = 0;
        this.timeoutMs = Number(msg.connectionTimeoutMs) || 300000;
        this.setReady(true);
        this.armKeepAlive();
        this.subs.forEach((sub, id) => this.sendSubscribe(id, sub));
        this.pending.splice(0).forEach((m) => this.ws && this.ws.send(m));
        break;
      case 'ka':
        this.armKeepAlive();
        break;
      case 'subscribe_success': {
        const sub = this.subs.get(msg.id);
        if (sub) { sub.active = true; sub.handler({ type: 'subscribed' }); }
        break;
      }
      case 'data': {
        const sub = this.subs.get(msg.id);
        if (!sub) break;
        const list = Array.isArray(msg.event) ? msg.event : [msg.event];
        for (const item of list) {
          try { sub.handler(typeof item === 'string' ? JSON.parse(item) : item); } catch { /* malformed event */ }
        }
        break;
      }
      case 'subscribe_error':
      case 'connection_error': {
        const sub = msg.id && this.subs.get(msg.id);
        if (sub) sub.handler({ type: 'error', errors: msg.errors });
        break;
      }
      default:
        break;
    }
  }

  private armKeepAlive() {
    if (this.kaTimer) clearTimeout(this.kaTimer);
    this.kaTimer = setTimeout(() => { try { this.ws && this.ws.close(); } catch { /* ignore */ } }, this.timeoutMs);
  }

  private clearTimers() {
    if (this.kaTimer) clearTimeout(this.kaTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.kaTimer = null;
    this.retryTimer = null;
  }

  private onClose() {
    this.ws = null;
    this.setReady(false);
    if (this.kaTimer) clearTimeout(this.kaTimer);
    this.subs.forEach((s) => { s.active = false; });
    if (this.closedByUser) return;
    // Jittered exponential backoff: 1 s, 2 s, 4 s … up to 30 s.
    const delay = Math.min(30000, 1000 * 2 ** this.retry) * (0.5 + Math.random() / 2);
    this.retry = Math.min(this.retry + 1, 6);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }
}

// ── Voice calls (WebRTC) ────────────────────────────────────────────────

export interface CallBundle {
  call: { _id: string; thread: string; call?: { status: string } };
  iceServers: Array<{ urls: string[] | string; username?: string; credential?: string }>;
  realtime: { realtimeUrl: string; httpHost: string; channel: string; token: string } | null;
}

/** The parts of WebRTC we use; the browser's and react-native-webrtc's both fit. */
export interface RtcImpl {
  RTCPeerConnection: any;
  RTCSessionDescription?: any;
  RTCIceCandidate?: any;
  getUserMedia: (constraints: { audio: boolean; video: boolean }) => Promise<any>;
}

export type CallState = 'connecting' | 'ringing' | 'connected' | 'reconnecting' | 'ended' | 'failed';

/**
 * One voice call. The caller waits for the other phone to say "ready" on the
 * call channel, then sends the offer; the answerer replies; both trade ICE
 * candidates. Audio is end-to-end encrypted by WebRTC (DTLS-SRTP); the TURN
 * relay, when used, only forwards encrypted packets.
 */
export class CallSession {
  private pc: any = null;
  private local: any = null;
  private stopSub: (() => void) | null = null;
  private queuedIce: any[] = [];
  private remoteSet = false;
  private offered = false;
  private gotOffer = false;
  private readyTimer: ReturnType<typeof setInterval> | null = null;
  private done = false;
  state: CallState = 'connecting';

  constructor(private o: {
    rtc: RtcImpl;
    client: RealtimeClient;
    bundle: CallBundle;
    role: 'caller' | 'callee';
    onState: (s: CallState) => void;
    onRemoteStream?: (stream: any) => void;
  }) {}

  private set(s: CallState) {
    if (this.state === s || this.done) return;
    this.state = s;
    this.o.onState(s);
  }

  private signal(event: RealtimeEvent) {
    const rt = this.o.bundle.realtime;
    if (rt) this.o.client.publish(rt.channel, rt.token, { ...event, from: this.o.role });
  }

  async start() {
    const rt = this.o.bundle.realtime;
    if (!rt) { this.set('failed'); throw new Error('Calls need a live connection, which isn’t available right now'); }
    const { RTCPeerConnection } = this.o.rtc;
    this.local = await this.o.rtc.getUserMedia({ audio: true, video: false });
    const pc = new RTCPeerConnection({ iceServers: this.o.bundle.iceServers });
    this.pc = pc;
    this.local.getTracks().forEach((t: any) => pc.addTrack(t, this.local));
    pc.addEventListener('icecandidate', (e: any) => { if (e.candidate) this.signal({ type: 'ice', candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); });
    pc.addEventListener('track', (e: any) => { if (e.streams && e.streams[0] && this.o.onRemoteStream) this.o.onRemoteStream(e.streams[0]); });
    pc.addEventListener('connectionstatechange', () => {
      const s = pc.connectionState;
      if (s === 'connected') this.set('connected');
      else if (s === 'disconnected') this.set('reconnecting');
      else if (s === 'failed') this.set('failed');
    });

    this.stopSub = this.o.client.subscribe(rt.channel, rt.token, (ev) => { this.onSignal(ev).catch(() => this.set('failed')); });
    this.set(this.o.role === 'caller' ? 'ringing' : 'connecting');
  }

  private async onSignal(ev: RealtimeEvent) {
    if (this.done) return;
    if (ev.type === 'subscribed') {
      // The answerer tells the caller it is listening; the caller can then offer.
      // Repeated every 3 s until the offer arrives, in case one is lost.
      if (this.o.role === 'callee' && !this.gotOffer) {
        this.signal({ type: 'ready' });
        if (this.readyTimer) clearInterval(this.readyTimer);
        let tries = 0;
        this.readyTimer = setInterval(() => {
          tries += 1;
          if (this.gotOffer || this.done || tries > 6) { if (this.readyTimer) clearInterval(this.readyTimer); return; }
          this.signal({ type: 'ready' });
        }, 3000);
      }
      return;
    }
    if (ev.from === this.o.role) return; // our own echo
    const pc = this.pc;
    if (ev.type === 'ready' && this.o.role === 'caller') {
      if (this.state === 'connected' || (this.offered && pc.signalingState !== 'stable')) return;
      this.offered = true;
      this.set('connecting');
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      this.signal({ type: 'offer', sdp: pc.localDescription.sdp });
    } else if (ev.type === 'offer' && this.o.role === 'callee') {
      if (this.gotOffer) return;
      this.gotOffer = true;
      if (this.readyTimer) clearInterval(this.readyTimer);
      await pc.setRemoteDescription(this.desc({ type: 'offer', sdp: ev.sdp }));
      this.remoteSet = true;
      await this.flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signal({ type: 'answer', sdp: pc.localDescription.sdp });
    } else if (ev.type === 'answer' && this.o.role === 'caller') {
      await pc.setRemoteDescription(this.desc({ type: 'answer', sdp: ev.sdp }));
      this.remoteSet = true;
      await this.flushIce();
    } else if (ev.type === 'ice' && ev.candidate) {
      if (this.remoteSet) await pc.addIceCandidate(this.cand(ev.candidate)).catch(() => undefined);
      else this.queuedIce.push(ev.candidate);
    } else if (ev.type === 'call.ended' || ev.type === 'hangup') {
      this.end();
    }
  }

  private desc(d: { type: string; sdp: string }) {
    const { RTCSessionDescription } = this.o.rtc;
    return RTCSessionDescription ? new RTCSessionDescription(d) : d;
  }

  private cand(c: any) {
    const { RTCIceCandidate } = this.o.rtc;
    return RTCIceCandidate ? new RTCIceCandidate(c) : c;
  }

  private async flushIce() {
    const list = this.queuedIce.splice(0);
    for (const c of list) await this.pc.addIceCandidate(this.cand(c)).catch(() => undefined);
  }

  setMuted(muted: boolean) {
    if (this.local) this.local.getAudioTracks().forEach((t: any) => { t.enabled = !muted; });
  }

  /** Tell the other phone and close everything (the API call to end is the caller's job). */
  hangup() {
    this.signal({ type: 'hangup' });
    this.end();
  }

  end() {
    if (this.done) return;
    this.set('ended');
    this.done = true;
    if (this.readyTimer) clearInterval(this.readyTimer);
    if (this.stopSub) this.stopSub();
    try { if (this.local) this.local.getTracks().forEach((t: any) => t.stop()); } catch { /* ignore */ }
    try { if (this.pc) this.pc.close(); } catch { /* ignore */ }
    this.pc = null;
  }
}
