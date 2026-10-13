import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import type { ChatKind } from '@medrush/shared';
import { api } from './api';
import { appAlert } from './dialog';
import { problem } from './market';
import { C, F } from './theme';

/** "Chat or Call" on a booking: opens the conversation with the other person on it. */
export function ChatButton({ kind, refId, label = 'Chat or Call', compact }: { kind: ChatKind; refId: string; label?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const { thread } = await api.openChat(kind, refId);
      router.push(`/chat/${thread._id}`);
    } catch (e) {
      appAlert('Chat isn’t available yet', problem(e).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={open} disabled={busy} style={({ pressed }) => [s.btn, compact && s.compact, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={label}>
      {busy ? <ActivityIndicator color={C.brand} size="small" /> : <MessageCircle size={18} color={C.brand} />}
      <Text style={s.text}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: C.brand, backgroundColor: C.card },
  compact: { minHeight: 40, paddingHorizontal: 12, alignSelf: 'flex-start' },
  text: { color: C.brand, fontFamily: F.bold, fontSize: 15 }
});
