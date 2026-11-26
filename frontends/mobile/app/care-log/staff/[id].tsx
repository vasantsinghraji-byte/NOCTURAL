import { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { CareLogKind, CareLogView, CareVitals } from '@medrush/shared';
import { api } from '@/lib/api';
import { CareLogTimeline, LOG_KINDS } from '@/lib/CareLogTimeline';
import { fmtDay, fmtTime, problem } from '@/lib/market';
import { BottomSheet, Btn, Card, Chip, Chips, Empty, Label, Meta, Note, Screen, Title, TopBar } from '@/lib/marketUI';
import { PressScale, Skeleton, success } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

const QUICK: Record<Exclude<CareLogKind, 'VITALS'>, string[]> = {
  MEAL: ['Breakfast eaten', 'Lunch eaten', 'Dinner eaten', 'Ate half', 'Did not eat', 'Water / fluids given'],
  MEDICINE: ['Morning medicines given', 'Afternoon medicines given', 'Night medicines given', 'Insulin given'],
  ACTIVITY: ['Short walk', 'Exercises done', 'Bath / sponge bath', 'Rested / slept', 'Position changed'],
  NOTE: ['Comfortable and calm', 'Complained of pain', 'Feeling dizzy', 'Family informed']
};
const VITAL_FIELDS: Array<[keyof CareVitals, string, string]> = [
  ['bpSys', 'BP top', '120'], ['bpDia', 'BP bottom', '80'], ['sugar', 'Sugar mg/dL', '110'],
  ['pulse', 'Pulse', '72'], ['spo2', 'SpO₂ %', '98'], ['temp', 'Temp °F', '98.6']
];

/** The professional's quick care log during a visit: big buttons, one-tap phrases, readings. */
export default function StaffCareLog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [log, setLog] = useState<CareLogView | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<CareLogKind | null>(null);
  const [text, setText] = useState('');
  const [vitals, setVitals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(() => api.staffCareLog(String(id)).then((r) => { setLog(r.log); setError(''); }).catch((e) => setError(problem(e).message)), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (k: CareLogKind) => { setKind(k); setText(''); setVitals({}); setFormError(''); };
  const save = async () => {
    if (!kind) return;
    setSaving(true);
    setFormError('');
    try {
      const body = kind === 'VITALS'
        ? { kind, vitals: Object.fromEntries(Object.entries(vitals).filter(([, v]) => v.trim()).map(([k, v]) => [k, Number(v)])) as CareVitals }
        : { kind, text };
      const r = await api.addCareLogEntry(String(id), body);
      setLog(r.log);
      success();
      setKind(null);
    } catch (e) { setFormError(problem(e).message); } finally { setSaving(false); }
  };

  return (
    <Screen header={<TopBar title="Care log" />}>
      {error ? <Empty title={error} /> : null}
      {!log && !error ? <Skeleton height={200} radius={24} /> : null}
      {log ? (
        <>
          <Meta>{log.serviceType.replace(/_/g, ' ').toLowerCase()} · {fmtDay(String(log.scheduledDate).slice(0, 10))}, {fmtTime(log.scheduledTime)}. The family sees this as you write it.</Meta>
          <Title size={19}>Add to the log</Title>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {(Object.keys(LOG_KINDS) as CareLogKind[]).map((k) => {
              const Icon = LOG_KINDS[k].icon;
              return (
                <PressScale key={k} onPress={() => open(k)} accessibilityRole="button" accessibilityLabel={`Add ${LOG_KINDS[k].label}`}
                  style={[ui.card, { flexBasis: '30%', flexGrow: 1, alignItems: 'center', gap: 8, paddingVertical: 16 }]}>
                  <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Icon size={24} color={C.brand} /></View>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{LOG_KINDS[k].label}</Text>
                </PressScale>
              );
            })}
          </View>
          <Card style={{ gap: 6 }}>
            <Title size={18}>Today’s log</Title>
            <CareLogTimeline log={log} />
          </Card>
        </>
      ) : null}

      <BottomSheet visible={Boolean(kind)} onClose={() => setKind(null)} title={kind ? LOG_KINDS[kind].label : ''}>
        {kind === 'VITALS' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {VITAL_FIELDS.map(([k, label, ph]) => (
              <View key={k} style={{ flexBasis: '47%', flexGrow: 1, gap: 4 }}>
                <Label>{label}</Label>
                <TextInput style={ui.input} keyboardType="decimal-pad" maxLength={5} placeholder={ph} placeholderTextColor={C.faint}
                  value={vitals[k] || ''} onChangeText={(v) => setVitals({ ...vitals, [k]: v.replace(/[^\d.]/g, '') })} accessibilityLabel={label} />
              </View>
            ))}
          </View>
        ) : kind ? (
          <>
            <Chips>{QUICK[kind].map((q) => <Chip key={q} label={q} on={text === q} onPress={() => setText(q)} />)}</Chips>
            <TextInput style={[ui.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline maxLength={300} placeholder="Or write a short note" placeholderTextColor={C.muted} value={text} onChangeText={setText} accessibilityLabel="Note" />
          </>
        ) : null}
        {formError ? <Note>{formError}</Note> : null}
        <Btn label={saving ? 'Saving…' : 'Add to Log'} loading={saving} onPress={save} />
      </BottomSheet>
    </Screen>
  );
}
