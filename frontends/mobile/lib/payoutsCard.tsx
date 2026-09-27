import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Landmark, Smartphone, Wallet } from 'lucide-react-native';
import type { PayoutSummary } from '@medrush/shared';
import { api, describeNetworkError } from './api';
import { inr } from './care';
import { appAlert } from './dialog';
import { C, F, clay, ui } from './theme';

/** Partner payouts: available balance, Withdraw, payout details, recent withdrawals. */
export function PayoutsCard() {
  const [data, setData] = useState<PayoutSummary | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.getPayouts().then((r) => setData(r.payouts)).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  async function withdraw() {
    if (!data) return;
    appAlert(`Withdraw ${inr(data.available)}?`, `It goes to ${data.details?.display}. Transfers are usually done within 1 working day.`, [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Withdraw', onPress: async () => {
          setBusy(true);
          try {
            await api.requestWithdrawal();
            appAlert('Withdrawal requested', 'We’ll notify you when the money is sent.');
            load();
          } catch (e) {
            appAlert('Could not withdraw', describeNetworkError(e));
          } finally {
            setBusy(false);
          }
        }
      }
    ]);
  }

  if (!data) return <View style={styles.card}><ActivityIndicator color={C.brand} /></View>;
  const open = data.history.find((h) => h.status === 'REQUESTED');
  const cooling = data.details?.withdrawalsFrom && new Date(data.details.withdrawalsFrom) > new Date();

  return (
    <View style={[styles.card, { gap: 10 }]}>
      <View style={styles.inline}><Wallet size={18} color={C.brand} /><Text style={ui.h3}>Payouts</Text></View>
      <Text style={styles.balance}>{inr(data.available)}</Text>
      <Text style={ui.muted}>
        Available to withdraw: {inr(data.earned)} earned − {inr(data.cashHeld)} cash you collected.
        {data.owes > 0 ? ` You hold ${inr(data.owes)} more in cash than you’ve earned; it’s settled from your next earnings.` : ''}
      </Text>

      {data.details ? (
        <Pressable onPress={() => setEditing(true)} style={styles.dest} accessibilityRole="button" accessibilityLabel="Change payout details">
          {data.details.method === 'UPI' ? <Smartphone size={16} color={C.ink} /> : <Landmark size={16} color={C.ink} />}
          <Text style={[ui.body, { flex: 1 }]}>{data.details.display}</Text>
          <Text style={styles.link}>Change</Text>
        </Pressable>
      ) : (
        <Pressable style={ui.btnOutline} onPress={() => setEditing(true)} accessibilityRole="button">
          <Text style={ui.btnOutlineText}>Add UPI ID or bank account</Text>
        </Pressable>
      )}

      {open ? (
        <Text style={[ui.muted, { color: C.amber }]}>Withdrawal of {inr(open.amount)} is being processed.</Text>
      ) : cooling ? (
        <Text style={[ui.muted, { color: C.amber }]}>Payout details changed recently: withdrawals open {new Date(data.details!.withdrawalsFrom!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.</Text>
      ) : null}

      <Pressable style={[ui.btnDark, (!data.canWithdraw || busy) && { opacity: 0.5 }]} disabled={!data.canWithdraw || busy} onPress={withdraw} accessibilityRole="button">
        <Text style={[ui.btnText, { color: C.onNight }]}>{data.available >= data.minimum ? `Withdraw ${inr(data.available)}` : `Withdraw from ${inr(data.minimum)}`}</Text>
      </Pressable>

      {data.history.length > 0 && (
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={ui.label}>Recent withdrawals</Text>
          {data.history.slice(0, 5).map((h) => (
            <View key={h._id} style={styles.inline}>
              <Text style={[ui.body, { flex: 1 }]}>{inr(h.amount)} · {new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
              <Text style={[styles.status, h.status === 'PAID' ? styles.paid : h.status === 'REJECTED' ? styles.rejected : styles.pending]}>
                {h.status === 'PAID' ? 'Paid' : h.status === 'REJECTED' ? 'Rejected' : 'Processing'}
              </Text>
            </View>
          ))}
        </View>
      )}

      <DetailsSheet visible={editing} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
    </View>
  );
}

function DetailsSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [method, setMethod] = useState<'UPI' | 'BANK'>('UPI');
  const [f, setF] = useState({ upiId: '', accountNumber: '', ifsc: '', accountName: '', bankName: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true);
    try {
      await api.savePayoutDetails(method === 'UPI'
        ? { method, upiId: f.upiId.trim(), accountName: f.accountName.trim() || undefined }
        : { method, accountNumber: f.accountNumber.replace(/\s/g, ''), ifsc: f.ifsc.trim(), accountName: f.accountName.trim(), bankName: f.bankName.trim() || undefined });
      appAlert('Payout details saved', 'For your safety, withdrawals open 24 hours after a change.');
      onSaved();
    } catch (e) {
      appAlert('Could not save', describeNetworkError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={[ui.display, { fontSize: 28 }]}>Where should we pay you?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['UPI', 'BANK'] as const).map((m) => (
              <Pressable key={m} onPress={() => setMethod(m)} style={[styles.choice, method === m && styles.choiceOn]} accessibilityRole="radio" accessibilityState={{ checked: method === m }}>
                <Text style={[styles.choiceText, method === m && { color: C.onNight }]}>{m === 'UPI' ? 'UPI ID' : 'Bank account'}</Text>
              </Pressable>
            ))}
          </View>
          {method === 'UPI' ? (
            <TextInput style={ui.input} placeholder="UPI ID, e.g. name@okicici" placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} value={f.upiId} onChangeText={set('upiId')} />
          ) : (
            <>
              <TextInput style={ui.input} placeholder="Account holder’s name" placeholderTextColor={C.faint} value={f.accountName} onChangeText={set('accountName')} />
              <TextInput style={ui.input} placeholder="Account number" placeholderTextColor={C.faint} keyboardType="number-pad" maxLength={18} secureTextEntry value={f.accountNumber} onChangeText={set('accountNumber')} />
              <TextInput style={ui.input} placeholder="IFSC, e.g. HDFC0001234" placeholderTextColor={C.faint} autoCapitalize="characters" maxLength={11} value={f.ifsc} onChangeText={set('ifsc')} />
              <TextInput style={ui.input} placeholder="Bank name (optional)" placeholderTextColor={C.faint} value={f.bankName} onChangeText={set('bankName')} />
            </>
          )}
          <Text style={ui.muted}>Your account number is stored encrypted. Only the last 4 digits are shown.</Text>
          <Pressable style={[ui.btnDark, busy && { opacity: 0.6 }]} disabled={busy} onPress={save} accessibilityRole="button">
            {busy ? <ActivityIndicator color={C.onNight} /> : <Text style={[ui.btnText, { color: C.onNight }]}>Save payout details</Text>}
          </Pressable>
          <Pressable onPress={onClose} style={{ alignItems: 'center', padding: 8 }}><Text style={ui.muted}>Cancel</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, ...clay },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balance: { fontFamily: F.heavy, fontSize: 30, color: C.ink },
  dest: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 12 },
  link: { fontFamily: F.bold, color: C.brand },
  status: { fontFamily: F.bold, fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  paid: { backgroundColor: C.mintSoft, color: C.mint },
  pending: { backgroundColor: C.amberSoft, color: C.amber },
  rejected: { backgroundColor: C.roseSoft, color: C.roseInk },
  overlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 34, gap: 10 },
  choice: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
  choiceOn: { backgroundColor: C.night, borderColor: C.night },
  choiceText: { fontFamily: F.bold, color: C.ink }
});
