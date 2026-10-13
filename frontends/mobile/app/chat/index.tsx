import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { ChatThreadView } from '@medrush/shared';
import { api } from '@/lib/api';
import { useLive } from '@/lib/live';
import { problem } from '@/lib/market';
import { Empty, Note, TopBar } from '@/lib/marketUI';
import { PhotoAvatar } from '@/lib/profilePhoto';
import { C, F, ui } from '@/lib/theme';

const KIND: Record<string, string> = { CARE: 'Visit', PHARMACY: 'Medicines', LAB: 'Lab tests' };
const when = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date().toDateString() === d.toDateString()
    ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Messages: every conversation with a provider (or, for partners, a customer). */
export default function ChatInbox() {
  const { onInbox } = useLive();
  const [threads, setThreads] = useState<ChatThreadView[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { api.chatThreads().then((r) => { setThreads(r.threads); setError(''); }).catch((e) => setError(problem(e).message)); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onInbox((e) => { if (e.type === 'message') load(); }), [onInbox, load]);

  return (
    <View style={ui.screen}>
      <TopBar title="Messages" />
      {error ? <View style={{ padding: 16 }}><Note>{error}</Note></View> : null}
      {!threads ? <ActivityIndicator color={C.brand} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t._id}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}
          ListEmptyComponent={<Empty title="No conversations yet" text="Once a nurse, physio, pharmacy or lab is on your booking, you can chat and call them here." />}
          renderItem={({ item: t }) => (
            <Pressable onPress={() => router.push(`/chat/${t._id}`)} style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}
              accessibilityRole="button" accessibilityLabel={`${t.with.name}. ${t.unread ? `${t.unread} unread. ` : ''}${t.lastMessage?.text || ''}`}>
              <PhotoAvatar name={t.with.name} url={t.with.photoUrl} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={s.top}>
                  <Text style={s.name} numberOfLines={1}>{t.with.name}</Text>
                  <Text style={s.time}>{when(t.lastMessage?.at || t.updatedAt)}</Text>
                </View>
                <Text style={s.sub} numberOfLines={1}>{KIND[t.kind]}{t.title ? ` · ${t.title}` : ''}{t.open ? '' : ' · closed'}</Text>
                <Text style={[s.last, t.unread ? s.lastUnread : null]} numberOfLines={1}>
                  {t.lastMessage ? `${t.lastMessage.by === t.me ? 'You: ' : ''}${t.lastMessage.text}` : 'Say hello'}
                </Text>
              </View>
              {t.unread > 0 ? <View style={s.badge}><Text style={s.badgeText}>{t.unread}</Text></View> : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, padding: 12, borderWidth: 1, borderColor: C.border, minHeight: 76 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontFamily: F.bold, fontSize: 16, color: C.ink },
  time: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  sub: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  last: { fontFamily: F.medium, fontSize: 14, color: C.inkSoft },
  lastUnread: { fontFamily: F.bold, color: C.ink },
  badge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#ffffff', fontFamily: F.heavy, fontSize: 12 }
});
