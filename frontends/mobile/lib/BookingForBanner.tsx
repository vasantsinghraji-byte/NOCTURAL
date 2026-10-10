import { StyleSheet, Text, View } from 'react-native';
import { HeartHandshake, X } from 'lucide-react-native';
import { setBookingFor, useBookingFor } from './bookingFor';
import { PressScale } from './motion';
import { C, F } from './theme';

/** "Booking for Kamla (Mother)": shown while a Care Circle booking is in progress. */
export function BookingForBanner() {
  const v = useBookingFor();
  if (!v) return null;
  return (
    <View style={s.box} accessibilityLiveRegion="polite">
      <HeartHandshake size={20} color={C.brandDark} />
      <Text style={s.text}>Booking for <Text style={{ fontFamily: F.heavy }}>{v.name}</Text>{v.relation ? ` (${v.relation})` : ''}</Text>
      <PressScale onPress={() => setBookingFor(null)} accessibilityRole="button" accessibilityLabel="Stop booking for them" style={s.close}>
        <X size={18} color={C.brandDark} />
      </PressScale>
    </View>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.brandSoft, borderRadius: 18, paddingVertical: 8, paddingLeft: 14, paddingRight: 6 },
  text: { flex: 1, fontFamily: F.semi, fontSize: 15, color: C.brandDark },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }
});
