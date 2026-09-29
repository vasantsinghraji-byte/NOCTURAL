import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, ShieldCheck } from 'lucide-react-native';
import { PressScale } from './motion';
import { C, F, clay } from './theme';

/** Home "Care at home" strip: photo cards that open the matching service. */
const MOMENTS = [
  {
    id: 'elderly',
    image: require('../assets/images/welcome/slide-elderly.jpg'),
    title: 'Elderly care at home',
    line: 'Nursing and vitals checks for parents',
    serviceType: 'ELDERLY_CARE'
  },
  {
    id: 'physio',
    image: require('../assets/images/welcome/slide-physio.jpg'),
    title: 'Physio in your living room',
    line: 'Knee, back and post-surgery rehab',
    serviceType: 'PHYSIOTHERAPY_SESSION'
  },
  {
    id: 'verified',
    image: require('../assets/images/welcome/slide-safety.jpg'),
    title: 'Verified before every visit',
    line: 'ID, council and police checked',
    serviceType: null
  }
] as const;

export function CareMoments({ available, onPick }: { available: (serviceType: string) => boolean; onPick: (serviceType: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={252} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
      {MOMENTS.map((m) => {
        const bookable = m.serviceType !== null && available(m.serviceType);
        return (
          <PressScale key={m.id} style={styles.card} disabled={!bookable} onPress={() => m.serviceType && onPick(m.serviceType)}>
            <Image source={m.image} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
            <View style={styles.body}>
              <Text style={styles.title}>{m.title}</Text>
              <View style={styles.lineRow}>
                {m.serviceType === null ? <ShieldCheck size={13} color={C.brand} /> : null}
                <Text style={styles.line} numberOfLines={1}>{m.line}</Text>
                {bookable ? <ChevronRight size={15} color={C.muted} /> : null}
              </View>
            </View>
          </PressScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, borderRadius: 24, backgroundColor: C.card, overflow: 'hidden', ...clay },
  photo: { width: '100%', height: 140 },
  body: { padding: 14, gap: 4 },
  title: { fontFamily: F.heavy, fontSize: 15, color: C.ink },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  line: { flex: 1, fontFamily: F.medium, fontSize: 12.5, color: C.muted }
});
