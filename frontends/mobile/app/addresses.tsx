import { useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Home, LocateFixed, MapPin, Pencil, Plus, Trash2 } from 'lucide-react-native';
import type { SavedAddress } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { problem, useMe } from '@/lib/market';
import { Badge, BottomSheet, Btn, Card, Empty, Meta, Note, Screen, Title, TopBar, mk } from '@/lib/marketUI';
import { PressScale, Skeleton, success } from '@/lib/motion';
import { C, F, ui } from '@/lib/theme';

type Draft = { _id?: string; label: string; street: string; landmark: string; city: string; state: string; pincode: string; lat?: number; lng?: number; isDefault: boolean };
const EMPTY: Draft = { label: 'Home', street: '', landmark: '', city: '', state: '', pincode: '', isDefault: false };

/** Address book: where visits, collections and deliveries go (each address keeps a map pin). */
export default function Addresses() {
  const { me, signedIn, reload } = useMe();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState('');

  if (!signedIn) return <View style={ui.screen}><TopBar title="Saved addresses" /><Empty title="Sign in to save addresses" action={<Btn label="Sign In" onPress={() => router.push('/welcome')} />} /></View>;

  const edit = (a?: SavedAddress) => {
    setErr('');
    setDraft(a ? {
      _id: a._id, label: a.label || '', street: a.street || '', landmark: a.landmark || '', city: a.city || '', state: a.state || '', pincode: a.pincode || '',
      lat: a.coordinates?.lat, lng: a.coordinates?.lng, isDefault: Boolean(a.isDefault)
    } : { ...EMPTY, isDefault: !(me?.savedAddresses || []).length });
  };

  const locate = async () => {
    if (!draft) return;
    setLocating(true);
    setErr('');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setErr('Allow location to pin this address, or type it in and we’ll find it on the map.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const [a] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
      setDraft((d) => d && ({
        ...d, lat, lng,
        street: d.street || [a?.name, a?.street, a?.district].filter(Boolean).join(', '),
        city: d.city || a?.city || a?.subregion || '',
        state: d.state || a?.region || '',
        pincode: d.pincode || a?.postalCode || ''
      }));
    } catch {
      setErr('Couldn’t get your location. Type the address instead.');
    } finally { setLocating(false); }
  };

  const save = async () => {
    if (!draft) return;
    if (draft.street.trim().length < 3 || !draft.city.trim() || !draft.state.trim() || !/^\d{6}$/.test(draft.pincode.trim())) {
      setErr('Add the street, city, state and a 6-digit PIN code.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      let { lat, lng } = draft;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        // No pin yet: find the typed address on the map (needed for travel fees and coverage).
        const hits = await Location.geocodeAsync(`${draft.street}, ${draft.city}, ${draft.state} ${draft.pincode}, India`).catch(() => []);
        if (hits[0]) { lat = hits[0].latitude; lng = hits[0].longitude; }
      }
      const body = {
        label: draft.label.trim() || undefined, street: draft.street.trim(), landmark: draft.landmark.trim() || undefined,
        city: draft.city.trim(), state: draft.state.trim(), pincode: draft.pincode.trim(), isDefault: draft.isDefault,
        ...(Number.isFinite(lat) && Number.isFinite(lng) ? { coordinates: { lat: lat as number, lng: lng as number } } : {})
      };
      if (draft._id) await api.updateAddress(draft._id, body); else await api.addAddress(body);
      success();
      setDraft(null);
      await reload();
    } catch (e) { setErr(problem(e).message); } finally { setSaving(false); }
  };

  const remove = (a: SavedAddress) => appAlert('Delete this address?', [a.label, a.street].filter(Boolean).join(': '), [
    { text: 'Keep', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { api.deleteAddress(String(a._id)).then(reload).catch((e) => appAlert('Couldn’t delete', problem(e).message)); } }
  ]);

  const list = me?.savedAddresses;
  return (
    <Screen header={<TopBar title="Saved addresses" right={<Btn small icon={Plus} label="Add" onPress={() => edit()} />} />}>
      {!me ? [0, 1].map((i) => <Skeleton key={i} height={90} radius={22} />) : null}
      {me && !list?.length ? <Empty title="No saved addresses" text="Save home, office or your parents’ place to book visits in one tap." action={<Btn icon={Plus} label="Add Address" onPress={() => edit()} />} /> : null}
      {list?.map((a) => {
        const pinned = Number.isFinite(Number(a.coordinates?.lat));
        return (
          <Card key={a._id} style={{ gap: 10 }}>
            <View style={mk.row}>
              <View style={mk.tile}>{a.label?.toLowerCase() === 'home' ? <Home size={20} color={C.brand} /> : <MapPin size={20} color={C.brand} />}</View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{a.label || 'Address'}</Text>
                <Meta>{[a.street, a.landmark, a.city, a.pincode].filter(Boolean).join(', ')}</Meta>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {a.isDefault ? <Badge tone="red" label="Default" /> : null}
                  {!pinned ? <Badge tone="amber" label="No map pin: edit to add" /> : null}
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn small variant="soft" icon={Pencil} label="Edit" onPress={() => edit(a)} />
              <Btn small variant="ghost" icon={Trash2} label="Delete" onPress={() => remove(a)} />
            </View>
          </Card>
        );
      })}

      <BottomSheet visible={Boolean(draft)} onClose={() => setDraft(null)} title={draft?._id ? 'Edit address' : 'New address'}>
        {draft ? (
          <View style={{ gap: 10 }}>
            <Btn variant={Number.isFinite(draft.lat) ? 'soft' : 'dark'} icon={LocateFixed} label={locating ? 'Locating…' : Number.isFinite(draft.lat) ? 'Pinned. Re-pin to My Location' : 'Use My Location'} loading={locating} onPress={locate} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['Home', 'Work', 'Parents'].map((l) => (
                <PressScale key={l} onPress={() => setDraft({ ...draft, label: l })} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: draft.label === l ? C.brand : C.card, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ color: draft.label === l ? '#ffffff' : C.inkSoft, fontFamily: F.bold, fontSize: 13 }}>{l}</Text>
                </PressScale>
              ))}
            </View>
            <TextInput style={ui.input} placeholder="House / flat, street, area" placeholderTextColor={C.muted} value={draft.street} onChangeText={(street) => setDraft({ ...draft, street })} accessibilityLabel="Street" />
            <TextInput style={ui.input} placeholder="Landmark (optional)" placeholderTextColor={C.muted} value={draft.landmark} onChangeText={(landmark) => setDraft({ ...draft, landmark })} accessibilityLabel="Landmark" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={[ui.input, { flex: 1 }]} placeholder="City" placeholderTextColor={C.muted} value={draft.city} onChangeText={(city) => setDraft({ ...draft, city })} accessibilityLabel="City" />
              <TextInput style={[ui.input, { width: 120 }]} placeholder="PIN code" placeholderTextColor={C.muted} keyboardType="number-pad" maxLength={6} value={draft.pincode} onChangeText={(pincode) => setDraft({ ...draft, pincode: pincode.replace(/\D/g, '') })} accessibilityLabel="PIN code" />
            </View>
            <TextInput style={ui.input} placeholder="State" placeholderTextColor={C.muted} value={draft.state} onChangeText={(state) => setDraft({ ...draft, state })} accessibilityLabel="State" />
            <View style={[mk.row, { justifyContent: 'space-between' }]}>
              <Title size={15}>Use as default</Title>
              <Switch value={draft.isDefault} onValueChange={(isDefault) => setDraft({ ...draft, isDefault })} trackColor={{ true: C.brand, false: C.faint }} thumbColor="#ffffff" accessibilityLabel="Use as default" />
            </View>
            {err ? <Note>{err}</Note> : null}
            <Btn label={saving ? 'Saving…' : 'Save Address'} loading={saving} onPress={save} />
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
