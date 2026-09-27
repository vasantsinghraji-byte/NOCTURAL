import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import type { FeedUpdate } from '@medrush/shared';
import { api } from './api';
import { C, F, shadow, ui } from './theme';

// Campaign buttons use website paths; these are the matching app screens.
const APP_ROUTES: Record<string, Href> = {
  '/pharmacy': '/(tabs)/pharmacy',
  '/nursing': '/(tabs)',
  '/plus': '/(tabs)/account',
  '/orders': '/(tabs)/bookings',
  '/staff': '/staff',
  '/vendor': '/vendor',
  '/partner/account': '/partner-account'
};

/**
 * "Offers & updates" from Nabz (admin panel campaigns), same as the website.
 * Customers see customer offers, partners see partner updates; nothing is
 * rendered when there are none. Long-press an offer code to copy it.
 */
export function UpdatesFeed({ audience, title = 'Offers & updates' }: { audience: 'customer' | 'partner'; title?: string }) {
  const [items, setItems] = useState<FeedUpdate[]>([]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    const load = audience === 'customer' ? api.getMyOffers().then((r) => r.offers) : api.getPartnerUpdates().then((r) => r.updates);
    load.then((rows) => { if (alive) setItems(rows); }).catch(() => undefined);
    return () => { alive = false; };
  }, [audience]));

  const open = (item: FeedUpdate) => {
    (audience === 'customer' ? api.markOfferOpened(item._id) : api.markPartnerUpdateOpened(item._id)).catch(() => undefined);
    const route = item.cta ? APP_ROUTES[item.cta.path.split('?')[0]] : undefined;
    if (route) router.push(route);
  };

  if (!items.length) return null;
  return (
    <View>
      <Text style={ui.section}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={292} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
        {items.map((item) => (
          <View key={item._id} style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <View style={styles.row}>
              {item.offerCode ? <Text selectable style={styles.code} accessibilityLabel={`Offer code ${item.offerCode}. Long-press to copy.`}>{item.offerCode}</Text> : null}
              {item.cta && APP_ROUTES[item.cta.path.split('?')[0]] ? (
                <Pressable onPress={() => open(item)} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.cta}>{item.cta.label} →</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 280, backgroundColor: C.night, borderRadius: 22, padding: 16, gap: 6, ...shadow },
  title: { fontFamily: F.heavy, fontSize: 16, color: C.onNight },
  body: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.onNightMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  code: {
    fontFamily: F.heavy, fontSize: 13, letterSpacing: 1.2, color: C.onNight, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.14)'
  },
  cta: { fontFamily: F.heavy, fontSize: 14, color: C.gold }
});
