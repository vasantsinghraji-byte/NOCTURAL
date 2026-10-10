import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowRight, ShieldCheck } from 'lucide-react-native';
import type { OrderItem } from '@medrush/shared';
import { api } from './api';
import { appAlert } from './dialog';
import { fmtClock, inr, problem } from './market';
import { Btn } from './marketUI';
import { success } from './motion';
import { C, F, clay } from './theme';

/**
 * The store suggests the same medicine from another maker: both side by side
 * in large type, the price difference spelled out, then Accept or Remove.
 */
export function SubstituteCard({ orderId, item, paymentMode, onAnswered }: {
  orderId: string; item: OrderItem; paymentMode?: string; onAnswered: () => void;
}) {
  const [busy, setBusy] = useState<'yes' | 'no' | ''>('');
  const sub = item.substitution;
  if (!sub || sub.status !== 'PENDING') return null;
  const diff = Math.round((sub.lineTotal - item.lineTotal) * 100) / 100;

  const answer = async (accept: boolean) => {
    setBusy(accept ? 'yes' : 'no');
    try {
      await api.answerSubstitute(orderId, item.medicine, accept);
      success();
      appAlert(accept ? 'Substitute accepted' : 'Removed from your order',
        accept ? (diff < 0 ? `${inr(-diff)} ${paymentMode === 'PREPAID' ? 'will be refunded' : 'comes off your bill'}.` : 'Your order is being packed.')
          : `${item.name} was removed${paymentMode === 'PREPAID' ? ` and ${inr(item.lineTotal)} will be refunded` : ''}.`);
      onAnswered();
    } catch (e) { appAlert('That didn’t work', problem(e).message); } finally { setBusy(''); }
  };

  return (
    <View style={s.card} accessibilityLiveRegion="polite">
      <Text style={s.kicker}>YOUR PHARMACY SUGGESTS A SUBSTITUTE</Text>
      <Text style={s.lead}>{item.name} is out of stock. They have the same medicine from another maker.</Text>
      <View style={s.compare}>
        <View style={s.col}>
          <Text style={s.colLabel}>You ordered</Text>
          <Text style={s.name}>{item.name}</Text>
          <Text style={s.meta}>{item.quantity} × {inr(item.unitPrice)}</Text>
          <Text style={s.price}>{inr(item.lineTotal)}</Text>
        </View>
        <ArrowRight size={20} color={C.muted} />
        <View style={[s.col, s.colNew]}>
          <Text style={[s.colLabel, { color: C.brandDark }]}>Suggested</Text>
          <Text style={s.name}>{sub.name}</Text>
          <Text style={s.meta}>{[sub.manufacturer, sub.packSize].filter(Boolean).join(' · ')}</Text>
          <Text style={s.meta}>{sub.quantity} × {inr(sub.unitPrice)}</Text>
          <Text style={s.price}>{inr(sub.lineTotal)}</Text>
        </View>
      </View>
      <Text style={[s.diff, { color: diff < 0 ? C.mint : diff > 0 ? C.amber : C.inkSoft }]}>
        {diff < 0 ? `You save ${inr(-diff)}` : diff > 0 ? `${inr(diff)} more (pay at delivery)` : 'Same price'}
      </Text>
      <View style={s.row}><ShieldCheck size={16} color={C.mint} /><Text style={s.note}>Same salt, strength and form. Only the maker is different.</Text></View>
      {sub.note ? <Text style={s.note}>Pharmacist: “{sub.note}”</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn label="Accept" loading={busy === 'yes'} disabled={Boolean(busy)} onPress={() => answer(true)} style={{ flex: 1 }} />
        <Btn variant="ghost" label="Remove It" loading={busy === 'no'} disabled={Boolean(busy)} onPress={() => answer(false)} />
      </View>
      {sub.respondBy ? <Text style={s.meta}>No answer by {fmtClock(sub.respondBy)} = removed from the order, so nothing is delayed.</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 24, padding: 16, gap: 12, borderWidth: 2, borderColor: C.brand, ...clay },
  kicker: { fontFamily: F.heavy, fontSize: 11, color: C.brand, letterSpacing: 1 },
  lead: { fontFamily: F.semi, fontSize: 16, color: C.ink, lineHeight: 22 },
  compare: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  col: { flex: 1, backgroundColor: C.cardAlt, borderRadius: 18, padding: 12, gap: 3 },
  colNew: { backgroundColor: C.brandSoft },
  colLabel: { fontFamily: F.heavy, fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  name: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  meta: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  price: { fontFamily: F.display, fontSize: 20, color: C.ink, marginTop: 4 },
  diff: { fontFamily: F.display, fontSize: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: { flex: 1, fontFamily: F.medium, fontSize: 14, color: C.inkSoft, lineHeight: 20 }
});
