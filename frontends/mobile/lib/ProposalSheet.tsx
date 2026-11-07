import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { MyRateCardItem } from '@medrush/shared';
import { api } from './api';
import { inr, problem } from './market';
import { BottomSheet, Btn, Chip, Chips, Label, Meta, Note, Seg, Stepper } from './marketUI';
import { success } from './motion';
import { C, ui } from './theme';

/**
 * After (or during) a visit, the professional suggests a treatment plan. The
 * customer sees it with the shop's own prices and books it if they agree.
 */
export function ProposalSheet({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const [items, setItems] = useState<MyRateCardItem[] | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [mode, setMode] = useState<'HOME' | 'CLINIC'>('HOME');
  const [sessions, setSessions] = useState(10);
  const [perWeek, setPerWeek] = useState(3);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.myShop().then((r) => {
      const live = r.rateCard.filter((i) => i.isActive && (i.home.enabled || i.clinic.enabled));
      setItems(live);
      if (live[0]) { setServiceId(live[0].service._id); setMode(live[0].home.enabled ? 'HOME' : 'CLINIC'); }
    }).catch((e) => { setErr(problem(e).message); setItems([]); });
  }, []);
  const item = items?.find((i) => i.service._id === serviceId);
  useEffect(() => {
    if (!item) return;
    if (mode === 'HOME' && !item.home.enabled) setMode('CLINIC');
    if (mode === 'CLINIC' && !item.clinic.enabled) setMode('HOME');
  }, [item, mode]);

  const submit = async () => {
    setSaving(true);
    setErr('');
    try {
      await api.proposePlan(bookingId, { serviceId, mode, sessions, sessionsPerWeek: perWeek, note: note.trim() || undefined });
      success();
      setDone(true);
    } catch (e) { setErr(problem(e).message); } finally { setSaving(false); }
  };

  return (
    <BottomSheet visible onClose={onClose} title="Suggest a treatment plan">
      {done ? (
        <>
          <Note tone="green">Sent. The customer sees your suggestion with your prices and can book it in a tap.</Note>
          <Btn label="Done" onPress={onClose} />
        </>
      ) : (
        <>
          {items && items.length === 0 ? (
            <>
              <Note>Add services to your rate card first.</Note>
              <Btn variant="soft" label="Open My Shop" onPress={() => { onClose(); router.push({ pathname: '/shop', params: { tab: 'menu' } }); }} />
            </>
          ) : null}
          {items && items.length > 0 ? (
            <>
              <Label>Service</Label>
              <Chips>{items.map((i) => <Chip key={i._id} label={i.service.displayName} on={serviceId === i.service._id} onPress={() => setServiceId(i.service._id)} />)}</Chips>
              {item?.home.enabled && item?.clinic.enabled ? (
                <Seg value={mode} onChange={setMode} options={[{ value: 'HOME', label: `Home ${inr(item.home.price)}` }, { value: 'CLINIC', label: `Clinic ${inr(item.clinic.price)}` }]} />
              ) : <Meta>{mode === 'HOME' ? `At home, ${inr(item?.home.price)}` : `At the clinic, ${inr(item?.clinic.price)}`} per session</Meta>}
              <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                <View style={{ gap: 6 }}><Label>Sessions</Label><Stepper value={sessions} max={30} onChange={setSessions} /></View>
                <View style={{ gap: 6 }}><Label>Per week</Label><Stepper value={perWeek} max={7} onChange={setPerWeek} /></View>
              </View>
              <Label>Note for the patient</Label>
              <TextInput style={[ui.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline maxLength={500} value={note} onChangeText={setNote} placeholder="Why this plan helps, exercises between sessions" placeholderTextColor={C.muted} />
            </>
          ) : null}
          {err ? <Note>{err}</Note> : null}
          <Btn label={saving ? 'Sending…' : 'Send Suggestion'} loading={saving} disabled={!serviceId} onPress={submit} />
        </>
      )}
    </BottomSheet>
  );
}
