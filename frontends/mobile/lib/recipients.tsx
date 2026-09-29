import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as SecureStore from 'expo-secure-store';
import { BookUser, UserRound } from 'lucide-react-native';
import { appAlert } from './dialog';
import { C, F } from './theme';

/**
 * "Book for someone else": pick the person from the phone's contacts, or from
 * the people you booked for before (kept on this phone only, never uploaded
 * as a contact list: only the one person you choose goes with the booking).
 */

export type Recipient = { name: string; phone: string };

const KEY = 'nabz.recentRecipients';
const MAX = 6;

/** Indian mobile → 10 digits (drops +91 / 0 / spaces). Returns '' if it isn't one. */
export function normalizeIndianMobile(raw: string | undefined) {
  const digits = String(raw || '').replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : '';
}

export async function recentRecipients(): Promise<Recipient[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const list = raw ? (JSON.parse(raw) as Recipient[]) : [];
    return Array.isArray(list) ? list.filter((r) => r && r.name && r.phone).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Remember someone you booked for (most recent first). */
export async function rememberRecipient(r: Recipient) {
  if (!r.name.trim() || !normalizeIndianMobile(r.phone)) return;
  const list = (await recentRecipients()).filter((x) => x.phone !== r.phone);
  list.unshift({ name: r.name.trim(), phone: normalizeIndianMobile(r.phone) });
  await SecureStore.setItemAsync(KEY, JSON.stringify(list.slice(0, MAX))).catch(() => undefined);
}

/** System contact picker; asks for contacts access only when tapped. */
export async function pickFromContacts(): Promise<Recipient | null> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') {
    appAlert('Contacts access needed', 'Allow contacts to pick the person you are booking for, or type their name and number instead.');
    return null;
  }
  const c = await Contacts.presentContactPickerAsync();
  if (!c) return null;
  const numbers = (c.phoneNumbers || []).map((p) => normalizeIndianMobile(p.number)).filter(Boolean);
  if (!numbers.length) {
    appAlert('No mobile number', `${c.name || 'This contact'} has no Indian mobile number saved. Type it in instead.`);
    return { name: c.name || '', phone: '' };
  }
  return { name: c.name || '', phone: numbers[0] };
}

/** Recent people + "Pick from contacts". */
export function RecipientPicker({ onPick }: { onPick: (r: Recipient) => void }) {
  const [recent, setRecent] = useState<Recipient[]>([]);
  useEffect(() => { recentRecipients().then(setRecent); }, []);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      <Pressable style={[styles.chip, styles.contacts]} accessibilityRole="button" accessibilityLabel="Pick from contacts"
        onPress={async () => { const r = await pickFromContacts(); if (r) onPick(r); }}>
        <BookUser size={16} color={C.onNight} />
        <Text style={[styles.chipText, { color: C.onNight }]}>From contacts</Text>
      </Pressable>
      {recent.map((r) => (
        <Pressable key={r.phone} style={styles.chip} onPress={() => onPick(r)} accessibilityRole="button" accessibilityLabel={`Book for ${r.name}`}>
          <UserRound size={16} color={C.ink} />
          <View>
            <Text style={styles.chipText} numberOfLines={1}>{r.name}</Text>
            <Text style={styles.chipSub}>{r.phone.replace(/(\d{5})(\d{5})/, '$1 $2')}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card, maxWidth: 200 },
  contacts: { backgroundColor: C.night, borderColor: C.night },
  chipText: { fontFamily: F.bold, fontSize: 13, color: C.ink },
  chipSub: { fontFamily: F.medium, fontSize: 11, color: C.muted }
});
