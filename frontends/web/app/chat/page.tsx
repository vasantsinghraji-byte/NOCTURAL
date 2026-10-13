'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import type { ChatThreadView } from '@medrush/shared';
import { api } from '@/lib/api';
import { Avatar } from '../_components/ProfilePhoto';
import { useLive } from '../_components/chat/RealtimeProvider';

const KIND: Record<string, string> = { CARE: 'Visit', PHARMACY: 'Medicines', LAB: 'Lab tests' };
const when = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Messages: every conversation with a provider (or customer), newest first. */
export default function ChatInboxPage() {
  const { onInbox } = useLive();
  const [threads, setThreads] = useState<ChatThreadView[] | null>(null);
  const [error, setError] = useState('');

  const load = () => api.chatThreads().then((r) => setThreads(r.threads)).catch((e) => setError(e.status === 401 ? 'auth' : e.message));
  useEffect(() => { load(); }, []);
  useEffect(() => onInbox((e) => { if (e.type === 'message') load(); }), [onInbox]);

  if (error === 'auth') {
    return (
      <div className="mk-card" style={{ marginTop: 20 }}>
        <h1 className="mk-h2" style={{ marginTop: 0 }}>Messages</h1>
        <p className="mk-meta">Sign in to see your messages.</p>
        <Link href="/login?next=/chat" className="mk-btn">Sign in</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, marginTop: 16, display: 'grid', gap: 12 }}>
      <h1 className="mk-h2" style={{ margin: 0 }}>Messages</h1>
      {error && <p className="mk-error" role="alert">{error}</p>}
      {!threads ? <div className="mk-skel" /> : threads.length === 0 ? (
        <div className="mk-empty">
          <MessageCircle size={40} aria-hidden="true" />
          <b>No conversations yet</b>
          <span>Once a nurse, physio, pharmacy or lab is assigned to your booking, you can chat and call them from here.</span>
        </div>
      ) : (
        <ul className="chat-list">
          {threads.map((t) => (
            <li key={t._id}>
              <Link href={`/chat/${t._id}`} className="chat-row">
                <Avatar name={t.with.name} url={t.with.photoUrl} size={48} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="chat-row-top">
                    <b>{t.with.name}</b>
                    <time>{when(t.lastMessage?.at || t.updatedAt)}</time>
                  </span>
                  <span className="chat-row-sub">{KIND[t.kind]}{t.title ? ` · ${t.title}` : ''}</span>
                  <span className={`chat-row-last${t.unread ? ' unread' : ''}`}>
                    {t.lastMessage ? `${t.lastMessage.by === t.me ? 'You: ' : ''}${t.lastMessage.text}` : 'Say hello'}
                  </span>
                </span>
                {t.unread > 0 && <span className="chat-badge" aria-label={`${t.unread} unread`}>{t.unread}</span>}
                {!t.open && <span className="mk-badge" title="The booking has ended">Closed</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
