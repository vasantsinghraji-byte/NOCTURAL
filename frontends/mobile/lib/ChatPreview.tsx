import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, MessageCircle } from 'lucide-react-native';
import type { ChatKind, ChatThreadView } from '@medrush/shared';
import { Text } from '@/lib/T';
import { api } from './api';
import { appAlert } from './dialog';
import { problem } from './market';
import { C, F, depth } from './theme';

const REFRESH_MS = 10_000;
const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
};

/**
 * Messages with the partner on a booking, right where you track it: their
 * latest message, the unread count and "Open chat". Refreshes while shown.
 */
export function ChatPreview({ kind, refId, name }: { kind: ChatKind; refId: string; name: string }) {
  const [thread, setThread] = useState<ChatThreadView | null | undefined>(undefined);
  const [opening, setOpening] = useState(false);
  const busy = useRef(false);

  const load = useCallback(() => {
    api.chatThreads().then((r) => setThread(r.threads.find((t) => String(t.ref) === String(refId)) || null)).catch(() => setThread((t) => t ?? null));
  }, [refId]);
  useEffect(() => {
    load();
    const tm = setInterval(load, REFRESH_MS);
    return () => clearInterval(tm);
  }, [load]);

  async function open() {
    if (busy.current) return; // a double tap opens the chat once
    busy.current = true;
    setOpening(true);
    try {
      const id = thread?._id || (await api.openChat(kind, refId)).thread._id;
      router.push(`/chat/${id}`);
    } catch (e) {
      appAlert('Chat isn’t available yet', problem(e).message);
    } finally {
      busy.current = false;
      setOpening(false);
    }
  }

  const last = thread?.lastMessage;
  const theirs = last && last.by !== thread?.me && last.by !== 'system';
  const who = name.split(' ')[0];
  return (
    <Pressable onPress={open} disabled={opening} style={({ pressed }) => [s.card, depth.card, pressed && { opacity: 0.9 }]}
      accessibilityRole="button" accessibilityLabel={`Messages with ${who}${thread?.unread ? `, ${thread.unread} unread` : ''}. Open chat`}>
      <View style={s.icon}>
        <MessageCircle size={20} color={C.brand} />
        {thread?.unread ? <View style={s.badge}><Text style={s.badgeText}>{thread.unread}</Text></View> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={s.title}>Messages with {who}</Text>
        {thread === undefined ? <Text style={s.muted}>Loading…</Text>
          : last ? (
            <Text style={[s.preview, theirs && thread?.unread ? { color: C.ink, fontFamily: F.bold } : null]} numberOfLines={2}>
              {theirs ? `${who}: ` : last.by === 'system' ? '' : 'You: '}{last.text} · {ago(last.at)}
            </Text>
          ) : <Text style={s.muted}>No messages yet. Say hello or ask about the visit.</Text>}
      </View>
      {opening ? <ActivityIndicator color={C.brand} /> : <ChevronRight size={20} color={C.muted} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.card },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: C.coral, borderWidth: 2, borderColor: '#ffffff' },
  badgeText: { color: '#ffffff', fontFamily: F.heavy, fontSize: 11 },
  title: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  preview: { fontFamily: F.medium, fontSize: 13.5, color: C.inkSoft },
  muted: { fontFamily: F.medium, fontSize: 13, color: C.muted }
});
