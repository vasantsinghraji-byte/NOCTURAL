import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlarmClock, BellRing, ChevronRight, ClipboardList, EyeOff, IndianRupee, PackageMinus, PackagePlus, PackageX, Settings2, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import type { StoreToday } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { fmtClock, inr, problem } from '@/lib/market';
import { Title } from '@/lib/marketUI';
import { success } from '@/lib/motion';
import { useTabBarSpace } from '@/lib/PillTabBar';
import { C, F, clay, ui } from '@/lib/theme';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/**
 * Pharmacy home: the shop's open switch, today's sales and orders, and the
 * things that need doing (new orders, low or expiring stock), each one tap away.
 */
export default function StoreToday() {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const [data, setData] = useState<StoreToday | null>(null);
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);

  const load = useCallback(() => {
    api.vendorToday().then((r) => { setData(r.today); setError(''); }).catch((e) => setError(problem(e).message));
  }, []);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]));

  const setOpen = (open: boolean) => {
    const apply = async () => {
      setSwitching(true);
      try {
        await api.vendorUpdateProfile({ isOpen: open });
        success();
        load();
      } catch (e) { appAlert('Couldn’t change it', problem(e).message); } finally { setSwitching(false); }
    };
    if (open) { apply(); return; }
    appAlert('Close the shop?', 'Customers won’t be able to order from you until you open again. Orders you already have stay.', [
      { text: 'Stay open', style: 'cancel' },
      { text: 'Close shop', style: 'destructive', onPress: apply }
    ]);
  };

  if (!data) {
    return (
      <View style={[ui.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        {error ? <Text style={s.errorText} onPress={load}>{error}{'\n'}Tap to try again.</Text> : <ActivityIndicator color={C.brand} />}
      </View>
    );
  }

  const { shop, orders, sales, stock } = data;
  const paused = shop.pausedUntil && new Date(shop.pausedUntil) > new Date();
  const statusLine = paused
    ? `Paused by Nabz until ${fmtClock(shop.pausedUntil as string)}${shop.pauseReason ? `: ${shop.pauseReason}` : ''}`
    : !shop.isOpen ? 'Customers can’t order from you now'
      : shop.openNow ? 'Customers near you can order now' : 'Closed by your opening hours right now';
  const vsYesterday = sales.yesterday > 0 ? Math.round(((sales.today - sales.yesterday) / sales.yesterday) * 100) : null;

  const todo: Array<{ key: string; show: boolean; icon: LucideIcon; tone: 'red' | 'amber' | 'neutral'; title: string; text: string; go: () => void }> = [
    { key: 'new', show: orders.new > 0, icon: BellRing, tone: 'red', title: `${orders.new} new order${orders.new === 1 ? '' : 's'}`, text: 'Accept quickly or they move to another store', go: () => router.push('/vendor') },
    { key: 'pulled', show: stock.pulledBatches > 0, icon: TriangleAlert, tone: 'red', title: `${stock.pulledBatches} batch${stock.pulledBatches === 1 ? '' : 'es'} off sale`, text: 'Too close to expiry or recalled. Take them off the shelf', go: () => router.push({ pathname: '/stock', params: { filter: 'expiring' } }) },
    { key: 'out', show: stock.out > 0, icon: PackageX, tone: 'red', title: `${stock.out} out of stock`, text: 'Customers can’t order these until you restock', go: () => router.push({ pathname: '/stock', params: { filter: 'out' } }) },
    { key: 'low', show: stock.low > 0, icon: PackageMinus, tone: 'amber', title: `${stock.low} running low`, text: 'Reorder from your distributor soon', go: () => router.push({ pathname: '/stock', params: { filter: 'low' } }) },
    { key: 'exp', show: stock.expiringBatches > 0, icon: AlarmClock, tone: 'amber', title: `${stock.expiringBatches} batch${stock.expiringBatches === 1 ? '' : 'es'} expiring soon`, text: 'Sell these first or return them', go: () => router.push({ pathname: '/stock', params: { filter: 'expiring' } }) },
    { key: 'hidden', show: stock.hidden > 0, icon: EyeOff, tone: 'neutral', title: `${stock.hidden} hidden from customers`, text: 'Switched off by you', go: () => router.push({ pathname: '/stock', params: { filter: 'hidden' } }) }
  ];
  const shown = todo.filter((t) => t.show);

  return (
    <View style={ui.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabSpace }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.brand} />}>
        <View style={[s.head, { paddingTop: insets.top + 14 }]}>
          <Text style={s.hello}>{greet()},</Text>
          <Text style={s.name} numberOfLines={2}>{shop.name}</Text>
          <View style={[s.open, shop.isOpen && !paused && s.openOn]}>
            <View style={{ flex: 1 }}>
              <Text style={s.openTitle}>{paused ? 'Paused' : shop.isOpen ? 'Shop is open' : 'Shop is closed'}</Text>
              <Text style={s.openSub}>{statusLine}</Text>
            </View>
            {switching ? <ActivityIndicator color="#ffffff" /> : (
              <Switch value={shop.isOpen} onValueChange={setOpen} trackColor={{ true: '#3dd68c', false: 'rgba(255,255,255,0.25)' }} thumbColor="#ffffff"
                accessibilityLabel={shop.isOpen ? 'Shop open. Double tap to close' : 'Shop closed. Double tap to open'} />
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Tile icon={IndianRupee} label="Sales today" value={inr(sales.today)} sub={vsYesterday === null ? `${orders.deliveredToday} delivered` : `${vsYesterday >= 0 ? '+' : ''}${vsYesterday}% vs yesterday`} />
            <Tile icon={BellRing} label="New" value={String(orders.new)} sub="to accept" />
            <Tile icon={ClipboardList} label="In progress" value={String(orders.inProgress)} sub="packing / on way" />
          </View>
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          {error ? <Text style={s.errorText}>{error}</Text> : null}
          <Title size={20}>{shown.length ? 'Needs your attention' : 'All good'}</Title>
          {shown.length === 0 ? (
            <View style={s.card}><Text style={s.rowText}>No new orders and no stock problems. Nice work.</Text></View>
          ) : shown.map((t) => (
            <Pressable key={t.key} onPress={t.go} accessibilityRole="button" accessibilityLabel={`${t.title}. ${t.text}`} style={({ pressed }) => [s.row, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
              <View style={[s.rowIcon, t.tone === 'red' ? { backgroundColor: C.brandSoft } : t.tone === 'amber' ? { backgroundColor: C.amberSoft } : { backgroundColor: C.cardAlt }]}>
                <t.icon size={22} color={t.tone === 'red' ? C.brand : t.tone === 'amber' ? C.amber : C.inkSoft} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{t.title}</Text>
                <Text style={s.rowText}>{t.text}</Text>
              </View>
              <ChevronRight size={20} color={C.muted} />
            </Pressable>
          ))}

          <Title size={20}>Quick actions</Title>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Action icon={PackagePlus} label="Receive stock" onPress={() => router.push({ pathname: '/stock', params: { receive: '1' } })} />
            <Action icon={Settings2} label="Shop settings" onPress={() => router.push('/store-settings')} />
          </View>
          <View style={s.card}>
            <Text style={s.rowText}>
              {stock.listed} products listed{data.acceptanceRate !== null ? ` · you accept ${data.acceptanceRate}% of orders` : ''}
              {shop.rating.count ? ` · rated ${shop.rating.average.toFixed(1)} by ${shop.rating.count}` : ''}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Tile({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub: string }) {
  return (
    <View style={s.tile} accessible accessibilityLabel={`${label}: ${value}, ${sub}`}>
      <Icon size={16} color={C.gold} />
      <Text style={s.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.tileLabel} numberOfLines={2}>{label} · {sub}</Text>
    </View>
  );
}

function Action({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.action, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
      <View style={s.actionIcon}><Icon size={22} color={C.brand} /></View>
      <Text style={s.actionText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  head: { backgroundColor: C.night, paddingHorizontal: 18, paddingBottom: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, gap: 14 },
  hello: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 15 },
  name: { color: '#ffffff', fontFamily: F.display, fontSize: 30, marginTop: -10 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  openOn: { borderColor: 'rgba(61,214,140,0.6)', backgroundColor: 'rgba(61,214,140,0.14)' },
  openTitle: { color: '#ffffff', fontFamily: F.bold, fontSize: 17 },
  openSub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 13 },
  tile: { flex: 1, borderRadius: 16, padding: 12, gap: 3, backgroundColor: 'rgba(255,255,255,0.08)' },
  tileValue: { color: '#ffffff', fontFamily: F.display, fontSize: 20 },
  tileLabel: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, padding: 14, minHeight: 72, ...clay },
  rowIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  rowText: { fontFamily: F.medium, fontSize: 14, color: C.muted, lineHeight: 20 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 14, ...clay },
  action: { flex: 1, backgroundColor: C.card, borderRadius: 20, padding: 14, gap: 10, minHeight: 96, ...clay },
  actionIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  errorText: { color: C.roseInk, fontFamily: F.semi, fontSize: 14, textAlign: 'center' }
});
