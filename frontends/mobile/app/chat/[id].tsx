import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, CheckCheck, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Send, ShieldCheck } from 'lucide-react-native';
import { RealtimeClient, type ChatMessageView, type ChatThreadView } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { setPendingCall, useLive } from '@/lib/live';
import { problem } from '@/lib/market';
import { PhotoAvatar } from '@/lib/profilePhoto';
import { C, F, ui } from '@/lib/theme';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const mmss = (s = 0) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** One conversation: messages, call log, composer and the Call button. */
export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { refreshUnread } = useLive();
  const [thread, setThread] = useState<ChatThreadView | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [calling, setCalling] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');
  const list = useRef<FlatList<ChatMessageView>>(null);

  const merge = useCallback((rows: ChatMessageView[]) => {
    setMessages((cur) => {
      const map = new Map(cur.map((m) => [m._id, m]));
      rows.forEach((m) => map.set(m._id, m));
      return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first (inverted list)
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.chatThread(String(id));
      setThread(r.thread);
      merge(r.messages);
      if (r.thread.unread) { await api.markChatRead(String(id)); refreshUnread(); }
    } catch (e) {
      setError(problem(e).message);
    }
  }, [id, merge, refreshUnread]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let client: RealtimeClient | null = null;
    let cancelled = false;
    api.chatRealtime(String(id)).then(({ realtime }) => {
      if (cancelled || !realtime.enabled || !realtime.channels?.thread || !realtime.realtimeUrl || !realtime.httpHost || !realtime.token) return;
      client = new RealtimeClient({ url: realtime.realtimeUrl, host: realtime.httpHost, token: realtime.token });
      client.onState(setLive);
      client.subscribe(realtime.channels.thread, realtime.token, (e) => {
        if (e.type === 'message' && e.message) {
          merge([e.message as ChatMessageView]);
          api.markChatRead(String(id)).then(refreshUnread).catch(() => undefined);
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

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const { message } = await api.sendChatMessage(String(id), body);
      merge([message]);
      setText('');
      list.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (e) {
      appAlert('Not sent', problem(e).message);
    } finally {
      setSending(false);
    }
  };

  const call = async () => {
    if (!thread) return;
    setCalling(true);
    try {
      const bundle = await api.startCall(String(id));
      setPendingCall({ bundle, role: 'caller', peer: thread.with, thread: String(id) });
      router.push('/call');
    } catch (e) {
      appAlert('Couldn’t call', problem(e).message);
    } finally {
      setCalling(false);
    }
  };

  if (!thread) {
    return <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>{error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={C.brand} />}</View>;
  }

  return (
    <KeyboardAvoidingView style={ui.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.head, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat'))} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}>
          <ArrowLeft size={22} color={C.ink} />
        </Pressable>
        <PhotoAvatar name={thread.with.name} url={thread.with.photoUrl} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{thread.with.name}</Text>
          <Text style={s.sub} numberOfLines={1}>{thread.title || 'Nabz'}{live ? ' · live' : ''}</Text>
        </View>
        <Pressable onPress={call} disabled={!thread.open || calling} style={[s.callBtn, (!thread.open || calling) && { opacity: 0.45 }]} accessibilityRole="button" accessibilityLabel={`Call ${thread.with.name}`}>
          {calling ? <ActivityIndicator color="#ffffff" /> : <Phone size={20} color="#ffffff" />}
        </Pressable>
      </View>

      <FlatList
        ref={list}
        data={messages}
        inverted
        keyExtractor={(m) => m._id}
        contentContainerStyle={{ padding: 14, gap: 6 }}
        ListFooterComponent={<View style={s.safety}><ShieldCheck size={14} color={C.muted} /><Text style={s.safetyText}>Chat and calls stay inside Nabz. Your phone number is never shared.</Text></View>}
        renderItem={({ item: m }) => <Bubble m={m} mine={m.from === thread.me} />}
      />

      {thread.open ? (
        <View style={[s.compose, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput value={text} onChangeText={setText} placeholder="Type a message" placeholderTextColor={C.muted} style={s.input}
            multiline maxLength={2000} accessibilityLabel="Message" />
          <Pressable onPress={send} disabled={sending || !text.trim()} style={[s.send, (sending || !text.trim()) && { opacity: 0.45 }]} accessibilityRole="button" accessibilityLabel="Send">
            {sending ? <ActivityIndicator color="#ffffff" /> : <Send size={20} color="#ffffff" />}
          </Pressable>
        </View>
      ) : (
        <Text style={[s.closed, { marginBottom: insets.bottom + 12 }]}>This conversation closed with the booking. You can still read it.</Text>
      )}
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, mine }: { m: ChatMessageView; mine: boolean }) {
  if (m.type === 'CALL') {
    const st = m.call?.status;
    const bad = st === 'MISSED' || st === 'DECLINED';
    const Icon = bad ? PhoneMissed : mine ? PhoneOutgoing : PhoneIncoming;
    const label = st === 'ENDED' ? `Voice call · ${mmss(m.call?.seconds)}` : st === 'MISSED' ? (mine ? 'No answer' : 'Missed call') : st === 'DECLINED' ? 'Call declined' : st === 'CANCELLED' ? 'Call cancelled' : st === 'ACTIVE' ? 'Call in progress' : 'Calling…';
    return (
      <View style={[s.callRow, bad && { backgroundColor: C.brandSoft }]}>
        <Icon size={16} color={bad ? C.brand : C.inkSoft} />
        <Text style={[s.callText, bad && { color: C.brandDark }]}>{label} · {time(m.createdAt)}</Text>
      </View>
    );
  }
  return (
    <View style={[s.bubble, mine ? s.mine : s.theirs]}>
      <Text style={[s.text, mine && { color: '#ffffff' }]}>{m.text}</Text>
      <View style={s.meta}>
        <Text style={[s.metaText, mine && { color: C.onNightMuted }]}>{time(m.createdAt)}</Text>
        {mine ? (m.readAt ? <CheckCheck size={14} color={C.onNightMuted} /> : <Check size={14} color={C.onNightMuted} />) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: C.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: F.bold, fontSize: 17, color: C.ink },
  sub: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  callBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' },
  safety: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: C.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8, maxWidth: '92%' },
  safetyText: { fontFamily: F.medium, fontSize: 12, color: C.muted, flexShrink: 1 },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, borderRadius: 16 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.brand, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderBottomLeftRadius: 6 },
  text: { fontFamily: F.medium, fontSize: 16, lineHeight: 22, color: C.ink },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  metaText: { fontFamily: F.medium, fontSize: 11, color: C.muted },
  callRow: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.cardAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  callText: { fontFamily: F.semi, fontSize: 13, color: C.inkSoft },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: C.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  input: { flex: 1, minHeight: 48, maxHeight: 130, backgroundColor: C.cardAlt, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontFamily: F.medium, fontSize: 16, color: C.ink },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  closed: { textAlign: 'center', fontFamily: F.medium, fontSize: 14, color: C.muted, paddingHorizontal: 24, paddingTop: 10 },
  error: { color: C.roseInk, fontFamily: F.semi, fontSize: 15, textAlign: 'center' }
});
