import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useLive } from './live';
import { C, F } from './theme';

/** Header icon that opens Messages, with the unread count. */
export function MessagesIcon({ color = C.ink }: { color?: string }) {
  const { unread } = useLive();
  return (
    <Pressable onPress={() => router.push('/chat')} hitSlop={8} style={s.icon} accessibilityRole="button" accessibilityLabel={unread ? `Messages, ${unread} unread` : 'Messages'}>
      <MessageCircle size={24} color={color} />
      {unread > 0 ? <View style={s.dot}><Text style={s.dotText}>{unread > 9 ? '9+' : unread}</Text></View> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 6, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dotText: { color: '#ffffff', fontFamily: F.heavy, fontSize: 10 }
});
