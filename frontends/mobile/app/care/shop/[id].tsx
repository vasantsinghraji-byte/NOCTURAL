import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, Building2, Car, ChevronRight, Clock, Home, Languages, MapPin, ShieldCheck, Sparkles, Star, Tag } from 'lucide-react-native';
import type { CareMode, PlanProposalView, RateCardLine, ShopPage } from '@medrush/shared';
import { api } from '@/lib/api';
import CareArt, { WineGradient } from '@/lib/CareArt';
import { KINDS, hoursLabel, inr, problem, useMe, useVisitPlace } from '@/lib/market';
import { Badge, Btn, Empty, Meta, Seg, TopBar } from '@/lib/marketUI';
import { PressScale, Rise, Skeleton } from '@/lib/motion';
import { ShopPosts } from '@/lib/partnerPosts';
import { C, F, clay, ui } from '@/lib/theme';

/**
 * A provider's page, like a restaurant menu: who they are, where they work,
 * and one list of services with a single price for the chosen place (home or
 * clinic). "Book" opens the step-by-step booking for that service.
 */
export default function ShopScreen() {
  const params = useLocalSearchParams<{ id: string; service?: string; mode?: string; proposal?: string }>();
  const id = String(params.id);
  const insets = useSafeAreaInsets();
  const { me, signedIn } = useMe();
  const { place } = useVisitPlace(me?.savedAddresses);
  const [shop, setShop] = useState<ShopPage | null>(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<CareMode>(params.mode === 'CLINIC' ? 'CLINIC' : 'HOME');
  const [proposal, setProposal] = useState<PlanProposalView | null>(null);

  useEffect(() => {
    api.marketStore(id, place.coords || undefined).then((r) => setShop(r.store)).catch((e) => setLoadError(problem(e).message));
  }, [id, place.coords]);
  useEffect(() => {
    if (!shop) return;
    if (mode === 'HOME' && !shop.home.enabled && shop.clinic.enabled) setMode('CLINIC');
    if (mode === 'CLINIC' && !shop.clinic.enabled && shop.home.enabled) setMode('HOME');
  }, [shop, mode]);
  useEffect(() => {
    if (!params.proposal || !signedIn) return;
    api.myProposals().then((r) => setProposal(r.proposals.find((x) => x._id === params.proposal) || null)).catch(() => undefined);
  }, [params.proposal, signedIn]);

  if (loadError) return <View style={ui.screen}><TopBar title="Provider" /><Empty title={loadError} action={<Btn variant="ghost" label="Back to Care" onPress={() => router.replace('/care')} />} /></View>;
  if (!shop) return <View style={ui.screen}><TopBar /><View style={{ padding: 16, gap: 12 }}><Skeleton height={170} radius={28} /><Skeleton height={320} radius={24} /></View></View>;

  const meta = KINDS[shop.kind];
  const both = shop.home.enabled && shop.clinic.enabled;
  const book = (line: RateCardLine, m: CareMode = mode, proposalId?: string) =>
    router.push({ pathname: '/care/book', params: { id, service: line.service._id, mode: m, ...(proposalId ? { proposal: proposalId } : {}) } });
  // Selected service from a list / search first.
  const lines = [...shop.rateCard].sort((a, b) => Number(b.service._id === params.service) - Number(a.service._id === params.service));
  const proposalLine = proposal ? shop.rateCard.find((l) => l.service._id === proposal.service) : undefined;
  const clinicAddress = [shop.clinic.address?.line1, shop.clinic.address?.city].filter(Boolean).join(', ');

  return (
    <View style={ui.screen}>
      <TopBar title={shop.name} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 + insets.bottom, gap: 16 }}>
        <Rise>
          <View style={s.hero}>
            <WineGradient />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={s.heroName} numberOfLines={2}>{shop.name}</Text>
                <Text style={s.heroSub} numberOfLines={2}>{[shop.qualification, shop.experienceYears ? `${shop.experienceYears} years` : ''].filter(Boolean).join(' · ') || meta.label}</Text>
              </View>
              <CareArt kind={meta.art} size={104} style={{ marginRight: -10, marginVertical: -8 }} />
            </View>
            <View style={s.heroBadges}>
              {shop.rating.count > 0 ? <Badge tone="onDark" icon={Star} label={`${shop.rating.avg.toFixed(1)} · ${shop.rating.count} reviews`} /> : <Badge tone="onDark" label="New on Nabz" />}
              {shop.registered ? <Badge tone="onDark" icon={BadgeCheck} label="Verified" /> : null}
              {shop.accredited ? <Badge tone="onDark" icon={ShieldCheck} label="NABL" /> : null}
              {shop.languages.length ? <Badge tone="onDark" icon={Languages} label={shop.languages.slice(0, 2).join(', ')} /> : null}
            </View>
          </View>
        </Rise>

        {shop.isPaused ? <View style={s.paused}><Text style={s.pausedText}>{shop.name} isn’t taking new bookings today. You can still look at prices.</Text></View> : null}

        {proposal && proposalLine ? (
          <PressScale onPress={() => book(proposalLine, proposal.mode, proposal._id)} style={s.proposal} accessibilityRole="button">
            <View style={s.proposalIcon}><Sparkles size={20} color={C.mint} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowName}>Your suggested plan</Text>
              <Meta>{proposal.sessions} × {proposal.serviceName}{proposal.note ? ` · “${proposal.note}”` : ''}</Meta>
            </View>
            <ChevronRight size={18} color={C.mint} />
          </PressScale>
        ) : null}

        {/* Where: one switch sets the price shown on every service */}
        {both ? <Seg value={mode} onChange={setMode} options={[{ value: 'HOME', label: 'At Home', icon: Home }, { value: 'CLINIC', label: 'At Clinic', icon: Building2 }]} /> : null}
        <View style={s.info}>
          {mode === 'HOME' ? (
            <>
              <Car size={16} color={C.brand} />
              <Text style={s.infoText}>
                {shop.travel ? `Travel ${inr(shop.travel.fee)} to ${place.label} (${shop.travel.roadKm} km)` : `Comes to your home within ${shop.home.radiusKm} km · ${inr(shop.home.ratePerKm)}/km travel`}
                {shop.homeCovered === false ? ' · outside their area' : ''}
              </Text>
            </>
          ) : (
            <>
              <MapPin size={16} color={C.brand} />
              <Text style={s.infoText}>{clinicAddress || 'At the clinic'}{Number.isFinite(shop.distanceKm) ? ` · ${shop.distanceKm} km away` : ''}</Text>
            </>
          )}
        </View>

        <Text style={s.menuTitle}>Services</Text>
        {lines.length === 0 ? <Meta>No services listed yet.</Meta> : (
          <View style={s.menu}>
            {lines.map((line, i) => {
              const available = mode === 'HOME' ? line.home.enabled : line.clinic.enabled;
              const p = mode === 'HOME' ? line.home.price : line.clinic.price;
              const maxOff = line.sessionDiscounts.length ? Math.max(...line.sessionDiscounts.map((d) => d.percent)) : 0;
              const other: CareMode = mode === 'HOME' ? 'CLINIC' : 'HOME';
              return (
                <View key={line._id} style={[s.row, i < lines.length - 1 && s.hairline, line.service._id === params.service && { backgroundColor: IS_HL }]}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.rowName}>{line.service.displayName}</Text>
                    <View style={s.rowMeta}>
                      <Clock size={12} color={C.muted} />
                      <Text style={s.rowMetaText}>{hoursLabel(line.durationMinutes)}{maxOff ? ` · save up to ${maxOff}% on plans` : ''}</Text>
                    </View>
                    {line.offer ? <Badge tone="red" icon={Tag} label={line.offer.label} /> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    {available ? <Text style={s.price}>{inr(p)}</Text> : <Text style={s.unavailable}>{mode === 'HOME' ? 'Clinic only' : 'Home only'}</Text>}
                    <PressScale onPress={() => book(line, available ? mode : other)} disabled={shop.isPaused}
                      style={[s.bookBtn, shop.isPaused && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={`Book ${line.service.displayName}`}>
                      <Text style={s.bookText}>Book</Text>
                    </PressScale>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Photos and videos the provider posted (nothing when there are none) */}
        <ShopPosts storeId={id} />

        {shop.bio ? (
          <View style={{ gap: 6 }}>
            <Text style={s.menuTitle}>About</Text>
            <Text style={s.about}>{shop.bio}</Text>
          </View>
        ) : null}
        <Meta>Prices are set by {shop.name}. The full bill, with travel and taxes, is shown before you book. Free cancellation until the professional is on the way.</Meta>
      </ScrollView>
    </View>
  );
}

const IS_HL = C.brandSoft;

const s = StyleSheet.create({
  hero: { borderRadius: 28, padding: 18, overflow: 'hidden', backgroundColor: C.night, gap: 12 },
  heroName: { fontFamily: F.display, fontSize: 24, color: '#ffffff', letterSpacing: -0.5 },
  heroSub: { fontFamily: F.medium, fontSize: 13, color: '#ffd3da' },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  paused: { backgroundColor: C.amberSoft, borderRadius: 16, padding: 12 },
  pausedText: { color: C.amber, fontFamily: F.semi, fontSize: 13 },
  proposal: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.mintSoft, borderRadius: 20, padding: 14 },
  proposalIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  info: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  infoText: { flex: 1, fontFamily: F.semi, fontSize: 13, color: C.inkSoft, lineHeight: 18 },
  menuTitle: { fontFamily: F.display, fontSize: 19, color: C.ink, letterSpacing: -0.3 },
  menu: { backgroundColor: C.card, borderRadius: 22, overflow: 'hidden', ...clay },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  hairline: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  rowName: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowMetaText: { fontFamily: F.medium, fontSize: 12, color: C.muted, flexShrink: 1 },
  price: { fontFamily: F.display, fontSize: 18, color: C.ink },
  unavailable: { fontFamily: F.semi, fontSize: 12, color: C.muted },
  bookBtn: { backgroundColor: C.brand, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  bookText: { color: '#ffffff', fontFamily: F.heavy, fontSize: 13 },
  about: { fontFamily: F.medium, fontSize: 14, color: C.inkSoft, lineHeight: 21 }
});
