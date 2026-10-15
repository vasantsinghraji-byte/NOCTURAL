import { StyleSheet, Text, View } from 'react-native';
import { Activity, CheckCircle2, HeartPulse, NotebookPen, Pill, PlayCircle, Utensils, type LucideIcon } from 'lucide-react-native';
import type { CareLogView, CareVitals } from '@medrush/shared';
import { fmtClock } from './market';
import { C, F } from './theme';

export const LOG_KINDS: Record<CareLogView['entries'][number]['kind'], { label: string; icon: LucideIcon }> = {
  VITALS: { label: 'Readings', icon: HeartPulse },
  MEDICINE: { label: 'Medicine', icon: Pill },
  MEAL: { label: 'Meal', icon: Utensils },
  ACTIVITY: { label: 'Activity', icon: Activity },
  NOTE: { label: 'Note', icon: NotebookPen }
};

/** "BP 130/85 · Sugar 142 · Pulse 78" with units. */
export function vitalsLine(v?: CareVitals) {
  if (!v) return '';
  return [
    v.bpSys && v.bpDia ? `BP ${v.bpSys}/${v.bpDia}` : '',
    v.sugar ? `Sugar ${v.sugar} mg/dL` : '',
    v.pulse ? `Pulse ${v.pulse}` : '',
    v.spo2 ? `SpO₂ ${v.spo2}%` : '',
    v.temp ? `Temp ${v.temp}°F` : ''
  ].filter(Boolean).join(' · ');
}

/** What happened during a visit, in time order, easy to scan. */
export function CareLogTimeline({ log }: { log: CareLogView }) {
  const rows: { key: string; at?: string; icon: LucideIcon; title: string; text?: string; strong?: boolean }[] = [];
  if (log.startedAt) rows.push({ key: 'start', at: log.startedAt, icon: PlayCircle, title: 'Visit started', strong: true });
  for (const e of log.entries) rows.push({ key: e._id, at: e.at, icon: LOG_KINDS[e.kind].icon, title: LOG_KINDS[e.kind].label, text: e.kind === 'VITALS' ? vitalsLine(e.vitals) : e.text });
  if (log.completedAt) rows.push({ key: 'end', at: log.completedAt, icon: CheckCircle2, title: 'Visit finished', strong: true });
  rows.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
  if (!rows.length) return <Text style={s.empty}>Nothing logged yet. Entries appear here as the professional adds them.</Text>;
  return (
    <View>
      {rows.map((r, i) => (
        <View key={r.key} style={s.row}>
          <View style={s.rail}>
            <View style={[s.dot, r.strong && { backgroundColor: C.brand }]}><r.icon size={15} color={r.strong ? '#ffffff' : C.brand} /></View>
            {i < rows.length - 1 ? <View style={s.line} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 16 }}>
            <Text style={s.title}>{r.title} <Text style={s.time}>{r.at ? fmtClock(r.at) : ''}</Text></Text>
            {r.text ? <Text style={s.text}>{r.text}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center' },
  dot: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, backgroundColor: C.border, marginVertical: 2 },
  title: { fontFamily: F.bold, fontSize: 16, color: C.ink, marginTop: 5 },
  time: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  text: { fontFamily: F.medium, fontSize: 15, color: C.inkSoft, lineHeight: 21, marginTop: 2 },
  empty: { fontFamily: F.medium, fontSize: 15, color: C.muted, lineHeight: 21 }
});
