import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, AppState, Easing, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Redirect } from 'expo-router';
import * as Location from 'expo-location';
import {
  BadgeCheck, Circle, Flame, IndianRupee, LogOut, MapPin, Navigation, Package, ShieldAlert, Star, Store, Wallet
} from 'lucide-react-native';
import type { CareBooking, StaffDashboard, VisitOffer } from '@medrush/shared';
import { api, describeNetworkError } from '@/lib/api';
import { STAFF_ROLES, useAuth } from '@/lib/auth';
import { DEMO_POINT, inr } from '@/lib/care';
import { PressScale, Rise, success, tap, warn } from '@/lib/motion';
import { registerForServerPush } from '@/lib/notifications';
import * as SecureStore from 'expo-secure-store';
import { LIVE_VISITS_KEY, PARTNER_DEMO_KEY, isBackgroundOnline, startBackgroundOnline, stopBackgroundOnline } from '@/lib/partnerOnline';
import { startRinging, stopRinging } from '@/lib/ringer';
import { DEMO_AREA_ENABLED } from '@/lib/variant';
import { C, F, shadow, ui } from '@/lib/theme';
import { appAlert } from '@/lib/dialog';

type StoreInfo = { name?: string; address?: { line1?: string } };
type Visit = Omit<CareBooking, 'supplies'> & {
  supplies?: Omit<NonNullable<CareBooking['supplies']>, 'pharmacyVendor'> & { pharmacyVendor?: StoreInfo | string };
};

const NEXT: Record<string, { step: 'confirm' | 'en-route' | 'start' | 'complete'; label: string } | undefined> = {
  ASSIGNED: { step: 'confirm', label: 'Accept visit' },
  CONFIRMED: { step: 'en-route', label: 'I’m on my way' },
  EN_ROUTE: { step: 'start', label: 'Arrived · enter visit code' },
  IN_PROGRESS: { step: 'complete', label: 'Complete visit' }
};
const LIVE_STATUSES = ['CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const HEARTBEAT_MS = 30_000;
const OFFER_POLL_MS = 5_000;
const OFFER_TTL_S = 45;

const hello = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** Nabz Partner (medical staff): go online, get offers with a countdown, earnings, visits. */
export default function StaffHome() {
  const insets = useSafeAreaInsets();
  const { session, logout } = useAuth();
  const [dash, setDash] = useState<StaffDashboard | null>(null);
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [offer, setOffer] = useState<VisitOffer | null>(null);
  const [online, setOnline] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeFor, setCodeFor] = useState<Visit | null>(null);
  const [completeFor, setCompleteFor] = useState<Visit | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visitsRef = useRef<Visit[]>([]);
  const offerIdRef = useRef<string | null>(null);
  const demoRef = useRef(false); // staging: working in the Jaipur demo area
  const [bgHint, setBgHint] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getMyAssignedVisits().then((r) => {
      const list = (r.data || []) as Visit[];
      visitsRef.current = list;
      // The background task shares my location on these visits while the app is closed.
      SecureStore.setItemAsync(LIVE_VISITS_KEY, JSON.stringify(list.filter((v) => LIVE_STATUSES.includes(v.status)).map((v) => v._id)))
        .catch(() => undefined);
      setVisits(list);
      setError(null);
    }).catch((e) => setError(describeNetworkError(e)));
    api.getStaffDashboard().then((r) => setDash(r.dashboard)).catch(() => undefined);
  }, []);

  /** Heartbeat: keeps me discoverable and moves my pin on customers' tracking maps. */
  const publish = useCallback(async (coords: { lat: number; lng: number }) => {
    try {
      await api.setStaffAvailability(true, coords);
      await Promise.all(visitsRef.current
        .filter((v) => LIVE_STATUSES.includes(v.status))
        .map((v) => api.shareVisitLocation(v._id, coords.lat, coords.lng).catch(() => undefined)));
      setLastPing(new Date());
    } catch (e) {
      setError(describeNetworkError(e));
    }
  }, []);

  const stopTracking = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTracking = useCallback(async (askForBackground = true) => {
    stopTracking();
    // Preferred: background online mode (foreground service) so requests ring
    // even when the app is closed or the phone is locked.
    const background = askForBackground ? await startBackgroundOnline() : await isBackgroundOnline() || await startBackgroundOnline();
    if (background) {
      setBgHint(null);
      return;
    }
    setBgHint('Keep Nabz Partner open to get requests. To get them when the app is closed, allow location "All the time" for Nabz Partner in Settings.');
    if (demoRef.current) {
      // Staging demo area: report the Jaipur demo point instead of GPS.
      publish(DEMO_POINT);
      timerRef.current = setInterval(() => publish(DEMO_POINT), HEARTBEAT_MS);
      return;
    }
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 30 },
      (pos) => publish({ lat: pos.coords.latitude, lng: pos.coords.longitude })
    );
    // Standing still doesn't fire the watcher; heartbeat anyway so I stay discoverable.
    timerRef.current = setInterval(async () => {
      const pos = await Location.getLastKnownPositionAsync({ maxAge: HEARTBEAT_MS * 2 });
      if (pos) publish({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }, HEARTBEAT_MS);
  }, [publish, stopTracking]);

  useEffect(() => {
    load();
    (async () => {
      // Restore the demo-area choice before resuming, so a restart never reports GPS by mistake.
      if (DEMO_AREA_ENABLED) demoRef.current = (await SecureStore.getItemAsync(PARTNER_DEMO_KEY).catch(() => null)) === '1';
      const r = await api.getStaffAvailability();
      // Server says online (e.g. app restarted): resume heartbeats.
      if (r.availability.online) {
        const perm = demoRef.current ? { granted: true } : await Location.getForegroundPermissionsAsync();
        if (perm.granted) { setOnline(true); startTracking(false); }
      }
    })().catch(() => undefined);
    return () => stopTracking();
  }, [load, startTracking, stopTracking]);

  // While online: poll for a visit offer (Uber-style request card).
  useEffect(() => {
    if (!online) { setOffer(null); return undefined; }
    const poll = () => api.getMyOffer().then((r) => {
      const next = r.offer;
      // Ring like a phone call until the partner answers or the offer expires.
      if (next && offerIdRef.current !== next.bookingId && AppState.currentState === 'active') startRinging();
      if (!next) stopRinging();
      offerIdRef.current = next ? next.bookingId : null;
      setOffer(next);
    }).catch(() => undefined);
    poll();
    const tm = setInterval(poll, OFFER_POLL_MS);
    // Leaving the screen hands ringing over to the background notification.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
      else stopRinging();
    });
    return () => { clearInterval(tm); sub.remove(); stopRinging(); };
  }, [online]);

  async function toggleOnline(next: boolean) {
    setSwitching(true);
    setError(null);
    try {
      if (next) {
        if (DEMO_AREA_ENABLED) {
          const where = await new Promise<'live' | 'demo' | null>((resolve) => appAlert(
            'Where are you working today?',
            'Testing from outside Jaipur? Use the Jaipur demo area so Jaipur bookings can reach you.',
            [
              { text: 'My live location', onPress: () => resolve('live') },
              { text: 'Jaipur demo area', onPress: () => resolve('demo') },
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) }
            ],
            { cancelable: true, onDismiss: () => resolve(null) }
          ));
          if (!where) return;
          demoRef.current = where === 'demo';
          if (where === 'demo') SecureStore.setItemAsync(PARTNER_DEMO_KEY, '1').catch(() => undefined);
          else SecureStore.deleteItemAsync(PARTNER_DEMO_KEY).catch(() => undefined);
        }
        if (demoRef.current) {
          await api.setStaffAvailability(true, DEMO_POINT);
          setOnline(true);
          setLastPing(new Date());
          success();
          startTracking();
          return;
        }
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          appAlert('Location needed', 'Allow location so patients near you can book you and track your arrival.');
          return;
        }
        registerForServerPush().catch(() => undefined);
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await api.setStaffAvailability(true, { lat: pos.coords.latitude, lng: pos.coords.longitude });
        setOnline(true);
        setLastPing(new Date());
        success();
        startTracking();
      } else {
        stopTracking();
        await stopBackgroundOnline();
        stopRinging();
        await api.setStaffAvailability(false);
        setOnline(false);
        setBgHint(null);
        tap();
      }
      load();
    } catch (e) {
      setError(describeNetworkError(e));
    } finally {
      setSwitching(false);
    }
  }

  async function respond(accept: boolean) {
    if (!offer) return;
    const id = offer.bookingId;
    setOffer(null);
    stopRinging();
    try {
      if (accept) { await api.acceptOffer(id); success(); } else { await api.declineOffer(id); tap(); }
    } catch (e) {
      setError(describeNetworkError(e));
    }
    load();
  }

  async function step(v: Visit, s: 'confirm' | 'en-route' | 'start' | 'complete', body?: { visitCode?: string; observations?: string; cashCollected?: number }) {
    try {
      await api.updateVisitStep(v._id, s, body);
      success();
      load();
      return true;
    } catch (e) {
      warn();
      setError(describeNetworkError(e));
      return false;
    }
  }

  function sos(v: Visit) {
    appAlert('Need help?', 'Nabz safety team will be alerted with your location.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Alert Nabz', style: 'destructive', onPress: async () => {
          const pos = await Location.getLastKnownPositionAsync().catch(() => null);
          api.raiseSos(v._id, pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {})
            .then(() => appAlert('Alert sent', 'Our safety team will call you now. For emergencies call 112.'))
            .catch((e) => appAlert('Could not reach Nabz', `${describeNetworkError(e)}\n\nCall 112 for emergencies.`));
        }
      }
    ]);
  }

  if (!session) return <Redirect href="/login" />;
  if (!STAFF_ROLES.includes(session.role)) return <Redirect href="/" />;

  const first = (dash?.name || session.name).split(' ')[0];
  const ver = dash?.profile.verified;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        {/* Midnight header: greeting + big online switch */}
        <View style={[styles.head, { paddingTop: insets.top + 14 }]}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hello}>{hello()},</Text>
              <Text style={styles.name}>{first}</Text>
            </View>
            <Pressable hitSlop={10} onPress={async () => { if (online) await toggleOnline(false); logout(); }} style={styles.iconBtn}>
              <LogOut size={18} color={C.onNightMuted} />
            </Pressable>
          </View>

          <View style={[styles.online, online && styles.onlineOn]}>
            <Circle size={12} color={online ? C.mint : C.onNightMuted} fill={online ? C.mint : 'transparent'} />
            <View style={{ flex: 1 }}>
              <Text style={styles.onlineTitle}>{online ? 'You’re online' : 'You’re offline'}</Text>
              <Text style={styles.onlineSub}>
                {online
                  ? `Getting requests nearby${lastPing ? ` · updated ${lastPing.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                  : 'Go online to get visit requests'}
              </Text>
            </View>
            {switching ? <ActivityIndicator color={C.onNight} /> : (
              <Switch
                value={online}
                disabled={!online && !!ver && !(ver.id && ver.police && ver.council)}
                onValueChange={toggleOnline}
                trackColor={{ true: '#3dd68c', false: 'rgba(255,255,255,0.2)' }}
                thumbColor="#ffffff"
              />
            )}
          </View>

          <View style={styles.earnRow}>
            <Earn icon={IndianRupee} label="Today" value={inr(dash?.today.earnings ?? 0)} sub={`${dash?.today.visits ?? 0} visits`} />
            <Earn icon={Wallet} label="This week" value={inr(dash?.week.earnings ?? 0)} sub={`${dash?.week.visits ?? 0} visits`} />
            <Earn icon={Star} label="Rating" value={dash?.rating ? Number(dash.rating).toFixed(1) : 'New'} sub={`${dash?.totalReviews ?? 0} reviews`} />
          </View>
          {dash && dash.pendingPayout > 0 && <Text style={styles.payout}>Next weekly payout: {inr(dash.pendingPayout)}</Text>}
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          {error && <Text style={ui.error}>{error}</Text>}
          {online && bgHint && <Text style={styles.bgHint}>{bgHint}</Text>}

          {offer && <OfferCard offer={offer} onAccept={() => respond(true)} onDecline={() => respond(false)} />}

          {online && !offer && dash?.demand?.length ? (
            <View style={ui.card}>
              <View style={styles.inline}><Flame size={16} color={C.accent} /><Text style={ui.h3}>Busy near you (last 7 days)</Text></View>
              <View style={{ gap: 8, marginTop: 10 }}>
                {dash.demand.map((d, i) => (
                  <View key={`${d.lat},${d.lng}`} style={styles.demandRow}>
                    <Text style={[ui.muted, { width: 80 }]}>{d.pincode || `Area ${i + 1}`}</Text>
                    <View style={styles.demandTrack}>
                      <View style={[styles.demandBar, { width: `${Math.max(12, (d.count / dash.demand[0].count) * 100)}%` }]} />
                    </View>
                    <Text style={styles.demandCount}>{d.count}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {ver && !(ver.id && ver.police && ver.council) && (
            <View style={[ui.card, { gap: 8 }]}>
              <View style={styles.inline}><BadgeCheck size={16} color={C.brand} /><Text style={ui.h3}>Verification pending</Text></View>
              <Text style={ui.muted}>You can go online once your ID, police check and council registration are verified.</Text>
              {[['ID proof', ver.id], ['Police verification', ver.police], ['Council registration', ver.council], ['Vaccination', ver.vaccinated]].map(([label, ok]) => (
                <View key={String(label)} style={styles.inline}>
                  <Circle size={10} color={ok ? C.mint : C.faint} fill={ok ? C.mint : 'transparent'} />
                  <Text style={[ui.muted, ok ? { color: C.ink } : null]}>{String(label)}{ok ? ' · verified' : ' · pending'}</Text>
                </View>
              ))}
              <Text style={ui.muted}>Our team verifies documents. Call partner support to schedule.</Text>
            </View>
          )}

          <Text style={ui.section}>Your visits</Text>
          {visits === null && <ActivityIndicator color={C.brand} />}
          {visits?.length === 0 && <Text style={ui.muted}>No visits yet. Go online to receive requests. Pull down to refresh.</Text>}
          {visits?.map((v) => {
            const store = v.supplies && typeof v.supplies.pharmacyVendor === 'object' ? v.supplies.pharmacyVendor : null;
            const next = NEXT[v.status];
            return (
              <Rise key={v._id} style={[ui.card, { gap: 6 }]}>
                <View style={styles.row}>
                  <Text style={ui.h3}>{v.serviceType.replace(/_/g, ' ')}</Text>
                  <View style={ui.pill}><Text style={ui.pillText}>{v.status.replace(/_/g, ' ')}</Text></View>
                </View>
                <Text style={ui.muted}>{v.dispatch?.mode === 'ASAP' ? 'Now' : `${String(v.scheduledDate).slice(0, 10)} · ${v.scheduledTime}`}</Text>
                <View style={styles.inline}><MapPin size={14} color={C.muted} /><Text style={ui.muted}>{v.serviceLocation?.address?.street}, {v.serviceLocation?.address?.pincode}</Text></View>
                {LIVE_STATUSES.includes(v.status) && online && (
                  <View style={styles.inline}><Navigation size={14} color={C.mint} /><Text style={[ui.muted, { color: C.mint }]}>Patient can see your live location</Text></View>
                )}
                {v.supplies?.status === 'ORDERED' && (
                  <View style={ui.good}>
                    <View style={styles.inline}><Store size={16} color={C.brand} /><Text style={ui.h3}>Pick up from {store?.name || 'partner pharmacy'}</Text></View>
                    {store?.address?.line1 ? <Text style={ui.muted}>{store.address.line1}</Text> : null}
                    {v.supplies.items.filter((i) => i.source === 'STAFF_BRINGS').map((i) => (
                      <Text key={i.key} style={ui.muted}>{i.quantity} × {i.name}</Text>
                    ))}
                    <Text style={[ui.muted, { marginTop: 4 }]}>Collect {inr(v.supplies.amount || 0)} from the patient for supplies.</Text>
                  </View>
                )}
                {v.supplies?.items?.some((i) => i.source === 'PATIENT_HAS') && (
                  <Text style={ui.muted}>Patient has: {v.supplies.items.filter((i) => i.source === 'PATIENT_HAS').map((i) => i.name).join(', ')}</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {next && (
                    <PressScale style={[ui.btnDark, { flex: 1, paddingVertical: 13 }]} onPress={() => {
                      if (next.step === 'start') setCodeFor(v);
                      else if (next.step === 'complete') setCompleteFor(v);
                      else step(v, next.step);
                    }}>
                      <Text style={[ui.btnText, { color: C.onNight }]}>{next.label}</Text>
                    </PressScale>
                  )}
                  {LIVE_STATUSES.includes(v.status) && (
                    <PressScale style={styles.sosBtn} onPress={() => sos(v)}><ShieldAlert size={18} color="#ffffff" /></PressScale>
                  )}
                </View>
              </Rise>
            );
          })}
        </View>
      </ScrollView>

      <CodeSheet
        visit={codeFor}
        onClose={() => setCodeFor(null)}
        onSubmit={async (code) => { const ok = codeFor ? await step(codeFor, 'start', { visitCode: code }) : false; if (ok) setCodeFor(null); return ok; }}
      />
      <CompleteSheet
        visit={completeFor}
        onClose={() => setCompleteFor(null)}
        onSubmit={async (report) => { const ok = completeFor ? await step(completeFor, 'complete', report) : false; if (ok) setCompleteFor(null); }}
      />
    </View>
  );
}

function Earn({ icon: Icon, label, value, sub }: { icon: typeof Star; label: string; value: string; sub: string }) {
  return (
    <View style={styles.earn}>
      <Icon size={14} color={C.gold} />
      <Text style={styles.earnValue}>{value}</Text>
      <Text style={styles.earnLabel}>{label} · {sub}</Text>
    </View>
  );
}

/** Uber-style request: earnings first, countdown bar, accept / decline. */
function OfferCard({ offer, onAccept, onDecline }: { offer: VisitOffer; onAccept: () => void; onDecline: () => void }) {
  const left = Math.max(0, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000));
  const [secs, setSecs] = useState(left);
  const bar = useRef(new Animated.Value(left / OFFER_TTL_S)).current;
  useEffect(() => {
    bar.setValue(left / OFFER_TTL_S);
    Animated.timing(bar, { toValue: 0, duration: left * 1000, easing: Easing.linear, useNativeDriver: false }).start();
    const tm = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.bookingId]);

  return (
    <Rise style={styles.offer}>
      <View style={styles.row}>
        <Text style={styles.offerKicker}>NEW REQUEST · {offer.when.toUpperCase()}</Text>
        <Text style={styles.offerSecs}>{secs}s</Text>
      </View>
      <View style={styles.offerTrack}>
        <Animated.View style={[styles.offerBar, { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
      <Text style={styles.offerEarn}>{inr(offer.earnings)}</Text>
      <Text style={styles.offerService}>{offer.serviceType.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}{offer.patientFirstName ? ` · for ${offer.patientFirstName}` : ''}</Text>
      <View style={styles.inline}>
        <MapPin size={14} color={C.onNightMuted} />
        <Text style={styles.offerMeta}>{offer.distanceKm !== null ? `${offer.distanceKm} km · ` : ''}{offer.area}</Text>
      </View>
      {offer.supplies && (
        <View style={styles.inline}>
          <Package size={14} color={C.gold} />
          <Text style={styles.offerMeta}>Pick up at {offer.supplies.store || 'partner pharmacy'}: {offer.supplies.items.join(', ')}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <PressScale style={styles.decline} onPress={onDecline}><Text style={styles.declineText}>Decline</Text></PressScale>
        <PressScale style={styles.accept} onPress={onAccept}><Text style={styles.acceptText}>Accept</Text></PressScale>
      </View>
    </Rise>
  );
}

/** Patient tells the nurse a 4-digit code at the door; the visit can't start without it. */
function CodeSheet({ visit, onClose, onSubmit }: { visit: Visit | null; onClose: () => void; onSubmit: (code: string) => Promise<boolean> }) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCode(''); }, [visit?._id]);
  async function go(value: string) {
    setBusy(true);
    const ok = await onSubmit(value);
    setBusy(false);
    if (!ok) setCode('');
  }
  return (
    <Modal visible={!!visit} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.grabber} />
          <Text style={[ui.display, { fontSize: 30 }]}>Enter visit code</Text>
          <Text style={ui.body}>Ask the patient for the 4-digit code shown in their Nabz app.</Text>
          <TextInput
            autoFocus value={code} keyboardType="number-pad" maxLength={4} style={styles.codeInput}
            onChangeText={(v) => { const d = v.replace(/\D/g, ''); setCode(d); if (d.length === 4) go(d); }}
          />
          {busy && <ActivityIndicator color={C.brand} />}
          <Pressable onPress={onClose}><Text style={[ui.muted, { textAlign: 'center', fontFamily: F.bold }]}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** What the nurse should collect in cash: the visit plus supplies they brought. */
function cashDue(v: Visit | null) {
  if (!v || v.payment?.status === 'PAID') return null;
  const supplies = v.supplies?.status === 'ORDERED' ? v.supplies.amount || 0 : 0;
  return Math.round(((v.pricing?.payableAmount || 0) + supplies) * 100) / 100;
}

function CompleteSheet({ visit, onClose, onSubmit }: {
  visit: Visit | null; onClose: () => void;
  onSubmit: (report: { observations?: string; cashCollected?: number }) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState('');
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState(false);
  const due = cashDue(visit);
  useEffect(() => { setNotes(''); setCash(due !== null ? String(due) : ''); }, [visit?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  const cashNum = Number(cash);
  const cashInvalid = due !== null && (cash.trim() === '' || !Number.isFinite(cashNum) || cashNum < 0);
  async function submit() {
    if (cashInvalid) return;
    const go = async () => {
      setBusy(true);
      await onSubmit({ ...(notes.trim() ? { observations: notes.trim() } : {}), ...(due !== null ? { cashCollected: cashNum } : {}) });
      setBusy(false);
    };
    if (due !== null && cashNum + 1 < due) {
      appAlert('Less than the amount due?', `The customer owes ${inr(due)}. You entered ${inr(cashNum)}. Nabz will follow up on the difference.`, [
        { text: 'Fix amount', style: 'cancel' },
        { text: 'Submit anyway', onPress: go }
      ]);
      return;
    }
    await go();
  }
  return (
    <Modal visible={!!visit} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.grabber} />
          <Text style={[ui.display, { fontSize: 30 }]}>Complete visit</Text>
          <TextInput style={[ui.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline value={notes} onChangeText={setNotes}
            placeholder="Visit notes for the patient: what was done, observations (optional)" placeholderTextColor={C.faint} maxLength={1000} />
          {due !== null ? (
            <View style={{ gap: 6 }}>
              <Text style={[ui.h3, { fontSize: 15 }]}>Cash collected</Text>
              <Text style={ui.muted}>Amount due {inr(due)} (visit{visit?.supplies?.status === 'ORDERED' ? ' + supplies' : ''}). Change it if the customer paid a different amount.</Text>
              <TextInput style={ui.input} value={cash} onChangeText={(t) => setCash(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" maxLength={8} placeholder="Amount in ₹" placeholderTextColor={C.faint} />
            </View>
          ) : visit ? <Text style={ui.muted}>Paid online. Nothing to collect.</Text> : null}
          <PressScale style={[ui.btnDark, (busy || cashInvalid) && { opacity: 0.6 }]} disabled={busy || cashInvalid} onPress={submit}>
            {busy ? <ActivityIndicator color={C.onNight} /> : <Text style={[ui.btnText, { color: C.onNight }]}>Mark completed</Text>}
          </PressScale>
          <Pressable onPress={onClose}><Text style={[ui.muted, { textAlign: 'center', fontFamily: F.bold }]}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bgHint: { backgroundColor: C.amberSoft, color: C.amber, padding: 10, borderRadius: 12, overflow: 'hidden', fontFamily: F.semi, fontSize: 13 },
  head: { backgroundColor: C.night, paddingHorizontal: 18, paddingBottom: 20, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, gap: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  hello: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 14 },
  name: { color: C.onNight, fontFamily: F.display, fontSize: 38, lineHeight: 42 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  online: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  onlineOn: { borderColor: 'rgba(61,214,140,0.5)', backgroundColor: 'rgba(61,214,140,0.10)' },
  onlineTitle: { color: C.onNight, fontFamily: F.bold, fontSize: 15 },
  onlineSub: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 12 },
  earnRow: { flexDirection: 'row', gap: 8 },
  earn: { flex: 1, borderRadius: 16, padding: 12, gap: 3, backgroundColor: 'rgba(255,255,255,0.06)' },
  earnValue: { color: C.onNight, fontFamily: F.heavy, fontSize: 17 },
  earnLabel: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 10 },
  payout: { color: C.gold, fontFamily: F.bold, fontSize: 12 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  demandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  demandTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.cardAlt, overflow: 'hidden' },
  demandBar: { height: 8, borderRadius: 4, backgroundColor: C.accent },
  demandCount: { fontFamily: F.bold, color: C.ink, width: 24, textAlign: 'right' },
  sosBtn: { width: 48, borderRadius: 16, backgroundColor: '#e5484d', alignItems: 'center', justifyContent: 'center' },
  offer: { backgroundColor: C.night, borderRadius: 24, padding: 18, gap: 8, borderWidth: 1, borderColor: 'rgba(255,232,196,0.5)', ...shadow },
  offerKicker: { color: C.gold, fontFamily: F.heavy, fontSize: 11, letterSpacing: 1 },
  offerSecs: { color: C.onNight, fontFamily: F.heavy, fontSize: 14 },
  offerTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  offerBar: { height: 4, backgroundColor: C.gold },
  offerEarn: { color: C.onNight, fontFamily: F.display, fontSize: 48, lineHeight: 52, marginTop: 4 },
  offerService: { color: C.onNight, fontFamily: F.bold, fontSize: 15 },
  offerMeta: { color: C.onNightMuted, fontFamily: F.medium, fontSize: 13, flexShrink: 1 },
  decline: { flex: 1, borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' },
  declineText: { color: C.onNight, fontFamily: F.bold },
  accept: { flex: 2, borderRadius: 16, paddingVertical: 15, alignItems: 'center', backgroundColor: '#3dd68c' },
  acceptText: { color: '#2a2523', fontFamily: F.heavy, fontSize: 16 },
  overlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modal: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.border },
  codeInput: {
    fontFamily: F.heavy, fontSize: 40, letterSpacing: 18, textAlign: 'center', color: C.ink, backgroundColor: C.card,
    borderRadius: 18, borderWidth: 1.5, borderColor: C.border, paddingVertical: 14
  }
});
