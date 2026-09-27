import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, BadgeCheck, Fingerprint, Gift, IndianRupee, LogOut, Share2, ShieldCheck, Star, Store, Syringe, Wallet } from 'lucide-react-native';
import type { PartnerAccount } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { inr } from '@/lib/care';
import { appAlert } from '@/lib/dialog';
import { stopBackgroundOnline } from '@/lib/partnerOnline';
import { C, F, clay, ui } from '@/lib/theme';

const STAFF_ROLES = ['nurse', 'physiotherapist', 'medical_staff'];

/** Partner account: who I am, what I earned, my rating, payouts and my referral code. */
export default function PartnerAccountScreen() {
  const insets = useSafeAreaInsets();
  const { session, logout } = useAuth();
  const [acct, setAcct] = useState<PartnerAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getPartnerAccount().then((r) => { setAcct(r.account); setError(null); }).catch((e) => setError(describeNetworkError(e)));
  }, []);
  useFocusEffect(load);

  async function signOut() {
    appAlert('Log out?', STAFF_ROLES.includes(session?.role || '') ? 'You’ll go offline and stop getting visit requests.' : undefined, [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Log out', style: 'destructive', onPress: async () => {
          if (STAFF_ROLES.includes(session?.role || '')) {
            await api.setStaffAvailability(false).catch(() => undefined);
            await stopBackgroundOnline().catch(() => undefined);
          }
          await logout();
          router.replace('/partner');
        }
      }
    ]);
  }

  async function shareCode() {
    if (!acct) return;
    const r = acct.referral;
    await Share.share({
      message: `Join me on Nabz: verified nurses, physios and medicines at home in Jaipur. Use my code ${r.code} when you sign up. Partners can apply with it too.`
    }).catch(() => undefined);
  }

  const e = acct?.earnings;
  const v = acct?.verification;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <View style={[styles.head, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={C.onNight} />
        </Pressable>
        <Text style={styles.eyebrow}>MY ACCOUNT</Text>
        <Text style={styles.name}>{acct?.name || session?.name || ''}</Text>
        <Text style={styles.sub}>{acct?.kind === 'PHARMACY' ? acct.store?.name || 'Pharmacy partner' : [acct?.role, acct?.profile?.qualification].filter(Boolean).join(' · ')}</Text>
        {acct && (
          <View style={styles.ratingRow}>
            <Star size={16} color={C.gold} fill={acct.rating.average ? C.gold : 'transparent'} />
            <Text style={styles.ratingText}>{acct.rating.average ? `${acct.rating.average.toFixed(1)} · ${acct.rating.count} reviews` : 'New · no reviews yet'}</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 16, gap: 14 }}>
        {error && <Text style={ui.error}>{error}</Text>}
        {!acct && !error && <ActivityIndicator color={C.brand} style={{ marginTop: 20 }} />}

        {e && (
          <>
            <Text style={ui.label}>Earnings</Text>
            <View style={styles.grid}>
              <Tile icon={IndianRupee} label={`Today · ${e.todayJobs} ${acct?.kind === 'PHARMACY' ? 'orders' : 'visits'}`} value={inr(e.today)} />
              <Tile icon={Wallet} label="This week" value={inr(e.week)} />
              <Tile icon={BadgeCheck} label={`All time · ${e.jobs} jobs`} value={inr(e.allTime)} />
              <Tile icon={IndianRupee} label="Next weekly payout" value={inr(Math.max(0, e.netPayout))} />
            </View>
            {e.cashHeld > 0 && (
              <Text style={ui.muted}>You hold {inr(e.cashHeld)} in cash from customers; it’s taken off your payout ({inr(e.pendingPayout)} earned − {inr(e.cashHeld)} cash).</Text>
            )}
            <Text style={ui.muted}>Payouts go to your bank every Monday. Add or change your bank account by contacting Nabz support.</Text>
          </>
        )}

        {acct?.referral && (
          <View style={[styles.card, { gap: 10 }]}>
            <View style={styles.inline}><Gift size={18} color={C.brand} /><Text style={ui.h3}>Refer and keep more</Text></View>
            <Text style={ui.muted}>
              When someone you refer completes their first order (customers, {inr(acct.referral.minFirstOrder)} or more) or their first job (partners),
              your next {acct.referral.rewardJobs} jobs carry only {acct.referral.reducedCommissionPercent}% Nabz commission.
            </Text>
            <View style={styles.codeBox}>
              <Text style={styles.code} selectable>{acct.referral.code}</Text>
            </View>
            <View style={styles.inline}>
              <Text style={[ui.muted, { flex: 1 }]}>{acct.referral.successful} successful referrals · {acct.referral.credits} low-commission jobs left</Text>
            </View>
            <Pressable style={ui.btnDark} onPress={shareCode} accessibilityRole="button">
              <View style={styles.inline}><Share2 size={16} color={C.onNight} /><Text style={[ui.btnText, { color: C.onNight }]}>Share my code</Text></View>
            </Pressable>
          </View>
        )}

        {acct?.kind === 'STAFF' && v && (
          <View style={[styles.card, { gap: 8 }]}>
            <Text style={ui.h3}>Verification</Text>
            <Check ok={v.id} icon={Fingerprint} label="ID verified" />
            <Check ok={v.police} icon={ShieldCheck} label="Police verification" />
            <Check ok={v.council} icon={BadgeCheck} label="Council registration" />
            <Check ok={v.vaccinated} icon={Syringe} label="Vaccinated" />
            {!(v.id && v.police && v.council) && <Text style={ui.muted}>You can go online once ID, police and council checks are done. Our team will call you.</Text>}
          </View>
        )}

        {acct?.kind === 'PHARMACY' && acct.store && (
          <View style={[styles.card, { gap: 6 }]}>
            <View style={styles.inline}><Store size={18} color={C.brand} /><Text style={ui.h3}>{acct.store.name}</Text></View>
            {acct.store.address ? <Text style={ui.muted}>{acct.store.address}</Text> : null}
            <Text style={ui.muted}>Status: {acct.store.status}{acct.store.licence ? ` · Licence ${acct.store.licence}` : ''}</Text>
          </View>
        )}

        {acct && (
          <View style={[styles.card, { gap: 4 }]}>
            <Text style={ui.h3}>Contact details</Text>
            <Text style={ui.muted}>{acct.email}</Text>
            {acct.phone ? <Text style={ui.muted}>{acct.phone}</Text> : null}
          </View>
        )}

        <Pressable style={ui.btnOutline} onPress={signOut} accessibilityRole="button">
          <View style={styles.inline}><LogOut size={16} color={C.roseInk} /><Text style={[ui.btnOutlineText, { color: C.roseInk }]}>Log out</Text></View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Tile({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Icon size={16} color={C.brand} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Check({ ok, icon: Icon, label }: { ok: boolean; icon: typeof Wallet; label: string }) {
  return (
    <View style={styles.inline}>
      <Icon size={16} color={ok ? C.mint : C.faint} />
      <Text style={[ui.body, { flex: 1, color: ok ? C.ink : C.muted }]}>{label}</Text>
      <Text style={[styles.pill, ok ? styles.pillOk : styles.pillWait]}>{ok ? 'Done' : 'Pending'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { backgroundColor: C.night, paddingHorizontal: 18, paddingBottom: 22, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, gap: 4 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  eyebrow: { color: C.onNightMuted, fontFamily: F.heavy, fontSize: 12, letterSpacing: 1 },
  name: { color: C.onNight, fontFamily: F.display, fontSize: 34, lineHeight: 38 },
  sub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 14, textTransform: 'capitalize' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  ratingText: { color: C.onNight, fontFamily: F.bold, fontSize: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, backgroundColor: C.card, borderRadius: 20, padding: 14, gap: 4, ...clay },
  tileValue: { fontFamily: F.heavy, fontSize: 20, color: C.ink },
  tileLabel: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, ...clay },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.brand, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  code: { fontFamily: F.heavy, fontSize: 22, letterSpacing: 3, color: C.ink },
  pill: { fontFamily: F.bold, fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  pillOk: { backgroundColor: C.mintSoft, color: C.mint },
  pillWait: { backgroundColor: C.amberSoft, color: C.amber }
});
