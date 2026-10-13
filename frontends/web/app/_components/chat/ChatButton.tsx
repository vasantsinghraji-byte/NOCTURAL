'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import type { ChatKind } from '@medrush/shared';
import { api } from '@/lib/api';

/** "Chat" on a booking: opens the conversation with the other person on it. */
export default function ChatButton({ kind, refId, label = 'Chat', className = 'mk-btn small ghost' }: { kind: ChatKind; refId: string; label?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = async () => {
    setBusy(true);
    setError('');
    try {
      const { thread } = await api.openChat(kind, refId);
      router.push(`/chat/${thread._id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat isn’t available yet');
      setBusy(false);
    }
  };
  return (
    <span style={{ display: 'inline-grid', gap: 4 }}>
      <button type="button" className={className} onClick={open} disabled={busy}>
        <MessageCircle size={16} aria-hidden="true" /> {busy ? 'Opening…' : label}
      </button>
      {error && <span className="mk-help" role="alert">{error}</span>}
    </span>
  );
}
