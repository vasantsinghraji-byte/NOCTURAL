'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, CheckCheck, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Send, ShieldCheck } from 'lucide-react';
import { RealtimeClient, type CallBundle, type ChatMessageView, type ChatThreadView } from '@medrush/shared';
import { api } from '@/lib/api';
import { Avatar } from '../../_components/ProfilePhoto';
import CallPanel from '../../_components/chat/CallPanel';
import { useLive } from '../../_components/chat/RealtimeProvider';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
const mmss = (s = 0) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function ChatThreadPage() {
  return <Suspense fallback={<div className="mk-skel" style={{ marginTop: 16 }} />}><Thread /></Suspense>;
}

function Thread() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { refreshUnread } = useLive();
  const [thread, setThread] = useState<ChatThreadView | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState(false);
  const [call, setCall] = useState<{ bundle: CallBundle; role: 'caller' | 'callee' } | null>(null);
  const [notice, setNotice] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const answered = useRef(false);

  const merge = useCallback((list: ChatMessageView[]) => {
    setMessages((cur) => {
      const map = new Map(cur.map((m) => [m._id, m]));
      list.forEach((m) => map.set(m._id, m));
      return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.chatThread(id);
      setThread(r.thread);
      merge(r.messages);
      if (r.thread.unread) { await api.markChatRead(id); refreshUnread(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t open this conversation');
    }
  }, [id, merge, refreshUnread]);

  useEffect(() => { load(); }, [load]);

  // Live: this conversation's channel. Without it, check every 5 s.
  useEffect(() => {
    let client: RealtimeClient | null = null;
    let cancelled = false;
    api.chatRealtime(id).then(({ realtime }) => {
      if (cancelled || !realtime.enabled || !realtime.channels?.thread || !realtime.realtimeUrl || !realtime.httpHost || !realtime.token) return;
      client = new RealtimeClient({ url: realtime.realtimeUrl, host: realtime.httpHost, token: realtime.token });
      client.onState(setLive);
      client.subscribe(realtime.channels.thread, realtime.token, (e) => {
        if (e.type === 'message' && e.message) {
          merge([e.message as ChatMessageView]);
          if ((e.message as ChatMessageView).from !== 'system') api.markChatRead(id).then(refreshUnread).catch(() => undefined);
        }
        if (e.type === 'read') setMessages((cur) => cur.map((m) => (m.readAt ? m : { ...m, readAt: e.at as string })));
      });
      client.connect();
    }).catch(() => undefined);
    return () => { cancelled = true; if (client) client.close(); };
  }, [id, merge, refreshUnread]);

  useEffect(() => {
    if (live) return undefined;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [live, load]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  // Arrived by answering a call from the incoming-call banner.
  useEffect(() => {
    const callId = search.get('answer');
    if (!callId || answered.current) return;
    answered.current = true;
    api.acceptCall(callId)
      .then((b) => setCall({ bundle: b, role: 'callee' }))
      .catch((e) => setNotice(e instanceof Error ? e.message : 'This call has already ended'))
      .finally(() => router.replace(`/chat/${id}`));
  }, [search, id, router]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError('');
    try {
      const { message } = await api.sendChatMessage(id, body);
      merge([message]);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send');
    } finally {
      setSending(false);
    }
  }

  async function startCall() {
    setNotice('');
    try {
      const b = await api.startCall(id);
      setCall({ bundle: b, role: 'caller' });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Couldn’t start the call');
    }
  }

  if (error && !thread) return <p className="mk-error" role="alert" style={{ marginTop: 16 }}>{error}</p>;
  if (!thread) return <div className="mk-skel" style={{ marginTop: 16 }} />;

  let lastDay = '';
  return (
    <div className="chat-wrap">
      <header className="chat-head">
        <Link href="/chat" className="mk-icon-btn" aria-label="All messages"><ArrowLeft size={20} aria-hidden="true" /></Link>
        <Avatar name={thread.with.name} url={thread.with.photoUrl} size={42} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="chat-head-name">{thread.with.name}</b>
          <span className="chat-head-sub">{thread.title || 'Nabz'}{live ? ' · live' : ''}</span>
        </div>
        <button type="button" className="mk-btn small" onClick={startCall} disabled={!thread.open || !!call} aria-label={`Call ${thread.with.name}`}>
          <Phone size={16} aria-hidden="true" /> Call
        </button>
      </header>

      {notice && <p className="mk-note neutral" role="status">{notice}</p>}

      <div className="chat-body" aria-live="polite" aria-relevant="additions">
        <p className="chat-safety"><ShieldCheck size={14} aria-hidden="true" /> Chat and calls stay inside Nabz. Your phone number is never shared.</p>
        {messages.length === 0 && <p className="chat-empty">Say hello to {thread.with.name.split(' ')[0]}.</p>}
        {messages.map((m) => {
          const d = dayLabel(m.createdAt);
          const sep = d !== lastDay ? <div className="chat-day" key={`d-${m._id}`}><span>{d}</span></div> : null;
          lastDay = d;
          const mine = m.from === thread.me;
          if (m.type === 'CALL') {
            const st = m.call?.status;
            const Icon = st === 'MISSED' || st === 'DECLINED' ? PhoneMissed : mine ? PhoneOutgoing : PhoneIncoming;
            const label = st === 'ENDED' ? `Voice call · ${mmss(m.call?.seconds)}` : st === 'MISSED' ? (mine ? 'No answer' : 'Missed call') : st === 'DECLINED' ? 'Call declined' : st === 'CANCELLED' ? 'Call cancelled' : st === 'ACTIVE' ? 'Call in progress' : 'Calling…';
            return [sep, (
              <div key={m._id} className={`chat-call${st === 'MISSED' || st === 'DECLINED' ? ' bad' : ''}`}>
                <Icon size={16} aria-hidden="true" /> {label} <time>{time(m.createdAt)}</time>
              </div>
            )];
          }
          return [sep, (
            <div key={m._id} className={`chat-bubble ${mine ? 'mine' : 'theirs'}`}>
              <p>{m.text}</p>
              <span className="chat-meta">
                {time(m.createdAt)}
                {mine && (m.readAt ? <CheckCheck size={14} aria-label="Read" /> : <Check size={14} aria-label="Sent" />)}
              </span>
            </div>
          )];
        })}
        <div ref={bottom} />
      </div>

      {thread.open ? (
        <form className="chat-compose" onSubmit={send}>
          <label htmlFor="chat-text" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Message</label>
          <textarea id="chat-text" className="mk-input" rows={1} value={text} maxLength={2000} placeholder="Type a message…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
          <button type="submit" className="mk-btn" disabled={sending || !text.trim()} aria-label="Send"><Send size={18} aria-hidden="true" /></button>
        </form>
      ) : (
        <p className="mk-note neutral" style={{ margin: 0 }}>This conversation closed with the booking. You can still read it.</p>
      )}
      {error && thread && <p className="mk-error" role="alert">{error}</p>}

      {call && (
        <CallPanel bundle={call.bundle} role={call.role} peer={thread.with}
          onClose={(summary) => { setCall(null); setNotice(summary); load(); }} />
      )}
    </div>
  );
}
