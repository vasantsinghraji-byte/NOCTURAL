import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { CheckCircle2, PhoneCall } from 'lucide-react-native';
import type { CallbackTopic, CallbackView } from '@medrush/shared';
import { api } from './api';
import { useAuth } from './auth';
import { appAlert } from './dialog';
import { useT } from './i18n';
import { fmtClock, problem } from './market';
import { PressScale, success } from './motion';
import { C, F } from './theme';

type Context = { kind: 'VISIT' | 'PLAN' | 'LAB_ORDER' | 'PHARMACY_ORDER'; id: string };

/**
 * "Call me back": a person from Nabz phones the customer. Many people would
 * rather talk than tap; this is always one press away. Shows when a request
 * is already open so a second press doesn't queue another call.
 */
export function CallMeBack({ topic = 'OTHER', context, big = false, label }: { topic?: CallbackTopic; context?: Context; big?: boolean; label?: string }) {
  const { session } = useAuth();
  const { lang } = useT();
  const [open, setOpen] = useState<CallbackView | null>(null);
  const [busy, setBusy] = useState(false);
  const signedIn = session?.kind === 'patient';

  useFocusEffect(useCallback(() => {
    if (!signedIn) return;
    api.myCallback().then((r) => setOpen(r.request && r.request.status === 'OPEN' ? r.request : null)).catch(() => undefined);
  }, [signedIn]));

  const ask = () => {
    if (!signedIn) { router.push('/welcome'); return; }
    appAlert('Should we call you?', 'Someone from Nabz will call your registered number, usually within 15 minutes (8 am to 9 pm).', [
      { text: 'Not Now', style: 'cancel' },
      {
        text: 'Yes, Call Me',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await api.requestCallback({ topic, context, language: lang === 'hi' ? 'hi' : 'en' });
            setOpen(r.request);
            success();
          } catch (e) { appAlert('Couldn’t request a call', problem(e).message); } finally { setBusy(false); }
        }
      }
    ]);
  };

  if (open) {
    return (
      <View style={[s.box, s.done, big && s.big]} accessibilityLiveRegion="polite">
        <CheckCircle2 size={big ? 26 : 20} color={C.mint} />
        <View style={{ flex: 1 }}>
          <Text style={[s.title, big && s.bigTitle]}>We’ll call you soon</Text>
          <Text style={s.sub}>Keep your phone nearby. You asked at {fmtClock(open.createdAt)}.</Text>
        </View>
      </View>
    );
  }
  return (
    <PressScale onPress={ask} disabled={busy} style={[s.box, big && s.big]} accessibilityRole="button" accessibilityLabel={label || 'Call me back. Talk to a person at Nabz'}>
      <View style={[s.icon, big && { width: 52, height: 52, borderRadius: 18 }]}><PhoneCall size={big ? 24 : 20} color={C.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, big && s.bigTitle]}>{label || 'Talk to a person'}</Text>
        <Text style={s.sub}>{busy ? 'Requesting…' : 'Tap and we’ll call you back'}</Text>
      </View>
    </PressScale>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, minHeight: 64 },
  big: { padding: 18, minHeight: 84, borderRadius: 24 },
  done: { backgroundColor: C.mintSoft, borderColor: C.mintSoft },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  bigTitle: { fontSize: 19, fontFamily: F.display },
  sub: { fontFamily: F.medium, fontSize: 13, color: C.muted, marginTop: 2 }
});
