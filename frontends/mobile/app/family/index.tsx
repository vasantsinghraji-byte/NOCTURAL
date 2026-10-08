import { useCallback, useState } from 'react';
import { RefreshControl, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, HeartHandshake, ShieldCheck, UserPlus, Users } from 'lucide-react-native';
import type { FamilyLinkView } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { problem } from '@/lib/market';
import { BottomSheet, Btn, Card, Chip, Chips, Empty, Label, Meta, MkHero, Note, Screen, Title, TopBar, mk } from '@/lib/marketUI';
import { PressScale, Skeleton, success } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

const RELATIONS = ['Mother', 'Father', 'Grandparent', 'Spouse', 'Child', 'Other'];

/**
 * Care Circle: help a parent (or anyone) with their care. You see their
 * visits and plans, get their updates and book for them. They accept first,
 * and either of you can stop it any time.
 */
export default function FamilyScreen() {
  const [data, setData] = useState<{ members: FamilyLinkView[]; helpers: FamilyLinkView[]; invites: FamilyLinkView[] } | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('Mother');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => api.myFamily().then((r) => { setData(r); setError(''); }).catch((e) => setError(problem(e).message)), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const invite = async () => {
    setSaving(true);
    setFormError('');
    try {
      await api.inviteFamily({ phone, relation });
      success();
      setAdding(false);
      setPhone('');
      appAlert('Invitation sent', 'They’ll see it in their Nabz app. Once they accept, their visits show here.');
      await load();
    } catch (e) { setFormError(problem(e).message); } finally { setSaving(false); }
  };
  const answer = async (l: FamilyLinkView, accept: boolean) => {
    try { await api.answerFamilyInvite(l._id, accept); success(); await load(); } catch (e) { appAlert('That didn’t work', problem(e).message); }
  };
  const remove = (l: FamilyLinkView) => appAlert(l.role === 'HELPER' ? `Stop helping ${l.person?.name}?` : `Stop ${l.person?.name} helping you?`, 'They will no longer see the visits or get updates. You can invite again later.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Stop', style: 'destructive', onPress: () => { api.removeFamilyLink(l._id).then(load).catch((e) => appAlert('That didn’t work', problem(e).message)); } }
  ]);

  return (
    <Screen header={<TopBar title="Care Circle" />} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
      <MkHero title="Care for family," accent="together" subtitle="See a parent’s visits, get every update and book for them from your phone." art="homecare" />
      {error ? <Note>{error}</Note> : null}
      {!data ? <Skeleton height={120} radius={22} /> : null}

      {data?.invites.map((l) => (
        <Card key={l._id} style={{ gap: 10, borderWidth: 2, borderColor: C.brand }}>
          <View style={mk.row}>
            <View style={mk.tile}><HeartHandshake size={22} color={C.brand} /></View>
            <View style={{ flex: 1 }}>
              <Title size={17}>{l.person?.name} wants to help with your care</Title>
              <Meta>They’ll see your visits and can book for you. Your lab reports stay private.</Meta>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="Allow" onPress={() => answer(l, true)} style={{ flex: 1 }} />
            <Btn variant="ghost" label="No" onPress={() => answer(l, false)} />
          </View>
        </Card>
      ))}

      {data ? (
        <>
          <Title size={19}>People I help</Title>
          {data.members.length === 0 ? (
            <Empty title="Add a parent or relative" text="They get an invitation in their Nabz app. Nothing is shared until they accept." />
          ) : data.members.map((l) => (
            <PressScale key={l._id} disabled={l.status !== 'ACTIVE'} onPress={() => router.push({ pathname: '/family/[id]', params: { id: l.person!._id, name: l.person!.name, relation: l.relation || '' } })}
              style={[ui.card, mk.row]} accessibilityRole="button" accessibilityLabel={`${l.person?.name}, ${l.relation || ''}`}>
              <View style={[mk.tile, { width: 52, height: 52, borderRadius: 18 }]}><Text style={{ fontFamily: F.display, fontSize: 20, color: C.brand }}>{(l.person?.name || '?')[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.display, fontSize: 18, color: C.ink }}>{l.person?.name}</Text>
                <Meta>{l.relation || 'Family'} · {l.status === 'ACTIVE' ? 'Visits, plans and updates' : 'Waiting for them to accept'}</Meta>
              </View>
              {l.status === 'ACTIVE' ? <ChevronRight size={20} color={C.inkSoft} /> : <Btn small variant="ghost" label="Cancel" onPress={() => remove(l)} />}
            </PressScale>
          ))}
          <Btn icon={UserPlus} label="Add a Family Member" onPress={() => setAdding(true)} />

          {data.helpers.length > 0 ? (
            <>
              <Title size={19}>Helping me</Title>
              {data.helpers.map((l) => (
                <View key={l._id} style={[ui.card, mk.row]}>
                  <View style={mk.tile}><Users size={20} color={C.brand} /></View>
                  <View style={{ flex: 1 }}><Text style={{ fontFamily: F.bold, fontSize: 16, color: C.ink }}>{l.person?.name}</Text><Meta>Sees your visits and can book for you</Meta></View>
                  <Btn small variant="ghost" label="Remove" onPress={() => remove(l)} />
                </View>
              ))}
            </>
          ) : null}
          <View style={[mk.row, { paddingHorizontal: 4 }]}><ShieldCheck size={16} color={C.mint} /><Meta style={{ flex: 1 }}>Lab reports and payments stay private to each person.</Meta></View>
        </>
      ) : null}

      <BottomSheet visible={adding} onClose={() => setAdding(false)} title="Add a family member">
        <Label>Their mobile number</Label>
        <TextInput style={ui.input} keyboardType="phone-pad" maxLength={14} placeholder="98765 43210" placeholderTextColor={C.muted} value={phone} onChangeText={setPhone} accessibilityLabel="Their mobile number" />
        <Label>They are my</Label>
        <Chips>{RELATIONS.map((r) => <Chip key={r} label={r} on={relation === r} onPress={() => setRelation(r)} />)}</Chips>
        <Meta>They need a Nabz account on this number. If they don’t have one, you can still book for them as “someone else”.</Meta>
        {formError ? <Note>{formError}</Note> : null}
        <Btn label={saving ? 'Sending…' : 'Send Invitation'} loading={saving} disabled={phone.replace(/\D/g, '').length < 10} onPress={invite} />
      </BottomSheet>
    </Screen>
  );
}
