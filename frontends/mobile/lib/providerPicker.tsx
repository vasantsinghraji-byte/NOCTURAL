import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { BadgeCheck, Sparkles, Star } from 'lucide-react-native';
import type { CareProvider } from '@medrush/shared';
import { api } from './api';
import { C, F, clay, ui } from './theme';

/**
 * "Choose your physiotherapist / nurse": Best available, or a specific verified
 * professional. For packages the same professional comes to every session.
 */
export function ProviderPicker({ serviceType, value, onChange, allowSubstitute, onAllowSubstitute, gender, isPackage }: {
  serviceType: string;
  value: string | null;
  onChange: (id: string | null, provider?: CareProvider) => void;
  allowSubstitute: boolean;
  onAllowSubstitute: (v: boolean) => void;
  /** Customer's gender preference narrows the list. */
  gender?: 'ANY' | 'FEMALE' | 'MALE';
  isPackage?: boolean;
}) {
  const [providers, setProviders] = useState<CareProvider[] | null>(null);
  useEffect(() => {
    api.listCareProviders(serviceType).then((r) => setProviders(r.providers)).catch(() => setProviders([]));
  }, [serviceType]);

  const list = (providers || []).filter((p) => !gender || gender === 'ANY' || p.gender === gender);
  const physio = /PHYSIO|THERAPY|REHAB/.test(serviceType);
  const who = physio ? 'physiotherapist' : 'professional';

  return (
    <View style={{ gap: 8 }}>
      <Text style={[ui.label, { marginTop: 6 }]}>Choose your {who}</Text>
      {providers === null ? <ActivityIndicator color={C.brand} /> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
          <Pressable onPress={() => onChange(null)} style={[styles.card, value === null && styles.cardOn]} accessibilityRole="radio" accessibilityState={{ checked: value === null }}>
            <Sparkles size={20} color={value === null ? C.onNight : C.brand} />
            <Text style={[styles.name, value === null && { color: C.onNight }]}>Best available</Text>
            <Text style={[styles.meta, value === null && { color: C.onNightMuted }]}>Nearest verified {who}</Text>
          </Pressable>
          {list.map((p) => {
            const on = value === p._id;
            return (
              <Pressable key={p._id} onPress={() => onChange(p._id, p)} style={[styles.card, on && styles.cardOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}
                accessibilityLabel={`${p.name}, ${p.qualification || ''}, rating ${p.rating || 'new'}`}>
                <View style={[styles.avatar, on && { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                  <Text style={[styles.initial, on && { color: C.onNight }]}>{p.name.slice(0, 1)}</Text>
                </View>
                <Text style={[styles.name, on && { color: C.onNight }]} numberOfLines={1}>{p.name}</Text>
                <View style={styles.row}>
                  <Star size={12} color={C.gold} fill={p.rating ? C.gold : 'transparent'} />
                  <Text style={[styles.meta, on && { color: C.onNightMuted }]}>{p.rating ? `${p.rating.toFixed(1)} (${p.reviews})` : 'New'}</Text>
                </View>
                <Text style={[styles.meta, on && { color: C.onNightMuted }]} numberOfLines={1}>
                  {[p.qualification, p.experienceYears ? `${p.experienceYears} yrs` : null, p.gender === 'FEMALE' ? 'Female' : p.gender === 'MALE' ? 'Male' : null].filter(Boolean).join(' · ')}
                </Text>
                <View style={styles.row}><BadgeCheck size={12} color={on ? C.onNight : C.mint} /><Text style={[styles.meta, { color: on ? C.onNight : C.mint }]}>Verified</Text></View>
              </Pressable>
            );
          })}
          {providers.length > 0 && list.length === 0 && (
            <View style={[styles.card, { justifyContent: 'center' }]}><Text style={styles.meta}>No {gender === 'FEMALE' ? 'female' : 'male'} {who} listed yet</Text></View>
          )}
        </ScrollView>
      )}
      {value && (
        <View style={styles.subRow}>
          <Text style={[ui.muted, { flex: 1 }]}>
            {isPackage ? 'If they can’t make a session, ' : 'If they’re busy, '}send another verified {who} instead of asking me
          </Text>
          <Switch value={allowSubstitute} onValueChange={onAllowSubstitute} trackColor={{ true: C.brand, false: C.border }} thumbColor="#ffffff" />
        </View>
      )}
      {isPackage && <Text style={ui.muted}>The same {who} comes to every session. You can change them any time from Bookings.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 150, backgroundColor: C.card, borderRadius: 18, padding: 12, gap: 4, borderWidth: 1.5, borderColor: C.border, ...clay },
  cardOn: { backgroundColor: C.night, borderColor: C.night },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  initial: { fontFamily: F.heavy, fontSize: 16, color: C.ink },
  name: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  meta: { fontFamily: F.medium, fontSize: 11, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }
});
