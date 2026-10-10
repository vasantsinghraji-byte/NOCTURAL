import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { HeartHandshake } from 'lucide-react-native';
import type { FamilyLinkView } from '@medrush/shared';
import { api } from './api';
import { useAuth } from './auth';
import { appAlert } from './dialog';
import { problem } from './market';
import { Btn } from './marketUI';
import { success } from './motion';
import { C, F, clay } from './theme';

/**
 * Care Circle invitations waiting for an answer, shown where people already
 * look (Home, Care) rather than buried in Account.
 */
export function FamilyInvites({ big = false }: { big?: boolean }) {
  const { session } = useAuth();
  const [invites, setInvites] = useState<FamilyLinkView[]>([]);
  const load = useCallback(() => {
    if (session?.kind !== 'patient') return;
    api.myFamily().then((r) => setInvites(r.invites)).catch(() => undefined);
  }, [session?.kind]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const answer = async (l: FamilyLinkView, accept: boolean) => {
    try {
      await api.answerFamilyInvite(l._id, accept);
      success();
      if (accept) appAlert(`${l.person?.name?.split(' ')[0] || 'They'} can now help`, 'They will see your visits and can book for you. You can stop this any time in Account → Care Circle.');
      load();
    } catch (e) { appAlert('That didn’t work', problem(e).message); }
  };

  if (!invites.length) return null;
  return (
    <>
      {invites.map((l) => (
        <View key={l._id} style={[s.card, big && { padding: 20 }]}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={s.icon}><HeartHandshake size={big ? 28 : 22} color={C.brand} /></View>
            <Text style={[s.title, big && { fontSize: 20 }]}>{l.person?.name} wants to help with your care</Text>
          </View>
          <Text style={[s.sub, big && { fontSize: 16, lineHeight: 23 }]}>They will see your visits and can book for you. Your lab reports stay private.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn label="Allow" onPress={() => answer(l, true)} style={{ flex: 1 }} />
            <Btn variant="ghost" label="No" onPress={() => answer(l, false)} />
          </View>
        </View>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 24, padding: 16, gap: 12, borderWidth: 2, borderColor: C.brand, ...clay },
  icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: F.display, fontSize: 17, color: C.ink, lineHeight: 23 },
  sub: { fontFamily: F.medium, fontSize: 14, color: C.inkSoft, lineHeight: 20 }
});
