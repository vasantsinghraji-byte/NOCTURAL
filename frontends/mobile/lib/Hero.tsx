import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, F, shadow } from './theme';

/** Midnight hero card: serif headline, soft glow orbs for depth (no gradient module). */
export function Hero({ eyebrow, title, subtitle, children, tone = C.night }: {
  eyebrow?: string; title: string; subtitle?: string; children?: ReactNode; tone?: string;
}) {
  return (
    <View style={[styles.hero, { backgroundColor: tone }]}>
      <View style={[styles.orb, { top: -70, right: -50, backgroundColor: 'rgba(255,214,222,0.28)' }]} />
      <View style={[styles.orb, { bottom: -90, left: -60, width: 200, height: 200, backgroundColor: 'rgba(255,232,196,0.16)' }]} />
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 26, padding: 22, overflow: 'hidden', marginBottom: 6, ...shadow },
  orb: { position: 'absolute', width: 190, height: 190, borderRadius: 999 },
  eyebrow: {
    alignSelf: 'flex-start', color: C.onNight, fontFamily: F.heavy, fontSize: 11, letterSpacing: 1.4,
    backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden'
  },
  title: { color: C.onNight, fontSize: 32, fontFamily: F.display, marginTop: 10, lineHeight: 36 },
  sub: { color: C.onNightMuted, marginTop: 8, fontSize: 14, lineHeight: 20, fontFamily: F.medium }
});
